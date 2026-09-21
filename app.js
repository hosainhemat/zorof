// -----------------------------------------------------------------
// داده محصولات — این آرایه را با محصولات واقعی خودتان جایگزین کنید.
// image می‌تواند مسیر یک فایل عکس باشد (مثلاً "images/plate1.jpg")
// یا اگر عکس ندارید همین emoji فعلی بماند.
// -----------------------------------------------------------------
const PRODUCTS = [
  { id: 1, name: "بشقاب یک‌بارمصرف (بسته ۵۰ تایی)", price: 45000, category: "یکبار مصرف", image: "🍽️", desc: "مناسب مهمانی و مراسم" },
  { id: 2, name: "لیوان یک‌بارمصرف (بسته ۱۰۰ تایی)", price: 38000, category: "یکبار مصرف", image: "🥤", desc: "کاغذی، ضدنشت" },
  { id: 3, name: "ظرف چینی سفید ۶ تکه", price: 620000, category: "چینی و سرامیک", image: "🍜", desc: "مناسب سرو روزانه" },
  { id: 4, name: "کاسه سرامیکی دسته‌دار", price: 145000, category: "چینی و سرامیک", image: "🥣", desc: "دست‌ساز، رنگ سبز زیتونی" },
  { id: 5, name: "لیوان شیشه‌ای سِت ۶ عددی", price: 210000, category: "شیشه‌ای", image: "🥛", desc: "شیشه سکوریت مقاوم" },
  { id: 6, name: "کارد و چنگال استیل ۱۲ پارچه", price: 380000, category: "استیل", image: "🍴", desc: "استیل ضدزنگ درجه یک" },
  { id: 7, name: "سینی سرو چوبی", price: 165000, category: "چینی و سرامیک", image: "🍱", desc: "چوب طبیعی روغن‌خورده" },
  { id: 8, name: "ظرف فویل آلومینیومی (بسته ۲۰ تایی)", price: 52000, category: "یکبار مصرف", image: "🍛", desc: "مناسب فریزر و فر" },
];

const CATEGORIES = ["همه", ...new Set(PRODUCTS.map(p => p.category))];

let cart = JSON.parse(localStorage.getItem("zorof_cart") || "{}");
let activeCategory = "همه";

const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const cartBtn = document.getElementById("cartBtn");
const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const closeCart = document.getElementById("closeCart");
const cartItemsEl = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");
const cartCountEl = document.getElementById("cartCount");
const checkoutBtn = document.getElementById("checkoutBtn");
const toastEl = document.getElementById("toast");

function toman(n) {
  return n.toLocaleString("fa-IR") + " تومان";
}

function saveCart() {
  localStorage.setItem("zorof_cart", JSON.stringify(cart));
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function renderFilters() {
  filtersEl.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => { activeCategory = cat; renderFilters(); renderGrid(); };
    filtersEl.appendChild(btn);
  });
}

function renderGrid() {
  grid.innerHTML = "";
  const items = PRODUCTS.filter(p => activeCategory === "همه" || p.category === activeCategory);
  items.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-media">${p.image}</div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-desc">${p.desc}</div>
        <div class="card-bottom">
          <span class="card-price">${toman(p.price)}</span>
          <button class="add-btn" aria-label="افزودن">+</button>
        </div>
      </div>
    `;
    card.querySelector(".add-btn").onclick = () => addToCart(p.id);
    grid.appendChild(card);
  });
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCart();
  showToast("به سبد اضافه شد");
}

function changeQty(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
  renderCart();
}

function renderCart() {
  const ids = Object.keys(cart);
  cartCountEl.textContent = ids.reduce((sum, id) => sum + cart[id], 0);

  if (ids.length === 0) {
    cartItemsEl.innerHTML = `<p class="cart-empty">سبد خرید شما خالی است</p>`;
    cartTotalEl.textContent = toman(0);
    return;
  }

  let total = 0;
  cartItemsEl.innerHTML = "";
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id == id);
    if (!p) return;
    const qty = cart[id];
    total += p.price * qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item-emoji">${p.image}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">${toman(p.price)}</div>
      </div>
      <div class="qty">
        <button data-d="-1">−</button>
        <span>${qty}</span>
        <button data-d="1">+</button>
      </div>
    `;
    row.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => changeQty(id, parseInt(btn.dataset.d));
    });
    cartItemsEl.appendChild(row);
  });
  cartTotalEl.textContent = toman(total);
}

function openCart() {
  cartDrawer.classList.add("open");
  cartOverlay.classList.add("open");
}
function closeCartFn() {
  cartDrawer.classList.remove("open");
  cartOverlay.classList.remove("open");
}

cartBtn.onclick = openCart;
closeCart.onclick = closeCartFn;
cartOverlay.onclick = closeCartFn;

checkoutBtn.onclick = () => {
  if (Object.keys(cart).length === 0) {
    showToast("سبد خرید خالی است");
    return;
  }
  // فعلاً فقط پیام تایید — بعداً اینجا به درگاه پرداخت وصل می‌شود
  showToast("سفارش شما ثبت شد ✅");
  cart = {};
  saveCart();
  renderCart();
  closeCartFn();
};

renderFilters();
renderGrid();
renderCart();
