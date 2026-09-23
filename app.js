// -----------------------------------------------------------------
// ظرف من — فروشگاه اصلی
// محصولات زنده از Firestore خوانده می‌شوند. با ثبت سفارش، یک سفارش
// واحد ساخته می‌شود که به‌صورت صف (اول خود مدیر، بعد نزدیک‌ترین
// تامین‌کننده‌های تاییدشده) به تامین‌کنندگان پیشنهاد داده می‌شود.
// -----------------------------------------------------------------

let PRODUCTS = [];
let cart = JSON.parse(localStorage.getItem("zorof_cart") || "{}");
let activeCategory = "همه";
let buyerLocation = JSON.parse(localStorage.getItem("zorof_location") || "null");
let selectedCity = localStorage.getItem("zorof_city") || "";

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
const buyerPhoneEl = document.getElementById("buyerPhone");
const buyerAddressEl = document.getElementById("buyerAddress");

const cityBtn = document.getElementById("cityBtn");
const cityBtnLabel = document.getElementById("cityBtnLabel");
const cityOverlay = document.getElementById("cityOverlay");
const cityModal = document.getElementById("cityModal");
const closeCityModal = document.getElementById("closeCityModal");
const useLocationBtn = document.getElementById("useLocationBtn");
const citySearch = document.getElementById("citySearch");
const cityListEl = document.getElementById("cityList");

function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }
function saveCart() { localStorage.setItem("zorof_cart", JSON.stringify(cart)); }

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -------------------- شهر / موقعیت مکانی --------------------
function updateCityBtnLabel() {
  cityBtnLabel.textContent = buyerLocation ? "نزدیک من" : (selectedCity || "انتخاب شهر");
}

function renderCityList(filter) {
  const q = (filter || "").trim();
  const list = IRAN_CITIES.filter(c => !q || c.includes(q));
  cityListEl.innerHTML = "";
  list.forEach(city => {
    const item = document.createElement("button");
    item.className = "city-item" + (city === selectedCity ? " active" : "");
    item.textContent = city;
    item.onclick = () => {
      selectedCity = city;
      buyerLocation = null;
      localStorage.setItem("zorof_city", city);
      localStorage.removeItem("zorof_location");
      updateCityBtnLabel();
      closeCityModalFn();
      renderGrid();
    };
    cityListEl.appendChild(item);
  });
}

function openCityModal() { cityOverlay.classList.add("open"); cityModal.classList.add("open"); citySearch.value = ""; renderCityList(""); }
function closeCityModalFn() { cityOverlay.classList.remove("open"); cityModal.classList.remove("open"); }

cityBtn.onclick = openCityModal;
closeCityModal.onclick = closeCityModalFn;
cityOverlay.onclick = closeCityModalFn;
citySearch.oninput = () => renderCityList(citySearch.value);

useLocationBtn.onclick = () => {
  if (!navigator.geolocation) { showToast("مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند"); return; }
  useLocationBtn.textContent = "در حال دریافت موقعیت...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      buyerLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      selectedCity = "";
      localStorage.setItem("zorof_location", JSON.stringify(buyerLocation));
      localStorage.removeItem("zorof_city");
      updateCityBtnLabel();
      closeCityModalFn();
      renderGrid();
      showToast("محصولات بر اساس نزدیکی مرتب شدند");
    },
    () => { showToast("دسترسی به موقعیت مکانی رد شد"); useLocationBtn.textContent = "استفاده از موقعیت مکانی من (نزدیک‌ترین محصولات)"; }
  );
};

// -------------------- فیلتر دسته‌بندی --------------------
function renderFilters() {
  const cats = ["همه", ...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
  filtersEl.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => { activeCategory = cat; renderFilters(); renderGrid(); };
    filtersEl.appendChild(btn);
  });
}

function getSortedProducts() {
  let items = PRODUCTS.filter(p => activeCategory === "همه" || p.category === activeCategory);
  if (buyerLocation) {
    items = items.map(p => {
      const dist = (p.supplierLat != null && p.supplierLng != null)
        ? distanceKm(buyerLocation.lat, buyerLocation.lng, p.supplierLat, p.supplierLng) : null;
      return { ...p, _distance: dist };
    });
    items.sort((a, b) => (a._distance ?? 1e9) - (b._distance ?? 1e9));
  } else if (selectedCity) {
    items = [...items].sort((a, b) => (a.supplierCity === selectedCity ? 0 : 1) - (b.supplierCity === selectedCity ? 0 : 1));
  }
  return items;
}

function renderGrid() {
  grid.innerHTML = "";
  if (PRODUCTS.length === 0) { grid.innerHTML = `<p class="grid-empty">هنوز محصولی ثبت نشده است.</p>`; return; }

  const items = getSortedProducts();
  items.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    const media = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">` : `<div class="card-media-fallback">🍽️</div>`;
    let tag = "";
    if (p._distance != null) tag = `<div class="distance-tag">${p._distance < 1 ? "کمتر از ۱" : p._distance.toFixed(1)} کیلومتر با شما فاصله دارد</div>`;
    else if (p.supplierCity) tag = `<div class="distance-tag">${p.supplierCity}</div>`;

    const outOfStock = (p.stock != null && p.stock <= 0);
    const addBtn = outOfStock
      ? `<button class="add-btn" disabled style="opacity:.4">✕</button>`
      : `<button class="add-btn" aria-label="افزودن">+</button>`;
    const stockTag = outOfStock ? `<div class="stock-tag out">ناموجود</div>` : "";

    card.innerHTML = `
      <div class="card-media">${media}</div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-desc">${p.desc || ""}</div>
        ${tag}${stockTag}
        <div class="card-bottom">
          <span class="card-price">${toman(p.price)}</span>
          ${addBtn}
        </div>
      </div>
    `;
    if (!outOfStock) card.querySelector(".add-btn").onclick = () => addToCart(p.id);
    grid.appendChild(card);
  });
}

