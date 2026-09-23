// -----------------------------------------------------------------
// پنل مدیر — ظرف من
// -----------------------------------------------------------------

const authSection = document.getElementById("authSection");
const panelSection = document.getElementById("panelSection");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const authError = document.getElementById("authError");
const welcomeName = document.getElementById("welcomeName");
const toastEl = document.getElementById("toast");

let currentUser = null;
let isAdmin = false;
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

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user) { authSection.classList.remove("hidden"); panelSection.classList.add("hidden"); return; }

  let adminDoc;
  try { adminDoc = await db.collection("admins").doc(user.uid).get(); } catch (e) {}
  isAdmin = adminDoc && adminDoc.exists;

  if (!isAdmin) { authError.textContent = "این حساب دسترسی مدیر ندارد."; auth.signOut(); return; }

  authSection.classList.add("hidden");
  panelSection.classList.remove("hidden");
  welcomeName.textContent = user.email;
  window._adminUid = user.uid;

  renderProductStatusFilters();
  listenProducts();
  renderSupplierStatusFilters();
  listenSuppliers();
  loadCustomers();
  loadAllOrders();
  loadInventory();
  loadReport();
  setupMessaging();
});

// -------------------- تب‌ها --------------------
document.querySelectorAll("#adminTabs .tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#adminTabs .tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
  };
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
  unsubProducts = db.collection("products").where("status", "==", activeProductStatus).orderBy("createdAt", "desc")
    .onSnapshot(snap => renderProductsList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error(err); document.getElementById("productsList").innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

function renderProductsList(items) {
  const el = document.getElementById("productsList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">موردی در این دسته نیست.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const row = document.createElement("div");
    row.className = "my-product";
    const thumb = p.imageUrl ? `<img src="${p.imageUrl}" alt="">` : `<div class="ph">🍽️</div>`;
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

function renderSuppliersList() {
  const el = document.getElementById("suppliersList");
  const items = allSuppliersCache.filter(s => (s.status || "pending") === activeSupplierStatus);
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">موردی در این دسته نیست.</p>`; return; }
  el.innerHTML = "";
  items.forEach(s => {
    const row = document.createElement("div");
    row.className = "my-product";
    const actions = [];
    if (activeSupplierStatus !== "approved") actions.push(`<button data-act="approve">تایید</button>`);
    if (activeSupplierStatus !== "rejected") actions.push(`<button data-act="reject">رد کردن</button>`);
    actions.push(`<button data-act="delete">حذف</button>`);
    row.innerHTML = `
      <div class="ph">🏪</div>
      <div class="my-product-info">
        <div class="my-product-name">${s.name || "—"}</div>
        <div class="my-product-price">${s.city || "بدون شهر"}</div>
        <a class="order-phone" href="tel:${s.phone || ""}">${s.phone || "بدون شماره"}</a>
      </div>
      <div class="my-product-actions">${actions.join("")}</div>
    `;
    const a = row.querySelector('[data-act="approve"]'); if (a) a.onclick = () => db.collection("suppliers").doc(s.uid).update({ status: "approved" }).then(() => showToast("تامین‌کننده تایید شد"));
    const r = row.querySelector('[data-act="reject"]'); if (r) r.onclick = () => db.collection("suppliers").doc(s.uid).update({ status: "rejected" }).then(() => showToast("رد شد"));
    row.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm("این تامین‌کننده حذف شود؟ (محصولاتش هم غیرفعال می‌شود)")) return;
      db.collection("suppliers").doc(s.uid).delete().then(() => showToast("حذف شد"));
    };
    el.appendChild(row);
  });
}

// ===================== مشتریان =====================
function loadCustomers() {
  db.collection("orders").get().then(snap => {
    const byPhone = {};
    snap.docs.forEach(d => {
      const o = d.data();
      if (!o.buyerPhone) return;
      if (!byPhone[o.buyerPhone]) byPhone[o.buyerPhone] = { phone: o.buyerPhone, city: o.buyerCity, count: 0, total: 0 };
      byPhone[o.buyerPhone].count++;
      byPhone[o.buyerPhone].total += (o.total || 0);
    });
    renderCustomers(Object.values(byPhone));
  }).catch(err => console.error(err));
}

function renderCustomers(customers) {
  const el = document.getElementById("customersList");
  if (customers.length === 0) { el.innerHTML = `<p class="my-empty">هنوز مشتری‌ای ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  customers.sort((a, b) => b.total - a.total).forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    const wa = "https://wa.me/" + c.phone.replace(/^0/, "98");
    row.innerHTML = `
      <div class="ph">👤</div>
      <div class="my-product-info">
        <div class="my-product-name">${c.phone}</div>
        <div class="my-product-price">${c.city || "—"} · ${c.count} سفارش · ${toman(c.total)}</div>
      </div>
      <div class="my-product-actions">
        <a href="tel:${c.phone}">تماس</a>
        <a href="${wa}" target="_blank">واتساپ</a>
      </div>
    `;
    el.appendChild(row);
  });
}

// ===================== سفارش‌ها (نظارت کامل) =====================
function loadAllOrders() {
  db.collection("orders").orderBy("createdAt", "desc").limit(100).onSnapshot(snap => {
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
    const queueText = (o.queue || []).map(uid => {
      const rej = (o.rejections || {})[uid];
      const accepted = o.assignedTo === uid;
      const mark = accepted ? "✅ پذیرفت" : (rej ? "❌ رد کرد" : "⏳ در انتظار");
      return `${supplierNameOf(uid)}: ${mark}`;
    }).join(" | ");

    let unclaimedBtn = "";
    if (o.status === "unclaimed") unclaimedBtn = `<button data-act="claim" class="primary-action">تامین دستی توسط من</button>`;

    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">${statusMap[o.status] || o.status}</span></div>
      <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
      <div class="order-total">${toman(o.total)}</div>
      <div class="order-meta">خریدار: ${o.buyerPhone} · ${o.buyerAddress || o.buyerCity || ""}</div>
      <div class="order-meta">${queueText}</div>
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
    const thumb = p.imageUrl ? `<img src="${p.imageUrl}" alt="">` : `<div class="ph">🍽️</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}</div>
        <div class="my-product-price">موجودی: ${p.stock ?? "—"} · تامین‌کننده: ${p.supplierName || "—"}</div>
      </div>
    `;
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
  unsubMessages = db.collection("messages").where("supplierId", "==", supplierId).orderBy("createdAt", "asc")
    .onSnapshot(snap => {
      const container = document.getElementById("adminMessages");
      container.innerHTML = "";
      snap.docs.forEach(d => {
        const m = d.data();
        const bubble = document.createElement("div");
        bubble.className = "msg-bubble " + (m.sender === "admin" ? "me" : "them");
        bubble.textContent = m.text;
        container.appendChild(bubble);
      });
      container.scrollTop = container.scrollHeight;
    });
}
