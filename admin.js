// -----------------------------------------------------------------
// پنل مدیر — ظرف من
// -----------------------------------------------------------------

const authSection = document.getElementById("authSection");
const otpSection = document.getElementById("otpSection");
const panelSection = document.getElementById("panelSection");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const authError = document.getElementById("authError");
const welcomeName = document.getElementById("welcomeName");
const toastEl = document.getElementById("toast");

let currentUser = null;
let isAdmin = false;
let adminPendingCode = null;
let activeProductStatus = "pending";
let activeSupplierStatus = "pending";
let unsubProducts = null;
let unsubSuppliers = null;
let unsubMessages = null;
let allSuppliersCache = [];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }

document.getElementById("loginBtn").onclick = () => {
  authError.textContent = "";
  auth.signInWithEmailAndPassword(authEmail.value.trim(), authPass.value)
    .catch(err => authError.textContent = "ورود ناموفق بود: " + err.message);
};
document.getElementById("logoutBtn").onclick = () => auth.signOut();

document.getElementById("forgotPassBtn").onclick = () => {
  const email = authEmail.value.trim();
  if (!email) { authError.textContent = "اول ایمیل خود را در کادر بالا وارد کنید، بعد این دکمه را بزنید."; return; }
  auth.sendPasswordResetEmail(email)
    .then(() => { authError.style.color = "var(--accent)"; authError.textContent = "لینک بازنشانی رمز به ایمیل شما ارسال شد. صندوق ورودی (و اسپم) را چک کنید."; })
    .catch(err => { authError.style.color = ""; authError.textContent = "خطا: " + (err.code === "auth/user-not-found" ? "کاربری با این ایمیل پیدا نشد." : err.message); });
};

document.getElementById("adminOtpVerifyBtn").onclick = () => {
  const errEl = document.getElementById("otpError");
  const code = document.getElementById("adminOtpInput").value.trim();
  if (code !== adminPendingCode) { errEl.textContent = "کد وارد‌شده درست نیست."; return; }
  errEl.textContent = "";
  otpSection.classList.add("hidden");
  showAdminPanel();
};
document.getElementById("adminOtpCancelBtn").onclick = () => auth.signOut();

function showAdminPanel() {
  panelSection.classList.remove("hidden");
  welcomeName.textContent = currentUser.email + " (نسخه " + APP_VERSION + ")";
  window._adminUid = currentUser.uid;
  db.collection("settings").doc("site").set({ adminUid: currentUser.uid }, { merge: true }).catch(() => {});

  renderProductStatusFilters();
  listenProducts();
  listenCategoriesAdmin();
  renderSupplierStatusFilters();
  listenSuppliers();
  loadCustomers();
  loadCreditData();
  loadAllOrders();
  loadInventory();
  loadReport();
  setupMessaging();
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  authSection.classList.add("hidden");
  otpSection.classList.add("hidden");
  panelSection.classList.add("hidden");
  if (!user) { authSection.classList.remove("hidden"); return; }

  let adminDoc;
  try { adminDoc = await db.collection("admins").doc(user.uid).get(); } catch (e) {}
  isAdmin = adminDoc && adminDoc.exists;

  if (!isAdmin) { authError.textContent = "این حساب دسترسی مدیر ندارد."; auth.signOut(); return; }

  // هر بار ورود، حتی با رمز درست، یک کد تایید هم لازم است (حالت آزمایشی تا اتصال پیامک)
  adminPendingCode = generateDevOtp();
  document.getElementById("adminDevCode").textContent = `⚠️ حالت آزمایشی (پیامک هنوز وصل نیست) — کد شما: ${adminPendingCode}`;
  document.getElementById("adminOtpInput").value = "";
  otpSection.classList.remove("hidden");
});

// -------------------- منوی بخش‌ها (کشویی) --------------------
const SECTION_TITLES = {
  products: "تایید محصولات", categories: "دسته‌بندی‌ها", suppliers: "تامین‌کنندگان",
  customers: "مشتریان", credit: "خرید اعتباری", orders: "سفارش‌ها", inventory: "موجودی",
  report: "گزارش", messages: "پیام‌رسانی", settings: "تنظیمات",
};

