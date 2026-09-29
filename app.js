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
let siteAdminUid = null;
customerDb.collection("settings").doc("site").onSnapshot(doc => {
  applyTheme(doc.exists ? (doc.data().theme || "color") : "color");
  siteAdminUid = doc.exists ? (doc.data().adminUid || null) : null;
}, () => applyTheme("color"));

// نشست ناشناس مشتری: فقط برای اینکه بتواند تاریخچه سفارش‌های همین دستگاه را ببیند
let customerUid = null;
const customerReady = customerAuth.signInAnonymously()
  .then(cred => { customerUid = cred.user.uid; })
  .catch(err => console.warn("Anonymous auth غیرفعال است:", err.code));
customerAuth.onAuthStateChanged(u => { if (u) customerUid = u.uid; });

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
  customerDb.collection("categories").orderBy("order", "asc").onSnapshot(snap => {
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

    // مهم: موجودی عددی هرگز به مشتری نشان داده نمی‌شود و مانع خرید نمی‌شود.
    // فقط وقتی تامین‌کننده صریحاً «اتمام موجودی در بازار» را بزند، این پیام دیده می‌شود.
    const outOfStock = (p.available === false);
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
  checkTrustForCheckPayment();
  checkCreditEligibility();
  loadBankInfo();
}

// -------------------- روش پرداخت --------------------
let receiptPhotoFile = null;
let checkPhotoFile = null;

function loadBankInfo() {
  customerDb.collection("settings").doc("site").get().then(doc => {
    const info = doc.exists ? doc.data().bankInfo : "";
    const box = document.getElementById("bankInfoBox");
    if (info) { box.textContent = "شماره کارت/شبا برای واریز: " + info; box.classList.remove("hidden"); }
    else box.classList.add("hidden");
  }).catch(() => {});
}

function checkTrustForCheckPayment() {
  const row = document.getElementById("payCheckRadioRow");
  row.classList.add("hidden");
  if (!verifiedPhone) return;
  customerDb.collection("trustedCustomers").doc(verifiedPhone).get().then(doc => {
    if (doc.exists && (doc.data().trustedBy || []).length > 0) row.classList.remove("hidden");
  }).catch(() => {});
}

// خرید اعتباری: فقط بررسی می‌کنیم که آیا حداقل یک تامین‌کننده اعتباری برای این
// شماره ثبت کرده — سقف اعتبار هرگز به مشتری نشان داده نمی‌شود.
function checkCreditEligibility() {
  const row = document.getElementById("payCreditRadioRow");
  row.classList.add("hidden");
  if (!verifiedPhone) return;
  customerDb.collection("creditFlags").doc(verifiedPhone).get().then(doc => {
    if (doc.exists && (doc.data().suppliers || []).length > 0) row.classList.remove("hidden");
  }).catch(() => {});
}

document.querySelectorAll('input[name="payMethod"]').forEach(radio => {
  radio.onchange = () => {
    document.getElementById("receiptForm").classList.toggle("hidden", radio.value !== "receipt" || !radio.checked);
    document.getElementById("checkForm").classList.toggle("hidden", radio.value !== "check" || !radio.checked);
  };
});
document.getElementById("payReceiptRadio").onchange = () => {
  document.getElementById("receiptForm").classList.remove("hidden");
  document.getElementById("checkForm").classList.add("hidden");
};
document.getElementById("payCheckRadio").onchange = () => {
  document.getElementById("receiptForm").classList.add("hidden");
  document.getElementById("checkForm").classList.remove("hidden");
};

function wirePhotoPicker(btnId, inputId, previewRowId, onSelect) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  btn.onclick = () => input.click();
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    onSelect(file);
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById(previewRowId).innerHTML = `<div class="image-slot"><img src="${e.target.result}"></div>`;
    };
    reader.readAsDataURL(file);
  };
}
wirePhotoPicker("receiptPhotoBtn", "receiptPhotoInput", "receiptPreviewRow", (f) => receiptPhotoFile = f);
wirePhotoPicker("checkPhotoBtn", "checkPhotoInput", "checkPreviewRow", (f) => checkPhotoFile = f);

