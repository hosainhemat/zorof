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
  welcomeName.textContent = currentUser.email;
  window._adminUid = currentUser.uid;

  renderProductStatusFilters();
  listenProducts();
  listenCategoriesAdmin();
  renderSupplierStatusFilters();
  listenSuppliers();
  loadCustomers();
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
    const img0 = (p.images && p.images[0]) || p.imageUrl; const thumb = img0 ? `<img src="${img0}" alt="">` : `<div class="ph">🍽️</div>`;
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

// ===================== تنظیمات: خروجی CSV =====================
document.getElementById("exportCsvBtn").onclick = async () => {
  const snap = await db.collection("orders").orderBy("createdAt", "desc").get();
  const rows = [["کد سفارش", "تاریخ", "اقلام", "مبلغ", "شماره خریدار", "وضعیت", "تامین‌کننده"]];
  snap.docs.forEach(d => {
    const o = d.data();
    const date = o.createdAtMs ? new Date(o.createdAtMs).toLocaleString("fa-IR") : "";
    const itemsText = (o.items || []).map(it => `${it.name} x${it.qty}`).join(" / ");
    rows.push([d.id, date, itemsText, o.total || 0, o.buyerPhone || "", o.status || "", supplierNameOf(o.assignedTo || "")]);
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
