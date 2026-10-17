const products = [
	{ id: "kriath-chew", name: "Kriath Dog Nutrition Chewable Tablet", detail: "Daily nutrition chew", price: 57.99, category: "medical", badge: "Medical", image: "images/kriath dog nutrition chewable tablet dog medical biscuits.avif", alt: "Kriath dog nutrition chewable tablets" },
	{ id: "paw-cream", name: "Yegbong Pet Paw Protection Cream", detail: "Paw protection for cats and dogs", price: 20.99, category: "medical", badge: "Medical", image: "images/Yegbong pet paw protection cream for cats and dogs.avif", alt: "Yegbong pet paw protection cream" },
	{ id: "oral-spray", name: "Dog Oral Healthy Spray", detail: "Oral care", price: 50.99, category: "medical", badge: "Medical", image: "images/dog oral healthy spray.jpg", alt: "Dog oral healthy spray" },
	{ id: "multivitamin", name: "Dog Multivitamin", detail: "Daily vitamin supplement", price: 40.00, category: "medical", badge: "Medical", image: "images/Dog multivitamin.avif", alt: "Dog multivitamin" },
	{ id: "protein-cookies", name: "Smart Bone Protein Cookies", detail: "Protein dog treats", price: 20.00, category: "medical", badge: "Medical", image: "images/smart bone protein cookies.jpg", alt: "Smart Bone protein cookies" },
	{ id: "gold-necklace", name: "Dog Gold Necklace", detail: "Dog accessory", price: 150.00, category: "toys", badge: "Toys & accessories", image: "images/Dog gold necklace.jpg", alt: "Gold necklace for a dog" },
	{ id: "dog-bed", name: "Dog Bed", detail: "A cozy place to rest", price: 120.00, category: "toys", badge: "Toys & accessories", image: "images/Dog bed.jpg", alt: "Dog bed" },
	{ id: "carrier", name: "Dog Portable Carrier", detail: "Portable dog carrier", price: 150.00, category: "toys", badge: "Toys & accessories", image: "images/dog portable carrier bag2.jpg", alt: "Portable carrier for a dog" },
	{ id: "paw-washer", name: "Dog Paws Washer", detail: "For cleaner paws after walks", price: 35.99, category: "toys", badge: "Toys & accessories", image: "images/Dog paws washer.jpg", alt: "Dog paw washer" },
	{ id: "home-cage", name: "Dog Home Cage", detail: "Indoor dog enclosure", price: 100.00, category: "toys", badge: "Toys & accessories", image: "images/Dog home cage.jpg", alt: "Dog home cage" },
	{ id: "dog-necklace", name: "Dog Necklace", detail: "Dog accessory", price: 35.00, category: "toys", badge: "Toys & accessories", image: "images/Dog necklace.jpg", alt: "Necklace for a dog" },
	{ id: "outing-chain", name: "Dog Chain", detail: "Walking accessory", price: 50.99, category: "toys", badge: "Toys & accessories", image: "images/Dog outing chain.jpg", alt: "Dog outing chain" },
	{ id: "outing-bag", name: "Dog Portable Outing Bag", detail: "Carrier for trips out", price: 1000.00, category: "toys", badge: "Toys & accessories", image: "images/Dog portable outting bag.jpg", alt: "Portable dog outing bag" },
	{ id: "propean-meal", name: "Propean Dog Meal", detail: "Dog food", price: 40.00, category: "foods", badge: "Foods", image: "images/Dog propean meal.jpg", alt: "Propean dog meal" },
	{ id: "milkbone-cookies", name: "Milkbone Cookies", detail: "Dog cookies", price: 70.00, category: "foods", badge: "Foods", image: "images/milkbone cookies dog cookies.jpg", alt: "Milkbone dog cookies" },
	{ id: "royal-canin", name: "Royal Canin Crunchies", detail: "Dog food", price: 45.00, category: "foods", badge: "Foods", image: "images/Royal canin meal.jpg", alt: "Royal Canin dog food" },
	{ id: "smart-bone", name: "Smart Bone Protein Cookies", detail: "Dog treats", price: 30.00, category: "foods", badge: "Foods", image: "images/smart bone protein cookies.jpg", alt: "Smart Bone protein cookies" }
];

const grid = document.querySelector("#product-grid");
const searchInput = document.querySelector("#product-search");
const emptyState = document.querySelector("#empty-state");
const cart = new Map();
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
let activeCategory = "all";
let toastTimer;

function renderProducts() {
	const search = searchInput.value.trim().toLowerCase();
	const visibleProducts = products.filter((product) => {
		const matchesCategory = activeCategory === "all" || product.category === activeCategory;
		const matchesSearch = `${product.name} ${product.detail} ${product.category}`.toLowerCase().includes(search);
		return matchesCategory && matchesSearch;
	});

	grid.innerHTML = visibleProducts.map((product, index) => `
		<article class="product-card" style="animation-delay:${index * 45}ms">
			<div class="product-image-wrap">
				<img class="product-image" src="${product.image}" alt="${product.alt}" loading="lazy">
				<span class="product-badge">${product.badge}</span>
			</div>
			<div class="product-info">
				<div><h3 class="product-name">${product.name}</h3><p class="product-detail">${product.detail}</p></div>
				<span class="product-price">${currency.format(product.price)}</span>
			</div>
			<button class="add-button" type="button" data-add="${product.id}" aria-label="Add ${product.name} to bag">Add to bag <span aria-hidden="true">+</span></button>
		</article>`).join("");
	emptyState.hidden = visibleProducts.length !== 0;
}

function itemCount() {
	return [...cart.values()].reduce((total, quantity) => total + quantity, 0);
}