const adminSideOverlay = document.getElementById("adminSideOverlay");
const adminSideMenu = document.getElementById("adminSideMenu");
function openAdminMenu() { adminSideOverlay.classList.add("open"); adminSideMenu.classList.add("open"); }
function closeAdminMenu() { adminSideOverlay.classList.remove("open"); adminSideMenu.classList.remove("open"); }
document.getElementById("adminMenuBtn").onclick = openAdminMenu;
document.getElementById("closeAdminSideMenu").onclick = closeAdminMenu;
adminSideOverlay.onclick = closeAdminMenu;
document.getElementById("backToMenuBtn").onclick = openAdminMenu;

function selectTab(key) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
  document.getElementById("tab-" + key).classList.remove("hidden");
  document.getElementById("currentSectionTitle").textContent = SECTION_TITLES[key] || "";
}

// کلیک روی سرشاخه‌های آکاردئونی (باز/بسته کردن + رفتن به همان بخش)
document.querySelectorAll(".accordion-head").forEach(head => {
  head.addEventListener("click", () => {
    const body = head.nextElementSibling;
    head.classList.toggle("open");
    body.classList.toggle("hidden");
    selectTab(head.dataset.tab);
    closeAdminMenu();
  });
});

// کلیک روی آیتم‌های ساده (بدون زیرشاخه)
document.querySelectorAll("#adminMenuList > .side-cat-item:not(.accordion-head)").forEach(btn => {
  btn.addEventListener("click", () => { selectTab(btn.dataset.tab); closeAdminMenu(); });
});

// کلیک روی زیرشاخه‌ها
document.querySelectorAll(".side-cat-item.sub").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectTab(btn.dataset.tab);
    if (btn.dataset.status) {
      if (btn.dataset.tab === "products") { activeProductStatus = btn.dataset.status; renderProductStatusFilters(); listenProducts(); }
      if (btn.dataset.tab === "suppliers") { activeSupplierStatus = btn.dataset.status; renderSupplierStatusFilters(); renderSuppliersList(); }
    }
    closeAdminMenu();
    if (btn.dataset.scroll) {
      setTimeout(() => {
        const target = document.getElementById("settings-" + btn.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }, 250);
    }
  });
});

// ===================== تایید محصولات =====================
function renderProductStatusFilters() {
  const statuses = [{ key: "pending", label: "در انتظار تایید" }, { key: "approved", label: "تایید شده" }, { key: "rejected", label: "رد شده" }];
  const el = document.getElementById("statusFilters");
  el.innerHTML = "";
  statuses.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip" + (s.key === activeProductStatus ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => { activeProductStatus = s.key; renderProductStatusFilters(); listenProducts(); };
    el.appendChild(btn);
  });
}

function listenProducts() {
  if (unsubProducts) unsubProducts();
  unsubProducts = db.collection("products").where("status", "==", activeProductStatus)
    .onSnapshot(snap => renderProductsList(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ((b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now()) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now())))),
      err => { console.error(err); document.getElementById("productsList").innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

function renderProductsList(items) {
  const el = document.getElementById("productsList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">موردی در این دسته نیست.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const row = document.createElement("div");
    row.className = "my-product";
    const img0 = (p.images && p.images[0]) || p.imageUrl; const thumb = img0 ? `<img src="${img0}" alt="">` : `<div class="ph">🍽️</div>`;
    const actions = [];
    if (activeProductStatus !== "approved") actions.push(`<button data-act="approve">تایید</button>`);
    if (activeProductStatus !== "rejected") actions.push(`<button data-act="reject">رد کردن</button>`);
    actions.push(`<button data-act="delete">حذف</button>`);
    row.innerHTML = `
      ${thumb}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}</div>
        <div class="my-product-price">${toman(p.price)}</div>
        <div class="supplier-tag">تامین‌کننده: ${p.supplierName || "—"}</div>
      </div>
      <div class="my-product-actions">${actions.join("")}</div>
    `;
    const a = row.querySelector('[data-act="approve"]'); if (a) a.onclick = () => db.collection("products").doc(p.id).update({ status: "approved" }).then(() => showToast("تایید شد"));
    const r = row.querySelector('[data-act="reject"]'); if (r) r.onclick = () => db.collection("products").doc(p.id).update({ status: "rejected" }).then(() => showToast("رد شد"));
    row.querySelector('[data-act="delete"]').onclick = () => { if (confirm("حذف شود؟")) db.collection("products").doc(p.id).delete().then(() => showToast("حذف شد")); };
    el.appendChild(row);
  });
}

