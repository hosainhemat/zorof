// -----------------------------------------------------------------
// ظرف من — فروشگاه اصلی
// -----------------------------------------------------------------

let PRODUCTS = [];
let CATEGORIES = [];
let cart = JSON.parse(localStorage.getItem("zorof_cart") || "{}");
let favorites = JSON.parse(localStorage.getItem("zorof_favorites") || "[]");
let activeCategory = "همه";
let searchQuery = "";
let buyerLocation = JSON.parse(localStorage.getItem("zorof_location") || "null");
let selectedCity = localStorage.getItem("zorof_city") || "";
let verifiedPhone = localStorage.getItem("zorof_phone") || "";
let pendingOtpCode = null;
let pendingPhone = "";

const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const catIconsEl = document.getElementById("catIcons");
const sideCategoryListEl = document.getElementById("sideCategoryList");
const featuredSection = document.getElementById("featuredSection");
const featuredScroll = document.getElementById("featuredScroll");
const toastEl = document.getElementById("toast");

function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }
function saveCart() { localStorage.setItem("zorof_cart", JSON.stringify(cart)); }
function saveFavorites() { localStorage.setItem("zorof_favorites", JSON.stringify(favorites)); }

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

// -------------------- تم (رنگی / مشکی) --------------------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "black" ? "dark" : "light");
}
db.collection("settings").doc("site").onSnapshot(doc => {
  applyTheme(doc.exists ? (doc.data().theme || "color") : "color");
}, () => applyTheme("color"));

// -------------------- جستجو --------------------
const searchBtn = document.getElementById("searchBtn");
const searchBar = document.getElementById("searchBar");
const searchInput = document.getElementById("searchInput");
searchBtn.onclick = () => { searchBar.classList.toggle("hidden"); if (!searchBar.classList.contains("hidden")) searchInput.focus(); };
searchInput.oninput = () => { searchQuery = searchInput.value.trim(); renderGrid(); };

// -------------------- منوی دسته‌بندی --------------------
const menuBtn = document.getElementById("menuBtn");
const sideOverlay = document.getElementById("sideOverlay");
const sideMenu = document.getElementById("sideMenu");
const closeSideMenu = document.getElementById("closeSideMenu");
function openSideMenu() { sideOverlay.classList.add("open"); sideMenu.classList.add("open"); }
function closeSideMenuFn() { sideOverlay.classList.remove("open"); sideMenu.classList.remove("open"); }
menuBtn.onclick = openSideMenu;
closeSideMenu.onclick = closeSideMenuFn;
sideOverlay.onclick = closeSideMenuFn;

function renderCategoryUI() {
  const names = ["همه", ...CATEGORIES.map(c => c.name)];
  // فیلتر بالای صفحه
  filtersEl.innerHTML = "";
  names.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "chip" + (name === activeCategory ? " active" : "");
    btn.textContent = name;
    btn.onclick = () => { activeCategory = name; renderCategoryUI(); renderGrid(); };
    filtersEl.appendChild(btn);
  });
  // منوی کشویی
  sideCategoryListEl.innerHTML = "";
  names.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "side-cat-item" + (name === activeCategory ? " active" : "");
    btn.textContent = name;
    btn.onclick = () => { activeCategory = name; renderCategoryUI(); renderGrid(); closeSideMenuFn(); };
    sideCategoryListEl.appendChild(btn);
  });
  // ردیف آیکون‌ها (فقط دسته‌های واقعی، بدون «همه»)
  catIconsEl.innerHTML = "";
  CATEGORIES.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "cat-icon-item";
    btn.innerHTML = `<span class="cat-icon-circle">${c.icon || "🍽️"}</span><span>${c.name}</span>`;
    btn.onclick = () => { activeCategory = c.name; renderCategoryUI(); renderGrid(); };
    catIconsEl.appendChild(btn);
  });
}

function listenCategories() {
  db.collection("categories").orderBy("order", "asc").onSnapshot(snap => {
    CATEGORIES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategoryUI();
  }, err => console.error(err));
}

// -------------------- شهر / موقعیت مکانی --------------------
const cityBtn = document.getElementById("cityBtn");
const cityBtnLabel = document.getElementById("cityBtnLabel");
const cityOverlay = document.getElementById("cityOverlay");
const cityModal = document.getElementById("cityModal");
const closeCityModal = document.getElementById("closeCityModal");
const useLocationBtn = document.getElementById("useLocationBtn");
const citySearch = document.getElementById("citySearch");
const cityListEl = document.getElementById("cityList");

