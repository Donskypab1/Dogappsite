import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import nodemailer from "nodemailer";
import pg from "pg";
import { rateLimit } from "express-rate-limit";
import { products } from "./products.js";

const { Pool } = pg;
const backendDir = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(backendDir, "..");
const app = express();
const port = Number(process.env.PORT || 3000);
const adminKey = process.env.ADMIN_API_KEY || "";
let pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const productById = new Map(products.map((product) => [product.id, product]));
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const memoryOrders = new Map();
const memoryOrderItems = new Map();

if (adminKey && adminKey.length < 32) throw new Error("ADMIN_API_KEY must be at least 32 characters long.");
if (process.env.TRUST_PROXY_HOPS) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(hops) || hops < 1) throw new Error("TRUST_PROXY_HOPS must be a positive integer.");
  app.set("trust proxy", hops);
}

const mailConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS &&
  process.env.ORDER_NOTIFY_EMAIL && process.env.MAIL_FROM
);
const mailer = mailConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'", "mailto:"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      styleSrcAttr: ["'unsafe-inline'"]
    }
  }
}));
app.use(express.json({ limit: "16kb" }));

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many order requests. Please wait and try again." }
});

async function initializeDatabase() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_note TEXT NOT NULL DEFAULT '',
        currency CHAR(3) NOT NULL DEFAULT 'USD',
        total_cents BIGINT NOT NULL,
        notification_status TEXT NOT NULL DEFAULT 'disabled',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id BIGSERIAL PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
      )
    `);
  } catch (error) {
    console.warn("Database unavailable; switching to in-memory order storage.", error.message);
    if (pool) {
      try {
        await pool.end();
      } catch {
      }
      pool = null;
    }
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validAdminKey(value) {
  if (!adminKey || !value) return false;
  const expected = Buffer.from(adminKey);
  const provided = Buffer.from(value);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function orderText(order, items) {
  const lines = items.map((item) => `${item.quantity} x ${item.name} — ${usd.format(item.price * item.quantity)}`);
  return [
    `Order ${order.reference}`,
    `Name: ${order.name}`,
    `Email: ${order.email}`,
    ``,
    ...lines,
    ``,
    `Total: ${usd.format(order.total)}`,
    ``,
    order.note ? `Customer note: ${order.note}` : ""
  ].filter(Boolean).join("\n");
}

app.get("/api/health", async (_req, res) => {
  if (!pool) return res.json({ status: "ok", storage: "memory" });
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", storage: "postgres" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

app.get("/api/products", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(products);
});

app.post("/api/orders", orderLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 100);
    const email = cleanText(req.body?.email, 254).toLowerCase();
    const note = cleanText(req.body?.note, 1500);
    const requestedItems = req.body?.items;

    if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 20) {
      return res.status(400).json({ error: "Your bag is empty or has too many different products." });
    }

    const itemIds = new Set();
    const items = [];
    for (const requested of requestedItems) {
      const product = productById.get(requested?.productId);
      const quantity = Number(requested?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || itemIds.has(product.id)) {
        return res.status(400).json({ error: "One or more items in your bag are invalid. Please refresh and try again." });
      }
      itemIds.add(product.id);
      items.push({ id: product.id, name: product.name, quantity, price: product.price });
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCents = Math.round(total * 100);
    const id = crypto.randomUUID();
    const reference = `DF-${id.slice(0, 8).toUpperCase()}`;
    const order = { id, reference, name, email, note, total };

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO orders (id, reference, customer_name, customer_email, customer_note, total_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, reference, name, email, note, totalCents]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, item.id, item.name, item.quantity, Math.round(item.price * 100)]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } else {
      memoryOrders.set(id, {
        id,
        reference,
        customer_name: name,
        customer_email: email,
        customer_note: note,
        currency: "USD",
        total_cents: totalCents,
        notification_status: "disabled",
        created_at: new Date().toISOString()
      });
      memoryOrderItems.set(id, items.map((item) => ({
        order_id: id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price_cents: Math.round(item.price * 100)
      })));
    }

    let notificationStatus = "disabled";
    if (mailer) {
      try {
        const text = orderText(order, items);
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: process.env.ORDER_NOTIFY_EMAIL,
          replyTo: email,
          subject: `New DoggyFave order ${reference}`,
          text
        });
        notificationStatus = "sent";
        try {
          await mailer.sendMail({
            from: process.env.MAIL_FROM,
            to: email,
            subject: `We received your DoggyFave order ${reference}`,
            text: `Hi ${name},\n\nWe received your order request. No payment has been taken. The shop will contact you to confirm availability and arrange manual payment.\n\n${orderText(order, items)}\n\n${process.env.PAYMENT_INSTRUCTIONS || "Please wait for the shop to contact you before sending payment."}`
          });
        } catch (error) {
          console.error("Customer confirmation email failed:", error.message);
        }
      } catch (error) {
        notificationStatus = "failed";
        console.error("Shop order notification failed:", error.message);
      }
      if (pool) {
        await pool.query("UPDATE orders SET notification_status = $1 WHERE id = $2", [notificationStatus, id]);
      } else {
        const orderRecord = memoryOrders.get(id);
        if (orderRecord) {
          orderRecord.notification_status = notificationStatus;
          memoryOrders.set(id, orderRecord);
        }
      }
    }

    res.status(201).json({
      reference,
      total: usd.format(total),
      notificationStatus,
      message: notificationStatus === "sent"
        ? "Your request is recorded. The shop will contact you to confirm availability and arrange payment."
        : "Your request is saved, but the shop email alert is not configured. Please contact the shop and quote this reference.",
      paymentInstructions: process.env.PAYMENT_INSTRUCTIONS || "Please wait for the shop to contact you before sending payment."
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/orders", async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!validAdminKey(match?.[1])) return res.status(401).json({ error: "Unauthorized." });
  try {
    if (!pool) {
      const orderRows = [...memoryOrders.values()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100)
        .map((order) => ({
          id: order.id,
          reference: order.reference,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          customer_note: order.customer_note,
          currency: order.currency,
          total_cents: order.total_cents,
          notification_status: order.notification_status,
          created_at: order.created_at,
          total: usd.format(Number(order.total_cents) / 100),
          items: memoryOrderItems.get(order.id) || []
        }));
      return res.json(orderRows);
    }

    const ordersResult = await pool.query(
      `SELECT id, reference, customer_name, customer_email, customer_note, currency,
              total_cents, notification_status, created_at
       FROM orders ORDER BY created_at DESC LIMIT 100`
    );
    const ids = ordersResult.rows.map((order) => order.id);
    const itemResult = ids.length
      ? await pool.query(
          `SELECT order_id, product_id, product_name, quantity, unit_price_cents
           FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY id`,
          [ids]
        )
      : { rows: [] };
    const itemsByOrder = new Map();
    for (const item of itemResult.rows) {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }
    res.json(ordersResult.rows.map((order) => ({
      ...order,
      total: usd.format(Number(order.total_cents) / 100),
      items: itemsByOrder.get(order.id) || []
    })));
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (/^\/(backend|node_modules)(\/|$)/i.test(req.path)) return res.sendStatus(404);
  next();
});
app.use(express.static(siteDir, { dotfiles: "deny", index: "pet.html", fallthrough: true }));
app.use((_req, res) => res.status(404).send("Not found"));
app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

await initializeDatabase();
app.listen(port, () => console.log(`DoggyFave server listening on port ${port}`));