async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) throw new Error("آپلود عکس ناموفق بود");
  return (await res.json()).secure_url;
}

// -------------------- ثبت سفارش نهایی --------------------
async function buildSupplierQueue(payMethod) {
  // خرید اعتباری فقط برای تامین‌کننده‌ای است که برای این شماره اعتبار تعریف کرده
  if (payMethod === "credit") {
    const flag = await customerDb.collection("creditFlags").doc(verifiedPhone).get();
    return flag.exists ? (flag.data().suppliers || []) : [];
  }
  const queue = [];
  let adminUid = siteAdminUid;
  if (!adminUid) {
    try { const st = await customerDb.collection("settings").doc("site").get(); adminUid = st.exists ? (st.data().adminUid || null) : null; } catch (e) {}
  }
  if (adminUid) queue.push(adminUid);
  const suppliersSnap = await customerDb.collection("suppliers").where("status", "==", "approved").get();
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
  const payMethod = document.querySelector('input[name="payMethod"]:checked').value;

  if (payMethod === "receipt" && !receiptPhotoFile) { showToast("عکس فیش واریزی را اضافه کنید"); return; }
  if (payMethod === "check") {
    if (!checkPhotoFile) { showToast("عکس چک را اضافه کنید"); return; }
    if (!document.getElementById("checkBankInput").value.trim() || !document.getElementById("checkDueInput").value) {
      showToast("نام بانک و تاریخ سررسید چک را وارد کنید"); return;
    }
  }

  btn.disabled = true; btn.textContent = "در حال ثبت...";
  try {
    await customerReady;
    const queue = await buildSupplierQueue(payMethod);
    if (queue.length === 0) { showToast(payMethod === "credit" ? "اعتبار شما در حال حاضر فعال نیست" : "در حال حاضر هیچ تامین‌کننده‌ای فعال نیست"); return; }
    const ids = Object.keys(cart);
    const items = ids.map(id => { const p = PRODUCTS.find(x => x.id == id); return p ? { productId: p.id, name: p.name, qty: cart[id], price: p.price } : null; }).filter(Boolean);
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    const orderData = {
      items, total, buyerPhone: verifiedPhone, buyerUid: customerUid || null,
      buyerAddress: document.getElementById("buyerAddress").value.trim() || null,
      buyerCity: selectedCity || null,
      queue, rejections: {}, assignedTo: null, status: "pending",
      paymentMethod: payMethod, paymentStatus: "pending_review", paymentRejectionReason: null,
      createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (buyerLocation) { orderData.buyerLat = buyerLocation.lat; orderData.buyerLng = buyerLocation.lng; }

    if (payMethod === "receipt") {
      orderData.receiptImageUrl = await uploadToCloudinary(receiptPhotoFile);
    } else if (payMethod === "check") {
      orderData.checkImageUrl = await uploadToCloudinary(checkPhotoFile);
      orderData.checkBank = document.getElementById("checkBankInput").value.trim();
      orderData.checkSerial = document.getElementById("checkSerialInput").value.trim();
      orderData.checkSayad = document.getElementById("checkSayadInput").value.trim();
      orderData.checkDueDate = document.getElementById("checkDueInput").value;
      orderData.checkAmount = Number(document.getElementById("checkAmountInput").value) || total;
      orderData.sayadReceived = false;
    } else if (payMethod === "credit") {
      orderData.paymentStatus = "approved"; // خرید اعتباری نیازی به بررسی رسید ندارد؛ فقط با پذیرش تامین‌کننده و بررسی سقف اعتبار تایید می‌شود
      orderData.creditSettled = false;
      orderData.creditSettlement = null;
    }

    const ref = await customerDb.collection("orders").add(orderData);

    document.getElementById("trackingCode").textContent = ref.id.slice(-8).toUpperCase();
    showStep("success");
    cart = {}; saveCart(); renderCart();
    document.getElementById("buyerAddress").value = "";
    receiptPhotoFile = null; checkPhotoFile = null;
    document.getElementById("receiptPreviewRow").innerHTML = "";
    document.getElementById("checkPreviewRow").innerHTML = "";
  } catch (err) {
    console.error(err);
    showToast("خطا در ثبت سفارش، دوباره تلاش کنید");
  } finally {
    btn.disabled = false; btn.textContent = "ثبت نهایی سفارش";
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
  loadMyCreditOrders();
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

function payLine(o) {
  const methodMap = { receipt: "واریز بانکی (فیش)", check: "چک", credit: "خرید اعتباری" };
  const stMap = { pending_review: "در انتظار تایید تامین‌کننده", approved: "تایید شد", rejected: "رد شد" };
  if (!o.paymentMethod) return "";
  const st = o.paymentMethod === "credit" ? "" : ` — ${stMap[o.paymentStatus] || ""}`;
  const reason = (o.paymentStatus === "rejected" && o.paymentRejectionReason)
    ? `<div class="order-shortfall">دلیل رد: ${o.paymentRejectionReason}</div>` : "";
  return `<div class="order-meta">پرداخت: ${methodMap[o.paymentMethod] || o.paymentMethod}${st}</div>${reason}`;
}

function myOrdersQuery(extra) {
  let q = customerDb.collection("orders").where("buyerUid", "==", customerUid || "none");
  if (extra) q = q.where(extra[0], "==", extra[1]);
  return q.get().then(snap => ({ empty: snap.empty, docs: snap.docs.sort((a, b) => (b.data().createdAtMs || 0) - (a.data().createdAtMs || 0)).slice(0, 30) }));
}

function loadMyOrders() {
  const el = document.getElementById("myOrdersList");
  el.innerHTML = `<p class="my-empty">در حال بارگذاری...</p>`;
  customerReady.then(() => myOrdersQuery())
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
          ${payLine(o)}
        `;
        el.appendChild(row);
      });
    }).catch(err => { console.error(err); el.innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

// -------------------- خریدهای اعتباری من --------------------
let repayReceiptFile = null;
let repayCheckFile = null;
let currentRepayOrderId = null;

function loadMyCreditOrders() {
  const el = document.getElementById("myCreditOrdersList");
  el.innerHTML = `<p class="my-empty">در حال بارگذاری...</p>`;
  customerReady.then(() => myOrdersQuery(["paymentMethod", "credit"]))
    .then(snap => {
      if (snap.empty) { el.innerHTML = `<p class="my-empty">خرید اعتباری‌ای ندارید.</p>`; return; }
      el.innerHTML = "";
      snap.docs.forEach(d => {
        const o = d.data();
        const settled = !!o.creditSettled;
        const pendingSettlement = o.creditSettlement && o.creditSettlement.status === "pending";
        const rejected = o.creditSettlement && o.creditSettlement.status === "rejected";
        const row = document.createElement("div");
        row.className = "order-card";
        row.innerHTML = `
          <div class="order-head"><span class="status-badge ${settled ? "badge-approved" : "badge-pending"}">${settled ? "تسویه شده" : "پرداخت‌نشده"}</span><span style="font-size:11px;color:var(--muted)">کد: ${d.id.slice(-8).toUpperCase()}</span></div>
          <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
          <div class="order-total">${toman(o.total)}</div>
          ${rejected ? `<div class="order-shortfall">دلیل رد واریز قبلی: ${o.creditSettlement.rejectionReason || ""}</div>` : ""}
          ${!settled ? `<div class="order-actions"><button data-act="repay" ${pendingSettlement ? "disabled" : ""}>${pendingSettlement ? "در انتظار تایید واریز" : "واریز برای این خرید"}</button></div>` : ""}
        `;
        const repayBtn = row.querySelector('[data-act="repay"]');
        if (repayBtn) repayBtn.onclick = () => openRepayBox(d.id, o.total);
        el.appendChild(row);
      });
    }).catch(err => { console.error(err); el.innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

function openRepayBox(orderId, total) {
  currentRepayOrderId = orderId;
  document.getElementById("creditRepayBox").classList.remove("hidden");
  document.getElementById("creditRepayForLabel").textContent = `واریز برای خرید به مبلغ ${toman(total)}`;
  document.getElementById("creditRepayBox").scrollIntoView({ behavior: "smooth" });
}
document.getElementById("cancelRepayBtn").onclick = () => {
  currentRepayOrderId = null;
  document.getElementById("creditRepayBox").classList.add("hidden");
};

document.querySelectorAll('input[name="repayMethod"]').forEach(radio => {
  radio.onchange = () => {
    document.getElementById("repayReceiptForm").classList.toggle("hidden", radio.value !== "receipt" || !radio.checked);
    document.getElementById("repayCheckForm").classList.toggle("hidden", radio.value !== "check" || !radio.checked);
  };
});
wirePhotoPicker("repayReceiptPhotoBtn", "repayReceiptPhotoInput", "repayReceiptPreviewRow", (f) => repayReceiptFile = f);
wirePhotoPicker("repayCheckPhotoBtn", "repayCheckPhotoInput", "repayCheckPreviewRow", (f) => repayCheckFile = f);

document.getElementById("submitRepayBtn").onclick = async () => {
  if (!currentRepayOrderId) return;
  const method = document.querySelector('input[name="repayMethod"]:checked').value;
  const btn = document.getElementById("submitRepayBtn");

  if (method === "receipt" && !repayReceiptFile) { showToast("عکس فیش را اضافه کنید"); return; }
  if (method === "check" && !repayCheckFile) { showToast("عکس چک را اضافه کنید"); return; }

  btn.disabled = true; btn.textContent = "در حال ارسال...";
  try {
    const settlement = { method, status: "pending", submittedAt: Date.now() };
    if (method === "receipt") {
      settlement.imageUrl = await uploadToCloudinary(repayReceiptFile);
    } else {
      settlement.imageUrl = await uploadToCloudinary(repayCheckFile);
      settlement.bank = document.getElementById("repayCheckBankInput").value.trim();
      settlement.serial = document.getElementById("repayCheckSerialInput").value.trim();
      settlement.sayad = document.getElementById("repayCheckSayadInput").value.trim();
      settlement.dueDate = document.getElementById("repayCheckDueInput").value;
    }
    await customerDb.collection("orders").doc(currentRepayOrderId).update({ creditSettlement: settlement });
    showToast("برای تایید تامین‌کننده ارسال شد");
    document.getElementById("creditRepayBox").classList.add("hidden");
    currentRepayOrderId = null;
    repayReceiptFile = null; repayCheckFile = null;
    document.getElementById("repayReceiptPreviewRow").innerHTML = "";
    document.getElementById("repayCheckPreviewRow").innerHTML = "";
    loadMyCreditOrders();
  } catch (err) {
    console.error(err);
    showToast("خطا در ارسال، دوباره تلاش کنید");
  } finally {
    btn.disabled = false; btn.textContent = "ارسال برای تایید تامین‌کننده";
  }
};

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
  if (typeof customerDb === "undefined") { grid.innerHTML = `<p class="grid-empty">اتصال به دیتابیس برقرار نیست.</p>`; return; }
  customerDb.collection("products").where("status", "==", "approved").onSnapshot(
    (snapshot) => {
      PRODUCTS = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => ((b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now()) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now())));
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

// نمایش شماره نسخه در پایین صفحه
(function () {
  const f = document.querySelector(".site-footer");
  if (f) { f.textContent = "نسخه " + APP_VERSION; f.style.fontSize = "11px"; f.style.color = "var(--muted)"; f.style.textAlign = "center"; }
})();