function updateCityBtnLabel() { cityBtnLabel.textContent = buyerLocation ? "نزدیک من" : (selectedCity || "انتخاب شهر"); }
function renderCityList(filter) {
  const q = (filter || "").trim();
  const list = IRAN_CITIES.filter(c => !q || c.includes(q));
  cityListEl.innerHTML = "";
  list.forEach(city => {
    const item = document.createElement("button");
    item.className = "city-item" + (city === selectedCity ? " active" : "");
    item.textContent = city;
    item.onclick = () => {
      selectedCity = city; buyerLocation = null;
      localStorage.setItem("zorof_city", city); localStorage.removeItem("zorof_location");
      updateCityBtnLabel(); closeCityModalFn(); renderGrid();
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
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      buyerLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      selectedCity = "";
      localStorage.setItem("zorof_location", JSON.stringify(buyerLocation));
      localStorage.removeItem("zorof_city");
      updateCityBtnLabel(); closeCityModalFn(); renderGrid();
      showToast("محصولات بر اساس نزدیکی مرتب شدند");
    },
    () => showToast("دسترسی به موقعیت مکانی رد شد")
  );
};

// -------------------- محصولات --------------------
function getSortedProducts() {
  let items = PRODUCTS.filter(p => activeCategory === "همه" || p.category === activeCategory);
  if (searchQuery) items = items.filter(p => (p.name || "").includes(searchQuery) || (p.desc || "").includes(searchQuery));
  if (buyerLocation) {
    items = items.map(p => ({ ...p, _distance: (p.supplierLat != null) ? distanceKm(buyerLocation.lat, buyerLocation.lng, p.supplierLat, p.supplierLng) : null }));
    items.sort((a, b) => (a._distance ?? 1e9) - (b._distance ?? 1e9));
  } else if (selectedCity) {
    items = [...items].sort((a, b) => (a.supplierCity === selectedCity ? 0 : 1) - (b.supplierCity === selectedCity ? 0 : 1));
  }
  return items;
}

function productImage(p) {
  if (p.images && p.images.length) return p.images[0];
  return p.imageUrl || null;
}

function renderFeatured() {
  const items = PRODUCTS.filter(p => p.featured);
  if (items.length === 0) { featuredSection.classList.add("hidden"); return; }
  featuredSection.classList.remove("hidden");
  featuredScroll.innerHTML = "";
  items.forEach(p => {
    const img = productImage(p);
    const card = document.createElement("div");
    card.className = "featured-card";
    card.innerHTML = `
      ${img ? `<img src="${img}" alt="${p.name}">` : `<div style="height:90px;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg)">🍽️</div>`}
      <div class="fc-body"><div class="fc-name">${p.name}</div><div class="fc-price">${toman(p.price)}</div></div>
    `;
    card.onclick = () => addToCart(p.id);
    featuredScroll.appendChild(card);
  });
}

function renderGrid() {
  grid.innerHTML = "";
  if (PRODUCTS.length === 0) { grid.innerHTML = `<p class="grid-empty">هنوز محصولی ثبت نشده است.</p>`; return; }
  const items = getSortedProducts();
  if (items.length === 0) { grid.innerHTML = `<p class="grid-empty">چیزی پیدا نشد.</p>`; return; }

  items.forEach(p => {
    const img = productImage(p);
    const card = document.createElement("div");
    card.className = "card";
    const media = img ? `<img src="${img}" alt="${p.name}" loading="lazy">` : `<div class="card-media-fallback">🍽️</div>`;
    let tag = "";
    if (p._distance != null) tag = `<div class="distance-tag">${p._distance < 1 ? "کمتر از ۱" : p._distance.toFixed(1)} کیلومتر با شما فاصله دارد</div>`;
    else if (p.supplierCity) tag = `<div class="distance-tag">${p.supplierCity}</div>`;

    const outOfStock = (p.stock != null && p.stock <= 0);
    const addBtn = outOfStock ? `<button class="add-btn" disabled style="opacity:.4">✕</button>` : `<button class="add-btn" aria-label="افزودن">+</button>`;
    const stockTag = outOfStock ? `<div class="stock-tag out">ناموجود</div>` : "";
    const isFav = favorites.includes(p.id);

    card.innerHTML = `
      <button class="favorite-btn" data-fav="${p.id}">${isFav ? "❤️" : "🤍"}</button>
      <div class="card-media">${media}</div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-desc">${p.desc || ""}</div>
        ${tag}${stockTag}
        <div class="card-bottom"><span class="card-price">${toman(p.price)}</span>${addBtn}</div>
      </div>
    `;
    card.querySelector(".favorite-btn").onclick = (e) => { e.stopPropagation(); toggleFavorite(p.id); };
    if (!outOfStock) card.querySelector(".add-btn").onclick = () => addToCart(p.id);
    grid.appendChild(card);
  });
}

function toggleFavorite(id) {
  if (favorites.includes(id)) favorites = favorites.filter(x => x !== id);
  else favorites.push(id);
  saveFavorites();
  renderGrid();
  if (!document.getElementById("accountModal").classList.contains("hidden")) renderMyFavorites();
}

function addToCart(id) { cart[id] = (cart[id] || 0) + 1; saveCart(); renderCart(); showToast("به سبد اضافه شد"); }
function changeQty(id, delta) { cart[id] = (cart[id] || 0) + delta; if (cart[id] <= 0) delete cart[id]; saveCart(); renderCart(); }

const cartItemsEl = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");
const bottomCartCount = document.getElementById("bottomCartCount");

function renderCart() {
  const ids = Object.keys(cart);
  const count = ids.reduce((sum, id) => sum + cart[id], 0);
  bottomCartCount.textContent = count > 0 ? `سبد (${count.toLocaleString("fa-IR")})` : "سبد خرید";

  if (ids.length === 0) { cartItemsEl.innerHTML = `<p class="cart-empty">سبد خرید شما خالی است</p>`; cartTotalEl.textContent = toman(0); return; }
  let total = 0;
  cartItemsEl.innerHTML = "";
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id == id);
    if (!p) return;
    const qty = cart[id];
    total += p.price * qty;
    const img = productImage(p);
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      ${img ? `<img src="${img}" alt="${p.name}">` : `<div class="cart-item-emoji">🍽️</div>`}
      <div class="cart-item-info"><div class="cart-item-name">${p.name}</div><div class="cart-item-price">${toman(p.price)}</div></div>
      <div class="qty"><button data-d="-1">−</button><span>${qty}</span><button data-d="1">+</button></div>
    `;
    row.querySelectorAll("button").forEach(btn => { btn.onclick = () => changeQty(id, parseInt(btn.dataset.d)); });
    cartItemsEl.appendChild(row);
  });
  cartTotalEl.textContent = toman(total);
}

// -------------------- کشو سبد / ویزارد --------------------
const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const closeCart = document.getElementById("closeCart");
const cartStepTitle = document.getElementById("cartStepTitle");
const steps = { cart: document.getElementById("stepCart"), phone: document.getElementById("stepPhone"), review: document.getElementById("stepReview"), success: document.getElementById("stepSuccess") };
const titles = { cart: "سبد خرید", phone: "تایید شماره تماس", review: "بازبینی و پرداخت", success: "سفارش ثبت شد" };

function showStep(key) {
  Object.keys(steps).forEach(k => steps[k].classList.toggle("hidden", k !== key));
  cartStepTitle.textContent = titles[key];
}
function openCart() { cartDrawer.classList.add("open"); cartOverlay.classList.add("open"); showStep("cart"); }
function closeCartFn() { cartDrawer.classList.remove("open"); cartOverlay.classList.remove("open"); }
closeCart.onclick = closeCartFn;
cartOverlay.onclick = closeCartFn;

document.getElementById("goToPhoneBtn").onclick = () => {
  if (Object.keys(cart).length === 0) { showToast("سبد خرید خالی است"); return; }
  if (verifiedPhone) { renderReview(); showStep("review"); return; }
  showStep("phone");
};
document.getElementById("backToCartBtn").onclick = () => showStep("cart");

// -------------------- تایید شماره (کد آزمایشی تا اتصال پیامک) --------------------
function generateOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }

document.getElementById("sendCodeBtn").onclick = () => {
  const phone = document.getElementById("buyerPhone").value.trim();
  if (!phone) { showToast("شماره تماس را وارد کنید"); return; }
  pendingPhone = phone;
  pendingOtpCode = generateOtp();
  document.getElementById("otpBox").classList.remove("hidden");
  document.getElementById("devCodeNote").textContent = `⚠️ حالت آزمایشی (پیامک هنوز وصل نیست) — کد شما: ${pendingOtpCode}`;
};
document.getElementById("verifyCodeBtn").onclick = () => {
  const code = document.getElementById("otpInput").value.trim();
  if (code !== pendingOtpCode) { showToast("کد وارد‌شده درست نیست"); return; }
  verifiedPhone = pendingPhone;
  localStorage.setItem("zorof_phone", verifiedPhone);
  renderReview();
  showStep("review");
};

const reviewItemsEl = document.getElementById("reviewItems");
const reviewTotalEl = document.getElementById("reviewTotal");
function renderReview() {
  const ids = Object.keys(cart);
  let total = 0;
  reviewItemsEl.innerHTML = "";
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id == id);
    if (!p) return;
    const qty = cart[id];
    total += p.price * qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<div class="cart-item-info"><div class="cart-item-name">${p.name} × ${qty}</div></div><div class="cart-item-price">${toman(p.price * qty)}</div>`;
    reviewItemsEl.appendChild(row);
  });
  reviewTotalEl.textContent = toman(total);
}