// ===================== تامین‌کنندگان =====================
function renderSupplierStatusFilters() {
  const statuses = [{ key: "pending", label: "در انتظار تایید" }, { key: "approved", label: "تایید شده" }, { key: "rejected", label: "رد شده" }];
  const el = document.getElementById("supplierStatusFilters");
  el.innerHTML = "";
  statuses.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip" + (s.key === activeSupplierStatus ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => { activeSupplierStatus = s.key; renderSupplierStatusFilters(); renderSuppliersList(); };
    el.appendChild(btn);
  });
}

function listenSuppliers() {
  if (unsubSuppliers) unsubSuppliers();
  unsubSuppliers = db.collection("suppliers").onSnapshot(snap => {
    allSuppliersCache = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderSuppliersList();
    populateMessageSupplierSelect();
    loadReport();
  }, err => console.error(err));
}

function reportWriteError(action, err) {
  console.error(action, err);
  const code = err && err.code ? err.code : "";
  if (code === "permission-denied") {
    showToast("❌ ذخیره نشد: دسترسی رد شد. قوانین Firestore را دوباره Publish کنید و مطمئن شوید سند admins برای حساب شما وجود دارد.");
  } else {
    showToast("❌ خطا در " + action + (code ? " (" + code + ")" : ""));
  }
}

function setSupplierStatus(uid, status, okMsg) {
  // بعد از نوشتن، مقدار را مستقیم از سرور می‌خوانیم تا مطمئن شویم واقعاً ذخیره شده
  return db.collection("suppliers").doc(uid).update({ status })
    .then(() => db.collection("suppliers").doc(uid).get({ source: "server" }))
    .then(doc => {
      if (doc.exists && doc.data().status === status) showToast(okMsg + " ✅ (روی سرور ذخیره شد)");
      else showToast("⚠️ ذخیره شد ولی مقدار روی سرور با انتظار نمی‌خواند. صفحه را رفرش کنید.");
    })
    .catch(err => reportWriteError("تغییر وضعیت تامین‌کننده", err));
}

function renderSuppliersList() {
  const el = document.getElementById("suppliersList");
  const items = allSuppliersCache.filter(s => (s.status || "pending") === activeSupplierStatus);
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">موردی در این دسته نیست.</p>`; return; }
  el.innerHTML = "";

  // شمارش شماره‌های تکراری (ممکن است یک نفر دو بار ثبت‌نام کرده باشد و شما یکی را تایید کرده باشید و او با دیگری وارد شود)
  const phoneCount = {};
  allSuppliersCache.forEach(x => { if (x.phone) phoneCount[x.phone] = (phoneCount[x.phone] || 0) + 1; });

  items.forEach(s => {
    const row = document.createElement("div");
    row.className = "my-product";
    const actions = [];
    if (activeSupplierStatus !== "approved") actions.push(`<button data-act="approve">تایید</button>`);
    if (activeSupplierStatus !== "rejected") actions.push(`<button data-act="reject">رد کردن</button>`);
    actions.push(`<button data-act="delete">حذف</button>`);
    const dup = s.phone && phoneCount[s.phone] > 1 ? `<div class="order-shortfall">⚠️ این شماره ${phoneCount[s.phone]} بار ثبت‌نام شده — مطمئن شوید همان حسابی را تایید می‌کنید که تامین‌کننده با آن وارد می‌شود</div>` : "";
    row.innerHTML = `
      <div class="ph">🏪</div>
      <div class="my-product-info">
        <div class="my-product-name">${s.name || "—"}</div>
        <div class="my-product-price">${s.city || "بدون شهر"}</div>
        <a class="order-phone" href="tel:${s.phone || ""}">${s.phone || "بدون شماره"}</a>
        <div class="supplier-tag">شناسه حساب: ${s.uid.slice(-6)} · وضعیت فعلی: ${s.status || "pending"}</div>
        ${dup}
      </div>
      <div class="my-product-actions">${actions.join("")}</div>
    `;
    const a = row.querySelector('[data-act="approve"]'); if (a) a.onclick = () => setSupplierStatus(s.uid, "approved", "تامین‌کننده تایید شد");
    const r = row.querySelector('[data-act="reject"]'); if (r) r.onclick = () => setSupplierStatus(s.uid, "rejected", "تامین‌کننده رد شد");
    row.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm("این تامین‌کننده حذف شود؟ (محصولاتش هم غیرفعال می‌شود)")) return;
      db.collection("suppliers").doc(s.uid).delete().then(() => showToast("حذف شد")).catch(err => reportWriteError("حذف تامین‌کننده", err));
    };
    el.appendChild(row);
  });
}