function addToCart(id) { cart[id] = (cart[id] || 0) + 1; saveCart(); renderCart(); showToast("به سبد اضافه شد"); }
function changeQty(id, delta) { cart[id] = (cart[id] || 0) + delta; if (cart[id] <= 0) delete cart[id]; saveCart(); renderCart(); }

function renderCart() {
  const ids = Object.keys(cart);
  cartCountEl.textContent = ids.reduce((sum, id) => sum + cart[id], 0);
  if (ids.length === 0) { cartItemsEl.innerHTML = `<p class="cart-empty">سبد خرید شما خالی است</p>`; cartTotalEl.textContent = toman(0); return; }

  let total = 0;
  cartItemsEl.innerHTML = "";
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id == id);
    if (!p) return;
    const qty = cart[id];
    total += p.price * qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    const thumb = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}">` : `<div class="cart-item-emoji">🍽️</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">${toman(p.price)}</div>
      </div>
      <div class="qty"><button data-d="-1">−</button><span>${qty}</span><button data-d="1">+</button></div>
    `;
    row.querySelectorAll("button").forEach(btn => { btn.onclick = () => changeQty(id, parseInt(btn.dataset.d)); });
    cartItemsEl.appendChild(row);
  });
  cartTotalEl.textContent = toman(total);
}

function openCart() { cartDrawer.classList.add("open"); cartOverlay.classList.add("open"); }
function closeCartFn() { cartDrawer.classList.remove("open"); cartOverlay.classList.remove("open"); }
cartBtn.onclick = openCart;
closeCart.onclick = closeCartFn;
cartOverlay.onclick = closeCartFn;

// -------------------- ثبت سفارش (صف هدایت به تامین‌کنندگان) --------------------
async function buildSupplierQueue() {
  // مدیر همیشه اول صف است
  const queue = [];
  const adminSnap = await db.collection("admins").limit(1).get();
  let adminUid = null;
  if (!adminSnap.empty) { adminUid = adminSnap.docs[0].id; queue.push(adminUid); }

  const suppliersSnap = await db.collection("suppliers").where("status", "==", "approved").get();
  let others = suppliersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(s => s.uid !== adminUid);

  if (buyerLocation) {
    others = others.map(s => ({
      ...s,
      _dist: (s.lat != null && s.lng != null) ? distanceKm(buyerLocation.lat, buyerLocation.lng, s.lat, s.lng) : 1e9
    })).sort((a, b) => a._dist - b._dist);
  } else if (selectedCity) {
    others = others.sort((a, b) => (a.city === selectedCity ? 0 : 1) - (b.city === selectedCity ? 0 : 1));
  }

  others.forEach(s => queue.push(s.uid));
  return queue;
}

checkoutBtn.onclick = async () => {
  const ids = Object.keys(cart);
  if (ids.length === 0) { showToast("سبد خرید خالی است"); return; }
  const phone = buyerPhoneEl.value.trim();
  if (!phone) { showToast("شماره تماس را وارد کنید"); return; }

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "در حال ثبت...";

  try {
    const queue = await buildSupplierQueue();
    if (queue.length === 0) { showToast("در حال حاضر هیچ تامین‌کننده‌ای فعال نیست"); return; }

    const items = ids.map(id => {
      const p = PRODUCTS.find(x => x.id == id);
      return p ? { productId: p.id, name: p.name, qty: cart[id], price: p.price } : null;
    }).filter(Boolean);
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);

    const orderData = {
      items, total,
      buyerPhone: phone,
      buyerAddress: buyerAddressEl.value.trim() || null,
      buyerCity: selectedCity || null,
      queue,
      rejections: {},
      assignedTo: null,
      status: "pending",
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (buyerLocation) { orderData.buyerLat = buyerLocation.lat; orderData.buyerLng = buyerLocation.lng; }

    await db.collection("orders").add(orderData);

    showToast("سفارش شما ثبت شد ✅");
    cart = {}; saveCart(); renderCart();
    buyerPhoneEl.value = ""; buyerAddressEl.value = "";
    closeCartFn();
  } catch (err) {
    console.error(err);
    showToast("خطا در ثبت سفارش، دوباره تلاش کنید");
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "ثبت سفارش";
  }
};

// -------------------- خواندن زنده محصولات --------------------
function startProductListener() {
  if (typeof db === "undefined") { grid.innerHTML = `<p class="grid-empty">اتصال به دیتابیس برقرار نیست.</p>`; return; }
  db.collection("products").where("status", "==", "approved").orderBy("createdAt", "desc").onSnapshot(
    (snapshot) => {
      PRODUCTS = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderFilters(); renderGrid(); renderCart();
    },
    (err) => { console.error(err); grid.innerHTML = `<p class="grid-empty">خطا در بارگذاری محصولات.</p>`; }
  );
}

updateCityBtnLabel();
renderFilters();
renderGrid();
renderCart();
startProductListener();