function renderCart() {
	const count = itemCount();
	const itemContainer = document.querySelector("#cart-items");
	document.querySelector("#cart-count").textContent = count;
	document.querySelector("#drawer-count").textContent = `(${count})`;
	document.querySelector("#cart-empty").hidden = count > 0;
	document.querySelector("#drawer-footer").hidden = count === 0;
	itemContainer.innerHTML = [...cart.entries()].map(([id, quantity]) => {
		const product = products.find((item) => item.id === id);
		return `<div class="cart-line">
			<img src="${product.image}" alt="" loading="lazy">
			<div><h3>${product.name}</h3><span class="cart-line-price">${currency.format(product.price)} each</span>
				<div class="quantity-control" aria-label="Quantity for ${product.name}">
					<button type="button" data-quantity="${id}" data-change="-1" aria-label="Remove one ${product.name}">−</button><span>${quantity}</span><button type="button" data-quantity="${id}" data-change="1" aria-label="Add one ${product.name}">+</button>
				</div>
			</div><button class="remove-button" type="button" data-remove="${id}" aria-label="Remove ${product.name} from bag">×</button>
		</div>`;
	}).join("");
	const subtotal = [...cart.entries()].reduce((sum, [id, quantity]) => sum + products.find((item) => item.id === id).price * quantity, 0);
	document.querySelector("#cart-subtotal").textContent = currency.format(subtotal);
}

function showToast(message) {
	const toast = document.querySelector("#toast");
	toast.textContent = message;
	toast.classList.add("is-visible");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function setCartOpen(isOpen) {
	const drawer = document.querySelector("#cart-drawer");
	const backdrop = document.querySelector("#drawer-backdrop");
	drawer.classList.toggle("is-open", isOpen);
	drawer.setAttribute("aria-hidden", String(!isOpen));
	drawer.inert = !isOpen;
	backdrop.hidden = !isOpen;
	requestAnimationFrame(() => backdrop.classList.toggle("is-open", isOpen));
	document.body.classList.toggle("has-overlay", isOpen);
	if (isOpen) document.querySelector("#close-cart").focus();
	else document.querySelector("#open-cart").focus();
}

document.querySelectorAll(".category-button").forEach((button) => {
	button.addEventListener("click", () => {
		activeCategory = button.dataset.category;
		document.querySelectorAll(".category-button").forEach((item) => {
			const isActive = item === button;
			item.classList.toggle("is-active", isActive);
			item.setAttribute("aria-pressed", String(isActive));
		});
		renderProducts();
	});
});

searchInput.addEventListener("input", renderProducts);
grid.addEventListener("click", (event) => {
	const button = event.target.closest("[data-add]");
	if (!button) return;
	cart.set(button.dataset.add, (cart.get(button.dataset.add) || 0) + 1);
	renderCart();
	showToast(`${products.find((item) => item.id === button.dataset.add).name} added to your bag`);
});

document.querySelector("#cart-items").addEventListener("click", (event) => {
	const removeButton = event.target.closest("[data-remove]");
	const quantityButton = event.target.closest("[data-quantity]");
	if (removeButton) cart.delete(removeButton.dataset.remove);
	if (quantityButton) {
		const id = quantityButton.dataset.quantity;
		const nextQuantity = (cart.get(id) || 0) + Number(quantityButton.dataset.change);
		if (nextQuantity <= 0) cart.delete(id);
		else cart.set(id, nextQuantity);
	}
	renderCart();
});

document.querySelector("#open-cart").addEventListener("click", () => setCartOpen(true));
document.querySelector("#close-cart").addEventListener("click", () => setCartOpen(false));
document.querySelector("#drawer-backdrop").addEventListener("click", () => setCartOpen(false));
document.querySelector("#keep-shopping").addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && document.querySelector("#cart-drawer").classList.contains("is-open")) setCartOpen(false);
});

document.querySelector("#start-checkout").addEventListener("click", () => {
	document.querySelector("#order-dialog").showModal();
});
document.querySelector("#close-order").addEventListener("click", () => document.querySelector("#order-dialog").close());
document.querySelector("#order-form").addEventListener("submit", (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const customerName = document.querySelector("#customer-name").value.trim();
	const customerEmail = document.querySelector("#customer-email").value.trim();
	const customerNote = document.querySelector("#customer-note").value.trim();
	const orderLines = [...cart.entries()].map(([id, quantity]) => {
		const product = products.find((item) => item.id === id);
		return `${quantity} x ${product.name} (${currency.format(product.price * quantity)})`;
	});
	const subtotal = [...cart.entries()].reduce((sum, [id, quantity]) => sum + products.find((item) => item.id === id).price * quantity, 0);
	const body = [`Hi DoggyFave,`, ``, `I'd like to request:`, ...orderLines, ``, `Subtotal: ${currency.format(subtotal)}`, ``, `Name: ${customerName}`, `Email: ${customerEmail}`, customerNote ? `Note: ${customerNote}` : "", "", "Please let me know availability, delivery, and payment details."].filter(Boolean).join("\n");
	const emailLink = `mailto:donskypablo@gmail.com?subject=${encodeURIComponent("Good Hound order request")}&body=${encodeURIComponent(body)}`;
	window.location.href = emailLink;
	document.querySelector("#form-error").hidden = true;
	document.querySelector("#order-dialog").close();
});

document.querySelector("#newsletter-form").addEventListener("submit", (event) => {
	event.preventDefault();
	const message = document.querySelector("#newsletter-message");
	message.textContent = "Thanks for joining us. Newsletter sign-up needs a mailing-list connection to go live.";
	event.currentTarget.reset();
});

document.querySelector("#year").textContent = new Date().getFullYear();
renderProducts();
renderCart();