// ===================== خرید اعتباری (نظارت کامل مدیر) =====================
function loadCreditData() {
  db.collection("creditAccounts").onSnapshot(snap => {
    renderCreditAccountsAdmin(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error(err));

  db.collection("orders").where("paymentMethod", "==", "credit").onSnapshot(snap => {
    const withSettlement = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.creditSettlement && o.creditSettlement.status);
    renderCreditSettlementsAdmin(withSettlement);
  }, err => console.error(err));
}

function renderCreditAccountsAdmin(items) {
  const el = document.getElementById("creditAccountsAdminList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز اعتباری ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const used = c.used || 0;
    const remaining = (c.limit || 0) - used;
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      <div class="ph">💳</div>
      <div class="my-product-info">
        <div class="my-product-name">${c.phone}</div>
        <div class="my-product-price">تامین‌کننده: ${supplierNameOf(c.supplierUid)} · سقف: ${toman(c.limit)} · مصرف‌شده: ${toman(used)} · باقیمانده: ${toman(remaining)}</div>
      </div>
    `;
    el.appendChild(row);
  });
}

function renderCreditSettlementsAdmin(orders) {
  const el = document.getElementById("creditSettlementsAdminList");
  if (orders.length === 0) { el.innerHTML = `<p class="my-empty">واریزی‌ای ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  const statusLabel = { pending: "در انتظار بررسی تامین‌کننده", approved: "تایید و کسر شد", rejected: "رد شد" };
  orders.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).forEach(o => {
    const s = o.creditSettlement;
    const photo = s.photoUrl ? `<a href="${s.photoUrl}" target="_blank">مشاهده عکس</a>` : "";
    const row = document.createElement("div");
    row.className = "order-card";
    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">${statusLabel[s.status] || s.status}</span></div>
      <div class="order-items">مشتری: ${o.buyerPhone} · تامین‌کننده: ${supplierNameOf(o.assignedTo)} · مبلغ: ${toman(s.amount)} · روش: ${s.method === "check" ? "چک" : "فیش بانکی"}</div>
      <div class="order-meta">${photo} ${s.rejectionReason ? "· دلیل رد: " + s.rejectionReason : ""}</div>
    `;
    el.appendChild(row);
  });
}

// ===================== مشتریان =====================
let customersCache = [];
let customerNamesCache = {};

// تبدیل مختصات GPS به نام منطقه (رایگان، بدون کلید — OpenStreetMap Nominatim)
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=fa`);
    const data = await res.json();
    const a = data.address || {};
    const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.city || a.village || "";
    const city = a.city || a.town || a.county || "";
    const text = [area, city].filter((v, i, arr) => v && arr.indexOf(v) === i).join("، ");
    return text || data.display_name || "";
  } catch (e) {
    console.error("reverseGeocode", e);
    return "";
  }
}

function loadCustomers() {
  db.collection("customers").onSnapshot(snap => {
    customerNamesCache = {};
    snap.docs.forEach(d => { customerNamesCache[d.id] = d.data(); });
    renderCustomers();
  });

  db.collection("orders").get().then(async (snap) => {
    const byPhone = {};
    const geocodeTasks = [];

    snap.docs.forEach(d => {
      const o = d.data();
      if (!o.buyerPhone) return;
      if (!byPhone[o.buyerPhone]) byPhone[o.buyerPhone] = { phone: o.buyerPhone, locationText: "", count: 0, total: 0 };
      byPhone[o.buyerPhone].count++;
      byPhone[o.buyerPhone].total += (o.total || 0);

      if (!byPhone[o.buyerPhone].locationText) {
        if (o.buyerAddress) byPhone[o.buyerPhone].locationText = o.buyerAddress;
        else if (o.buyerCity) byPhone[o.buyerPhone].locationText = o.buyerCity;
        else if (o.buyerAreaText) byPhone[o.buyerPhone].locationText = o.buyerAreaText;
        else if (o.buyerLat != null && o.buyerLng != null) {
          geocodeTasks.push({ docId: d.id, phone: o.buyerPhone, lat: o.buyerLat, lng: o.buyerLng });
        }
      }
    });

    customersCache = Object.values(byPhone);
    renderCustomers();

    // موقعیت‌هایی که فقط مختصات دارند، یک‌بار به نام منطقه تبدیل و روی خود سفارش ذخیره می‌شوند تا دیگر لازم نباشد دوباره پرسیده شود
    for (const task of geocodeTasks) {
      const text = await reverseGeocode(task.lat, task.lng);
      if (!text) continue;
      db.collection("orders").doc(task.docId).update({ buyerAreaText: text }).catch(() => {});
      const c = customersCache.find(x => x.phone === task.phone);
      if (c && !c.locationText) { c.locationText = text; renderCustomers(); }
    }
  }).catch(err => console.error(err));
}

function renderCustomers() {
  const el = document.getElementById("customersList");
  const q = (document.getElementById("customerSearch").value || "").trim();
  let items = customersCache.map(c => ({ ...c, name: (customerNamesCache[c.phone] || {}).name || "" }));
  if (q) items = items.filter(c => c.phone.includes(q) || c.name.includes(q));
  items.sort((a, b) => b.total - a.total);

  if (items.length === 0) { el.innerHTML = `<p class="my-empty">موردی پیدا نشد.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    const wa = "https://wa.me/" + c.phone.replace(/^0/, "98");
    row.innerHTML = `
      <div class="ph">👤</div>
      <div class="my-product-info">
        <div class="my-product-name">${c.name || "بدون نام"}</div>
        <div class="my-product-price">${c.phone} · ${c.locationText || "بدون موقعیت"}</div>
        <div class="supplier-tag">${c.count} سفارش · ${toman(c.total)}</div>
      </div>
      <div class="my-product-actions">
        <button data-act="editname">ویرایش نام</button>
        <a href="tel:${c.phone}">تماس</a>
        <a href="${wa}" target="_blank">واتساپ</a>
      </div>
    `;
    row.querySelector('[data-act="editname"]').onclick = () => {
      const newName = prompt("نام این مشتری:", c.name || "");
      if (newName === null) return;
      db.collection("customers").doc(c.phone).set({ name: newName.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .then(() => showToast("نام ذخیره شد"))
        .catch(err => reportWriteError("ذخیره نام مشتری", err));
    };
    el.appendChild(row);
  });
}
document.getElementById("customerSearch").oninput = renderCustomers;

// ===================== سفارش‌ها (نظارت کامل) =====================

// -------------------- اعلان بزرگ سفارش جدید --------------------
let neworderFirstLoad = true;
function showNewOrderPopup(order) {
  const overlay = document.getElementById("neworderOverlay");
  const popup = document.getElementById("neworderPopup");
  const sub = document.getElementById("neworderSub");
  if (!overlay || !popup) return;
  const itemsText = (order.items || []).map(it => `${it.name} × ${it.qty}`).join("، ");
  sub.textContent = (itemsText || "سفارش تازه") + " — " + toman(order.total);
  overlay.classList.add("open");
  popup.classList.add("open");
}
function closeNewOrderPopup() {
  document.getElementById("neworderOverlay").classList.remove("open");
  document.getElementById("neworderPopup").classList.remove("open");
}
document.getElementById("neworderOverlay").onclick = closeNewOrderPopup;
document.getElementById("neworderCloseBtn").onclick = closeNewOrderPopup;
document.getElementById("neworderViewBtn").onclick = () => {
  closeNewOrderPopup();
  const ordersTabBtn = document.querySelector('#adminMenuList [data-tab="orders"]') || document.querySelector('[data-tab="orders"]');
  if (ordersTabBtn) ordersTabBtn.click();
};

function loadAllOrders() {
  neworderFirstLoad = true;
  db.collection("orders").orderBy("createdAt", "desc").limit(100).onSnapshot(snap => {
    if (!neworderFirstLoad) {
      snap.docChanges().forEach(change => {
        if (change.type === "added") showNewOrderPopup({ id: change.doc.id, ...change.doc.data() });
      });
    }
    neworderFirstLoad = false;
    renderAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error(err));
}

function supplierNameOf(uid) {
  const s = allSuppliersCache.find(x => x.uid === uid);
  return s ? s.name : (uid === (window._adminUid || "") ? "مدیر" : uid.slice(0, 6));
}

function renderAllOrders(orders) {
  const el = document.getElementById("allOrdersList");
  if (orders.length === 0) { el.innerHTML = `<p class="my-empty">هنوز سفارشی نیست.</p>`; return; }
  el.innerHTML = "";
  orders.forEach(o => {
    const row = document.createElement("div");
    row.className = "order-card";
    const statusMap = { pending: "در جریان", assigned: "پذیرفته‌شده", unclaimed: "بدون پاسخ (نیاز به شما)" };
    const queueText = (o.queue || []).map((uid, idx) => {
      const rej = (o.rejections || {})[uid];
      const accepted = o.assignedTo === uid;
      let mark;
      if (accepted) mark = "✅ پذیرفت";
      else if (rej) mark = "❌ رد کرد";
      else {
        const allBeforeRejected = o.queue.slice(0, idx).every(u => (o.rejections || {})[u]);
        mark = allBeforeRejected && !o.assignedTo ? "🔵 نوبت اوست (در انتظار پاسخ)" : "⏳ هنوز نوبتش نرسیده";
      }
      return `${supplierNameOf(uid)}: ${mark}`;
    }).join(" | ");

    let unclaimedBtn = "";
    if (o.status === "unclaimed") unclaimedBtn = `<button data-act="claim" class="primary-action">تامین دستی توسط من</button>`;

    // نمایش کامل روش پرداخت برای مدیر — چیزی پنهان نیست
    const payStatusLabel = { pending_review: "در انتظار بررسی تامین‌کننده", approved: "تایید شده", rejected: "رد شده" };
    let paymentBox = "";
    if (o.paymentMethod) {
      const photoUrl = o.receiptImageUrl || o.checkImageUrl;
      const methodLabel = o.paymentMethod === "check" ? "چک" : "واریز بانکی (فیش)";
      let details = "";
      if (o.paymentMethod === "check") {
        details = `بانک: ${o.checkBank || "—"} · سریال: ${o.checkSerial || "—"} · صیادی: ${o.checkSayad || "—"} · سررسید: ${toJalaliString ? toJalaliString(o.checkDueDate) : (o.checkDueDate || "—")} · مبلغ: ${toman(o.checkAmount)}`;
      }
      const rejectLine = (o.paymentStatus === "rejected" && o.paymentRejectionReason)
        ? `<div class="order-shortfall">دلیل رد: ${o.paymentRejectionReason}</div>` : "";
      const sayadLine = (o.paymentMethod === "check" && o.paymentStatus === "approved")
        ? `<div class="sayad-tag">وضعیت صیادی: ${o.sayadReceived ? "دریافت شد ✅" : "دریافت نشده"}</div>` : "";
      paymentBox = `
        <div class="acc-row" style="margin-top:8px">
          <div class="acc-row-top"><span>روش پرداخت: ${methodLabel}</span><span>${payStatusLabel[o.paymentStatus] || o.paymentStatus}</span></div>
          ${details ? `<div class="order-meta">${details}</div>` : ""}
          ${photoUrl ? `<img src="${photoUrl}" alt="مدرک پرداخت" style="max-width:120px;border-radius:8px;margin-top:6px">` : ""}
          ${rejectLine}${sayadLine}
        </div>`;
    }

    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">${statusMap[o.status] || o.status}</span></div>
      <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
      <div class="order-total">${toman(o.total)}</div>
      <div class="order-meta">خریدار: ${o.buyerPhone} · ${o.buyerAddress || o.buyerCity || ""}</div>
      <div class="order-meta">${queueText}</div>
      ${paymentBox}
      <div class="order-actions">${unclaimedBtn}</div>
    `;
    const claimBtn = row.querySelector('[data-act="claim"]');
    if (claimBtn) claimBtn.onclick = () => {
      db.collection("orders").doc(o.id).update({ status: "assigned", assignedTo: currentUser.uid })
        .then(() => showToast("سفارش به شما اختصاص یافت"));
    };
    el.appendChild(row);
  });
}