// -------------------- ثبت سفارش نهایی --------------------
async function buildSupplierQueue() {
  const queue = [];
  const adminSnap = await db.collection("admins").limit(1).get();
  let adminUid = null;
  if (!adminSnap.empty) { adminUid = adminSnap.docs[0].id; queue.push(adminUid); }
  const suppliersSnap = await db.collection("suppliers").where("status", "==", "approved").get();
  let others = suppliersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(s => s.uid !== adminUid);
  if (buyerLocation) {
    others = others.map(s => ({ ...s, _dist: (s.lat != null) ? distanceKm(buyerLocation.lat, buyerLocation.lng, s.lat, s.lng) : 1e9 })).sort((a, b) => a._dist - b._dist);
  } else if (selectedCity) {
    others = others.sort((a, b) => (a.city === selectedCity ? 0 : 1) - (b.city === selectedCity ? 0 : 1));
  }
  others.forEach(s => queue.push(s.uid));
  return queue;
}

document.getElementById("payBtn").onclick = async () => {
  const btn = document.getElementById("payBtn");
  btn.disabled = true; btn.textContent = "در حال ثبت...";
  try {
    const queue = await buildSupplierQueue();
    if (queue.length === 0) { showToast("در حال حاضر هیچ تامین‌کننده‌ای فعال نیست"); return; }
    const ids = Object.keys(cart);
    const items = ids.map(id => { const p = PRODUCTS.find(x => x.id == id); return p ? { productId: p.id, name: p.name, qty: cart[id], price: p.price } : null; }).filter(Boolean);
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    const orderData = {
      items, total, buyerPhone: verifiedPhone,
      buyerAddress: document.getElementById("buyerAddress").value.trim() || null,
      buyerCity: selectedCity || null,
      queue, rejections: {}, assignedTo: null, status: "pending",
      createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (buyerLocation) { orderData.buyerLat = buyerLocation.lat; orderData.buyerLng = buyerLocation.lng; }
    const ref = await db.collection("orders").add(orderData);

    document.getElementById("trackingCode").textContent = ref.id.slice(-8).toUpperCase();
    showStep("success");
    cart = {}; saveCart(); renderCart();
    document.getElementById("buyerAddress").value = "";
  } catch (err) {
    console.error(err);
    showToast("خطا در ثبت سفارش، دوباره تلاش کنید");
  } finally {
    btn.disabled = false; btn.textContent = "پرداخت و ثبت نهایی سفارش";
  }
};
document.getElementById("closeSuccessBtn").onclick = closeCartFn;

// -------------------- حساب من --------------------
const accountOverlay = document.getElementById("accountOverlay");
const accountModal = document.getElementById("accountModal");
function openAccount() {
  accountOverlay.classList.add("open"); accountModal.classList.add("open");
  if (verifiedPhone) showAccountLoggedIn(); else showAccountLoggedOut();
}
function closeAccount() { accountOverlay.classList.remove("open"); accountModal.classList.remove("open"); }
document.getElementById("closeAccountModal").onclick = closeAccount;
accountOverlay.onclick = closeAccount;

function showAccountLoggedOut() {
  document.getElementById("accountLoggedOut").classList.remove("hidden");
  document.getElementById("accountLoggedIn").classList.add("hidden");
}
function showAccountLoggedIn() {
  document.getElementById("accountLoggedOut").classList.add("hidden");
  document.getElementById("accountLoggedIn").classList.remove("hidden");
  document.getElementById("accountPhoneLabel").textContent = verifiedPhone;
  loadMyOrders();
  renderMyFavorites();
}

document.getElementById("accountSendCodeBtn").onclick = () => {
  const phone = document.getElementById("accountPhone").value.trim();
  if (!phone) { showToast("شماره تماس را وارد کنید"); return; }
  pendingPhone = phone; pendingOtpCode = generateOtp();
  document.getElementById("accountOtpBox").classList.remove("hidden");
  document.getElementById("accountDevCodeNote").textContent = `⚠️ حالت آزمایشی — کد شما: ${pendingOtpCode}`;
};
document.getElementById("accountVerifyBtn").onclick = () => {
  const code = document.getElementById("accountOtpInput").value.trim();
  if (code !== pendingOtpCode) { showToast("کد اشتباه است"); return; }
  verifiedPhone = pendingPhone;
  localStorage.setItem("zorof_phone", verifiedPhone);
  showAccountLoggedIn();
};
document.getElementById("accountLogoutBtn").onclick = () => {
  verifiedPhone = ""; localStorage.removeItem("zorof_phone");
  showAccountLoggedOut();
};

function loadMyOrders() {
  const el = document.getElementById("myOrdersList");
  el.innerHTML = `<p class="my-empty">در حال بارگذاری...</p>`;
  db.collection("orders").where("buyerPhone", "==", verifiedPhone).orderBy("createdAt", "desc").limit(30).get()
    .then(snap => {
      if (snap.empty) { el.innerHTML = `<p class="my-empty">سفارشی ثبت نکرده‌اید.</p>`; return; }
      el.innerHTML = "";
      snap.docs.forEach(d => {
        const o = d.data();
        const statusMap = { pending: "در جریان", assigned: "پذیرفته‌شده", unclaimed: "در حال بررسی" };
        const row = document.createElement("div");
        row.className = "order-card";
        row.innerHTML = `
          <div class="order-head"><span class="status-badge badge-pending">${statusMap[o.status] || o.status}</span><span style="font-size:11px;color:var(--muted)">کد: ${d.id.slice(-8).toUpperCase()}</span></div>
          <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
          <div class="order-total">${toman(o.total)}</div>
        `;
        el.appendChild(row);
      });
    }).catch(err => { console.error(err); el.innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

function renderMyFavorites() {
  const el = document.getElementById("myFavoritesList");
  const items = PRODUCTS.filter(p => favorites.includes(p.id));
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">چیزی نشان نکرده‌اید.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const img = productImage(p);
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      ${img ? `<img src="${img}" alt="">` : `<div class="ph">🍽️</div>`}
      <div class="my-product-info"><div class="my-product-name">${p.name}</div><div class="my-product-price">${toman(p.price)}</div></div>
      <div class="my-product-actions"><button data-act="add">افزودن به سبد</button></div>
    `;
    row.querySelector('[data-act="add"]').onclick = () => addToCart(p.id);
    el.appendChild(row);
  });
}

// -------------------- نوار پایین --------------------
document.querySelectorAll(".bn-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".bn-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const key = btn.dataset.bn;
    if (key === "home") window.scrollTo({ top: 0, behavior: "smooth" });
    else if (key === "categories") openSideMenu();
    else if (key === "cart") openCart();
    else if (key === "account") openAccount();
  };
});

// -------------------- خواندن زنده محصولات --------------------
function startProductListener() {
  if (typeof db === "undefined") { grid.innerHTML = `<p class="grid-empty">اتصال به دیتابیس برقرار نیست.</p>`; return; }
  db.collection("products").where("status", "==", "approved").orderBy("createdAt", "desc").onSnapshot(
    (snapshot) => {
      PRODUCTS = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderFeatured(); renderGrid(); renderCart();
    },
    (err) => { console.error(err); grid.innerHTML = `<p class="grid-empty">خطا در بارگذاری محصولات.</p>`; }
  );
}

updateCityBtnLabel();
listenCategories();
renderGrid();
renderCart();
startProductListener();