// ===================== موجودی =====================
function loadInventory() {
  db.collection("products").onSnapshot(snap => {
    renderInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error(err));
}

function renderInventory(items) {
  const el = document.getElementById("inventoryList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">محصولی ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const row = document.createElement("div");
    row.className = "my-product";
    const available = p.available !== false;
    const img0 = (p.images && p.images[0]) || p.imageUrl; const thumb = img0 ? `<img src="${img0}" alt="">` : `<div class="ph">🍽️</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}</div>
        <div class="my-product-price">موجودی: ${p.stock ?? "—"} · تامین‌کننده: ${p.supplierName || "—"}</div>
        ${!available ? `<span class="status-badge badge-rejected">اتمام موجودی در بازار</span>` : ""}
      </div>
      <div class="my-product-actions">
        <button data-act="toggle-avail">${available ? "اتمام موجودی" : "بازگرداندن"}</button>
      </div>
    `;
    row.querySelector('[data-act="toggle-avail"]').onclick = () => {
      db.collection("products").doc(p.id).update({ available: !available })
        .then(() => showToast(available ? "به‌عنوان اتمام موجودی علامت خورد" : "دوباره موجود شد"));
    };
    el.appendChild(row);
  });
}

// ===================== گزارش =====================
async function loadReport() {
  const el = document.getElementById("reportBox");
  el.innerHTML = `<p class="my-empty">در حال محاسبه...</p>`;
  const ordersSnap = await db.collection("orders").get();
  const orders = ordersSnap.docs.map(d => d.data());

  const perSupplier = {};
  allSuppliersCache.forEach(s => { perSupplier[s.uid] = { name: s.name, accepted: 0, rejected: 0, revenue: 0 }; });

  orders.forEach(o => {
    if (o.assignedTo) {
      if (!perSupplier[o.assignedTo]) perSupplier[o.assignedTo] = { name: supplierNameOf(o.assignedTo), accepted: 0, rejected: 0, revenue: 0 };
      perSupplier[o.assignedTo].accepted++;
      perSupplier[o.assignedTo].revenue += (o.total || 0);
    }
    Object.keys(o.rejections || {}).forEach(uid => {
      if (!perSupplier[uid]) perSupplier[uid] = { name: supplierNameOf(uid), accepted: 0, rejected: 0, revenue: 0 };
      perSupplier[uid].rejected++;
    });
  });

  const totalRevenue = orders.reduce((s, o) => s + (o.assignedTo ? (o.total || 0) : 0), 0);
  let html = `<div class="report-item"><span>کل درآمد فروشگاه</span><b>${toman(totalRevenue)}</b></div>`;
  html += `<div class="report-item"><span>کل سفارش‌ها</span><b>${orders.length}</b></div>`;
  Object.values(perSupplier).forEach(s => {
    html += `<div class="report-item"><span>${s.name || "—"}</span><b>${s.accepted} قبول · ${s.rejected} رد · ${toman(s.revenue)}</b></div>`;
  });
  el.innerHTML = html;
}

// ===================== پیام‌رسانی =====================
function populateMessageSupplierSelect() {
  const select = document.getElementById("messageSupplierSelect");
  const current = select.value;
  select.innerHTML = "";
  allSuppliersCache.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.uid; opt.textContent = s.name || s.uid;
    select.appendChild(opt);
  });
  if (current) select.value = current;
  else if (allSuppliersCache.length > 0) openMessageThread(select.value);
}

function setupMessaging() {
  const select = document.getElementById("messageSupplierSelect");
  select.onchange = () => openMessageThread(select.value);
  document.getElementById("adminMsgSend").onclick = () => {
    const input = document.getElementById("adminMsgInput");
    const supplierId = select.value;
    if (!supplierId || !input.value.trim()) return;
    db.collection("messages").add({
      supplierId, sender: "admin", text: input.value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    input.value = "";
  };
}

function openMessageThread(supplierId) {
  if (unsubMessages) unsubMessages();
  if (!supplierId) return;
  unsubMessages = db.collection("messages").where("supplierId", "==", supplierId)
    .onSnapshot(snap => {
      const container = document.getElementById("adminMessages");
      container.innerHTML = "";
      const sortedDocs = snap.docs.slice().sort((a, b) => ((a.data().createdAt && a.data().createdAt.toMillis ? a.data().createdAt.toMillis() : Date.now()) - (b.data().createdAt && b.data().createdAt.toMillis ? b.data().createdAt.toMillis() : Date.now())));
      sortedDocs.forEach(d => {
        const m = d.data();
        const bubble = document.createElement("div");
        bubble.className = "msg-bubble " + (m.sender === "admin" ? "me" : "them");
        bubble.textContent = m.text;
        container.appendChild(bubble);
      });
      container.scrollTop = container.scrollHeight;
    });
}

// ===================== دسته‌بندی‌ها =====================
function listenCategoriesAdmin() {
  db.collection("categories").orderBy("order", "asc").onSnapshot(snap => {
    renderCategoriesAdmin(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error(err));
}

function renderCategoriesAdmin(items) {
  const el = document.getElementById("categoriesListAdmin");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز دسته‌ای اضافه نکرده‌اید.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      <div class="ph">${c.icon || "🍽️"}</div>
      <div class="my-product-info"><div class="my-product-name">${c.name}</div></div>
      <div class="my-product-actions"><button data-act="delete">حذف</button></div>
    `;
    row.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm(`دسته «${c.name}» حذف شود؟ محصولات این دسته حذف نمی‌شوند ولی دیگر فیلتر نخواهند داشت.`)) return;
      db.collection("categories").doc(c.id).delete().then(() => showToast("دسته حذف شد"));
    };
    el.appendChild(row);
  });
}

document.getElementById("addCatBtn").onclick = () => {
  const nameInput = document.getElementById("catNameInput");
  const iconInput = document.getElementById("catIconInput");
  const name = nameInput.value.trim();
  if (!name) { showToast("نام دسته را وارد کنید"); return; }
  db.collection("categories").add({ name, icon: iconInput.value.trim() || "🍽️", order: Date.now() })
    .then(() => { showToast("دسته اضافه شد"); nameInput.value = ""; iconInput.value = ""; });
};

// ===================== تنظیمات: تم =====================
db.collection("settings").doc("site").get().then(doc => {
  if (doc.exists) document.getElementById("themeSelect").value = doc.data().theme || "color";
}).catch(() => {});

document.getElementById("saveThemeBtn").onclick = () => {
  const theme = document.getElementById("themeSelect").value;
  db.collection("settings").doc("site").set({ theme }, { merge: true })
    .then(() => showToast("تم فروشگاه اعمال شد"));
};

db.collection("settings").doc("site").get().then(doc => {
  if (doc.exists) document.getElementById("bankInfoInput").value = doc.data().bankInfo || "";
}).catch(() => {});

document.getElementById("saveBankInfoBtn").onclick = () => {
  const bankInfo = document.getElementById("bankInfoInput").value.trim();
  db.collection("settings").doc("site").set({ bankInfo }, { merge: true })
    .then(() => showToast("شماره حساب ذخیره شد"));
};

// ===================== تنظیمات: خروجی CSV =====================
document.getElementById("exportCsvBtn").onclick = async () => {
  const snap = await db.collection("orders").orderBy("createdAt", "desc").get();
  const rows = [["کد سفارش", "تاریخ", "اقلام", "مبلغ", "شماره خریدار", "وضعیت سفارش", "تامین‌کننده", "روش پرداخت", "وضعیت پرداخت", "دلیل رد پرداخت"]];
  const payLabel = { receipt: "فیش بانکی", check: "چک" };
  const payStatusLabel = { pending_review: "در انتظار بررسی", approved: "تایید شده", rejected: "رد شده" };
  snap.docs.forEach(d => {
    const o = d.data();
    const date = o.createdAtMs ? new Date(o.createdAtMs).toLocaleString("fa-IR") : "";
    const itemsText = (o.items || []).map(it => `${it.name} x${it.qty}`).join(" / ");
    rows.push([
      d.id, date, itemsText, o.total || 0, o.buyerPhone || "", o.status || "", supplierNameOf(o.assignedTo || ""),
      payLabel[o.paymentMethod] || "—", payStatusLabel[o.paymentStatus] || "—", o.paymentRejectionReason || "",
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "orders-report.csv"; a.click();
  URL.revokeObjectURL(url);
};

// ===================== تنظیمات: بازنشانی =====================
async function deleteAllInCollection(name) {
  const snap = await db.collection(name).get();
  const batches = [];
  let batch = db.batch(); let count = 0;
  snap.docs.forEach(d => {
    batch.delete(d.ref); count++;
    if (count === 400) { batches.push(batch.commit()); batch = db.batch(); count = 0; }
  });
  if (count > 0) batches.push(batch.commit());
  await Promise.all(batches);
}

document.querySelectorAll('[data-reset]').forEach(btn => {
  btn.onclick = async () => {
    const name = btn.dataset.reset;
    if (!confirm(`همه داده‌های «${btn.textContent}» پاک شود؟ این عمل قابل بازگشت نیست.`)) return;
    await deleteAllInCollection(name);
    showToast("پاک شد");
  };
});

document.getElementById("fullResetBtn").onclick = async () => {
  if (!confirm("بازنشانی کامل: همه محصولات، سفارش‌ها و پیام‌ها برای همیشه پاک می‌شوند. مطمئن هستید؟")) return;
  if (!confirm("این آخرین هشدار است. واقعاً همه‌چیز پاک شود؟")) return;
  await Promise.all([deleteAllInCollection("products"), deleteAllInCollection("orders"), deleteAllInCollection("messages")]);
  showToast("فروشگاه بازنشانی شد");
};
