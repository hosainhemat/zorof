// -----------------------------------------------------------------
// پنل تامین‌کننده — ظرف من
// -----------------------------------------------------------------

const loginView = document.getElementById("loginView");
const registerStep1 = document.getElementById("registerStep1");
const registerStep2 = document.getElementById("registerStep2");
const registerStep3 = document.getElementById("registerStep3");
const forgotView = document.getElementById("forgotView");
const pendingSection = document.getElementById("pendingSection");
const panelSection = document.getElementById("panelSection");
const welcomeName = document.getElementById("welcomeName");
const myProductsEl = document.getElementById("myProducts");
const toastEl = document.getElementById("toast");
const supplierCitySelect = document.getElementById("supplierCity");
const getLocationBtn = document.getElementById("getLocationBtn");
const locationStatusEl = document.getElementById("locationStatus");
const ordersListEl = document.getElementById("ordersList");
const reportBox = document.getElementById("reportBox");
const minOrderInput = document.getElementById("minOrder");
const deliveryFeeInput = document.getElementById("deliveryFee");

const productForm = document.getElementById("productForm");
const productFormTitle = document.getElementById("productFormTitle");
const pName = document.getElementById("pName");
const pPrice = document.getElementById("pPrice");
const pStock = document.getElementById("pStock");
const pCategory = document.getElementById("pCategory");
const pFeatured = document.getElementById("pFeatured");
const photoInput = document.getElementById("photoInput");
const imagesRow = document.getElementById("imagesRow");
const addImageBtn = document.getElementById("addImageBtn");
const customFieldsRow = document.getElementById("customFieldsRow");
const addFieldBtn = document.getElementById("addFieldBtn");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

let editingId = null;
let currentUser = null;
let supplierProfile = { city: "", lat: null, lng: null, status: "pending" };
let ordersUnsub = null;
let categoriesCache = [];
let productImages = [];
let regPendingCode = null, regPendingName = "", regPendingPhone = "";

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }

function listenCategories() {
  db.collection("categories").orderBy("order", "asc").onSnapshot(snap => {
    categoriesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const current = pCategory.value;
    pCategory.innerHTML = "";
    categoriesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name; opt.textContent = c.name;
      pCategory.appendChild(opt);
    });
    if (current) pCategory.value = current;
  });
}
if (typeof IRAN_CITIES !== "undefined") {
  const ph = document.createElement("option"); ph.value = ""; ph.textContent = "شهر خود را انتخاب کنید";
  supplierCitySelect.appendChild(ph);
  IRAN_CITIES.forEach(city => {
    const opt = document.createElement("option"); opt.value = city; opt.textContent = city;
    supplierCitySelect.appendChild(opt);
  });
}

// -------------------- نمایش صفحه‌های احراز هویت --------------------
function showAuthView(view) {
  [loginView, registerStep1, registerStep2, registerStep3, forgotView].forEach(v => v.classList.add("hidden"));
  view.classList.remove("hidden");
}

// -------------------- ورود --------------------
document.getElementById("loginBtn").onclick = () => {
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  const phone = document.getElementById("loginPhone").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!isValidIranPhone(phone)) { errEl.textContent = "شماره موبایل معتبر ایران وارد کنید (۰۹...)."; return; }
  auth.signInWithEmailAndPassword(phoneToVirtualEmail(phone), password)
    .catch(err => errEl.textContent = translateAuthError(err));
};
document.getElementById("goRegisterBtn").onclick = () => showAuthView(registerStep1);
document.getElementById("goForgotBtn").onclick = () => {
  showAuthView(forgotView);
  document.getElementById("forgotStepPhone").classList.remove("hidden");
  document.getElementById("forgotStepNoAccount").classList.add("hidden");
};
document.getElementById("backToLoginBtn1").onclick = () => showAuthView(loginView);
document.getElementById("backToLoginBtn2").onclick = () => showAuthView(loginView);

// -------------------- ثبت‌نام (۳ مرحله: شماره → کد → رمز) --------------------
document.getElementById("regSendCodeBtn").onclick = () => {
  const errEl = document.getElementById("regError1");
  errEl.textContent = "";
  const name = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  if (!name) { errEl.textContent = "نام فروشگاه را وارد کنید."; return; }
  if (!isValidIranPhone(phone)) { errEl.textContent = "شماره موبایل معتبر ایران وارد کنید (۰۹...)."; return; }
  regPendingName = name; regPendingPhone = normalizeIranPhone(phone);
  regPendingCode = generateDevOtp();
  document.getElementById("regDevCode").textContent = `⚠️ حالت آزمایشی (پیامک هنوز وصل نیست) — کد شما: ${regPendingCode}`;
  showAuthView(registerStep2);
};
document.getElementById("regVerifyBtn").onclick = () => {
  const errEl = document.getElementById("regError2");
  const code = document.getElementById("regOtp").value.trim();
  if (code !== regPendingCode) { errEl.textContent = "کد وارد‌شده درست نیست."; return; }
  errEl.textContent = "";
  showAuthView(registerStep3);
};
document.getElementById("regFinishBtn").onclick = () => {
  const errEl = document.getElementById("regError3");
  const pass = document.getElementById("regPassword").value;
  const pass2 = document.getElementById("regPasswordConfirm").value;
  if (pass.length < 6) { errEl.textContent = "رمز عبور باید حداقل ۶ کاراکتر باشد."; return; }
  if (pass !== pass2) { errEl.textContent = "تکرار رمز عبور یکسان نیست."; return; }
  auth.createUserWithEmailAndPassword(phoneToVirtualEmail(regPendingPhone), pass)
    .then(cred => cred.user.updateProfile({ displayName: regPendingName }).then(() =>
      db.collection("suppliers").doc(cred.user.uid).set({
        name: regPendingName, phone: regPendingPhone,
        status: "pending", city: "", lat: null, lng: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    ))
    .catch(err => errEl.textContent = translateAuthError(err));
};

// -------------------- فراموشی رمز --------------------
document.getElementById("forgotSendBtn").onclick = () => {
  const phone = document.getElementById("forgotPhone").value.trim();
  if (!isValidIranPhone(phone)) { showToast("شماره موبایل معتبر ایران وارد کنید"); return; }
  document.getElementById("forgotStepPhone").classList.add("hidden");
  document.getElementById("forgotStepNoAccount").classList.remove("hidden");
};

document.getElementById("logoutBtn").onclick = () => auth.signOut();
document.getElementById("pendingLogoutBtn").onclick = () => auth.signOut();

function translateAuthError(err) {
  const map = {
    "auth/invalid-email": "شماره یا فرمت آن معتبر نیست.",
    "auth/user-not-found": "حسابی با این شماره پیدا نشد.",
    "auth/wrong-password": "رمز عبور اشتباه است.",
    "auth/email-already-in-use": "این شماره قبلاً ثبت‌نام کرده — وارد شوید.",
    "auth/weak-password": "رمز عبور باید حداقل ۶ کاراکتر باشد.",
  };
  return map[err.code] || "خطایی رخ داد: " + err.message;
}

let supplierDocUnsub = null;
let panelStarted = false;

function startApprovedPanel(user) {
  if (panelStarted) return;
  panelStarted = true;
  panelSection.classList.remove("hidden");
  welcomeName.textContent = user.displayName || supplierProfile.phone || "";
  supplierCitySelect.value = supplierProfile.city || "";
  minOrderInput.value = supplierProfile.minOrder || "";
  deliveryFeeInput.value = supplierProfile.deliveryFee || "";
  if (supplierProfile.lat != null) locationStatusEl.textContent = "موقعیت مکانی دقیق ثبت شده ✅";
  listenCategories();
  listenMyProducts();
  listenOrders();
  listenAcceptedOrders();
  listenTrustedCustomers();
  listenCreditAccounts();
  renderReport();
  listenMessages();
}

let profileUnsub = null;
let lastRenderedStatus = null;

function showPendingDiag(user, status) {
  const el = document.getElementById("pendingDiag");
  if (el) el.textContent = "شناسه حساب: " + user.uid.slice(-6) + " · وضعیت روی سرور: " + status +
    " · نسخه برنامه: " + (typeof APP_VERSION !== "undefined" ? APP_VERSION : "؟");
}
document.getElementById("pendingRefreshBtn").onclick = () => location.reload();

function showApprovedPanel(user) {
  pendingSection.classList.add("hidden");
  panelSection.classList.remove("hidden");
  welcomeName.textContent = user.displayName || supplierProfile.phone || "";
  supplierCitySelect.value = supplierProfile.city || "";
  minOrderInput.value = supplierProfile.minOrder || "";
  deliveryFeeInput.value = supplierProfile.deliveryFee || "";
  if (supplierProfile.lat != null) locationStatusEl.textContent = "موقعیت مکانی دقیق ثبت شده ✅";
  if (lastRenderedStatus !== "approved") {
    // این بخش‌ها فقط یک‌بار (اولین ورود به حالت تایید‌شده) راه‌اندازی می‌شوند تا شنونده تکراری ساخته نشود
    listenCategories();
    listenMyProducts();
    listenOrders();
    listenAcceptedOrders();
    listenTrustedCustomers();
    renderReport();
    listenMessages();
  }
}

function showPendingOrRejectedPanel(user, status) {
  panelSection.classList.add("hidden");
  pendingSection.classList.remove("hidden");
  if (status === "rejected") {
    pendingSection.querySelector("h1").textContent = "درخواست شما رد شد";
    pendingSection.querySelector(".auth-sub").textContent = "متاسفانه درخواست همکاری شما تایید نشد. برای پیگیری پیام بفرستید.";
  } else {
    pendingSection.querySelector("h1").textContent = "در انتظار تایید";
    pendingSection.querySelector(".auth-sub").textContent = "حساب شما ثبت شد. تا زمانی که مدیر فروشگاه حساب شما را تایید نکند، امکان افزودن محصول وجود ندارد. برای پیگیری می‌توانید پیام بفرستید.";
  }
  showPendingDiag(user, status);
  if (lastRenderedStatus === null) listenPendingMessages();
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  if (ordersUnsub) { ordersUnsub(); ordersUnsub = null; }
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  lastRenderedStatus = null;
  loginView.classList.add("hidden");
  registerStep1.classList.add("hidden");
  registerStep2.classList.add("hidden");
  registerStep3.classList.add("hidden");
  forgotView.classList.add("hidden");
  pendingSection.classList.add("hidden");
  panelSection.classList.add("hidden");
  if (!user) { showAuthView(loginView); return; }

  // وضعیت حساب به‌صورت زنده دنبال می‌شود — بدون رفرش صفحه، فقط بخش مربوطه آپدیت می‌شود
  profileUnsub = db.collection("suppliers").doc(user.uid).onSnapshot(doc => {
    supplierProfile = doc.exists ? doc.data() : { status: "pending" };
    const status = supplierProfile.status || "pending";

    if (status === "approved") showApprovedPanel(user);
    else showPendingOrRejectedPanel(user, status);
    lastRenderedStatus = status;
  }, err => {
    console.error(err);
    showToast("خطا در خواندن وضعیت حساب: " + (err.code || err.message));
  });
});

// -------------------- تب‌ها --------------------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
  };
});

// -------------------- موقعیت / پروفایل فروشگاه --------------------
supplierCitySelect.onchange = () => { supplierProfile.city = supplierCitySelect.value; };

document.getElementById("saveProfileBtn").onclick = () => {
  supplierProfile.city = supplierCitySelect.value;
  supplierProfile.minOrder = Number(minOrderInput.value) || null;
  supplierProfile.deliveryFee = Number(deliveryFeeInput.value) || null;
  db.collection("suppliers").doc(currentUser.uid).set({
    city: supplierProfile.city, minOrder: supplierProfile.minOrder, deliveryFee: supplierProfile.deliveryFee,
  }, { merge: true }).then(() => showToast("ذخیره شد"));
};

getLocationBtn.onclick = () => {
  if (!navigator.geolocation) { showToast("مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند"); return; }
  getLocationBtn.textContent = "در حال دریافت موقعیت...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      supplierProfile.lat = pos.coords.latitude; supplierProfile.lng = pos.coords.longitude;
      db.collection("suppliers").doc(currentUser.uid).set({ lat: supplierProfile.lat, lng: supplierProfile.lng }, { merge: true });
      locationStatusEl.textContent = "موقعیت مکانی دقیق ثبت شده ✅";
      getLocationBtn.textContent = "دریافت موقعیت مکانی دقیق (برای صف سفارش‌ها)";
      showToast("موقعیت مکانی ثبت شد");
    },
    () => { showToast("دسترسی به موقعیت مکانی رد شد"); getLocationBtn.textContent = "دریافت موقعیت مکانی دقیق (برای صف سفارش‌ها)"; }
  );
};

// -------------------- تصاویر محصول (چندتایی) --------------------
function renderImagesRow() {
  imagesRow.innerHTML = "";
  productImages.forEach((img, idx) => {
    const slot = document.createElement("div");
    slot.className = "image-slot";
    const src = img.type === "existing" ? img.url : img.previewUrl;
    slot.innerHTML = `<img src="${src}"><button type="button" class="remove-img">✕</button>`;
    slot.querySelector(".remove-img").onclick = () => { productImages.splice(idx, 1); renderImagesRow(); };
    imagesRow.appendChild(slot);
  });
}

addImageBtn.onclick = () => photoInput.click();
photoInput.onchange = () => {
  const file = photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    productImages.push({ type: "new", file, previewUrl: e.target.result });
    renderImagesRow();
  };
  reader.readAsDataURL(file);
  photoInput.value = "";
};

// -------------------- فیلدهای دلخواه محصول --------------------
function addFieldRow(label, value) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML = `
    <input type="text" class="field field-label" placeholder="نام فیلد (مثلاً ابعاد)" value="${label || ""}">
    <input type="text" class="field field-value" placeholder="مقدار" value="${value || ""}">
    <button type="button" class="remove-field">✕</button>
  `;
  row.querySelector(".remove-field").onclick = () => row.remove();
  customFieldsRow.appendChild(row);
}
addFieldBtn.onclick = () => addFieldRow("", "");

function resetForm() {
  productForm.reset();
  productImages = []; renderImagesRow();
  customFieldsRow.innerHTML = "";
  editingId = null;
  productFormTitle.textContent = "افزودن محصول جدید";
  submitBtn.textContent = "ذخیره محصول";
  cancelEditBtn.classList.add("hidden");
}
cancelEditBtn.onclick = resetForm;

async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME") throw new Error("Cloudinary تنظیم نشده است.");
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) throw new Error("آپلود عکس ناموفق بود");
  return (await res.json()).secure_url;
}

// -------------------- ثبت / ویرایش محصول --------------------
productForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const name = pName.value.trim();
  const price = Number(pPrice.value);
  const stock = Number(pStock.value);
  const category = pCategory.value;
  if (!name || !price) { showToast("عنوان و قیمت را کامل کنید"); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "در حال ذخیره...";
  try {
    const newFiles = productImages.filter(i => i.type === "new");
    const uploadedUrls = [];
    for (const item of newFiles) uploadedUrls.push(await uploadToCloudinary(item.file));
    let uploadIdx = 0;
    const finalImages = productImages.map(i => i.type === "existing" ? i.url : uploadedUrls[uploadIdx++]);

    const fields = Array.from(customFieldsRow.querySelectorAll(".field-row")).map(row => ({
      label: row.querySelector(".field-label").value.trim(),
      value: row.querySelector(".field-value").value.trim(),
    })).filter(f => f.label || f.value);

    const data = {
      name, price, category, stock: isNaN(stock) ? 0 : stock,
      images: finalImages, fields,
      featured: !!pFeatured.checked,
      supplierId: currentUser.uid,
      supplierName: currentUser.displayName || currentUser.email,
      supplierCity: supplierProfile.city || null,
    };
    if (supplierProfile.lat != null) data.supplierLat = supplierProfile.lat;
    if (supplierProfile.lng != null) data.supplierLng = supplierProfile.lng;

    if (editingId) {
      data.status = "pending";
      await db.collection("products").doc(editingId).update(data);
      showToast("محصول ویرایش شد و برای تایید مجدد ارسال شد");
    } else {
      data.status = "pending";
      data.available = true;
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("products").add(data);
      showToast("محصول ثبت شد — پس از تایید مدیر نمایش داده می‌شود");
    }
    resetForm();
  } catch (err) {
    console.error(err);
    showToast(err.message || "خطا در ذخیره محصول");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? "ذخیره تغییرات" : "ذخیره محصول";
  }
};

// -------------------- محصولات من --------------------
function listenMyProducts() {
  db.collection("products").where("supplierId", "==", currentUser.uid).onSnapshot(snapshot => {
    renderMyProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, err => { console.error(err); myProductsEl.innerHTML = `<p class="my-empty">خطا در بارگذاری محصولات شما.</p>`; });
}

function statusBadge(status) {
  const map = {
    pending: { text: "در انتظار تایید", cls: "badge-pending" },
    approved: { text: "تایید شده", cls: "badge-approved" },
    rejected: { text: "رد شده", cls: "badge-rejected" },
  };
  const s = map[status] || map.pending;
  return `<span class="status-badge ${s.cls}">${s.text}</span>`;
}

function renderMyProducts(items) {
  if (items.length === 0) { myProductsEl.innerHTML = `<p class="my-empty">هنوز محصولی ثبت نکرده‌اید.</p>`; return; }
  myProductsEl.innerHTML = "";
  items.forEach(p => {
    const img = (p.images && p.images[0]) || p.imageUrl;
    const available = p.available !== false;
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      ${img ? `<img src="${img}" alt="">` : `<div class="ph">🍽️</div>`}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}${p.featured ? " 🔥" : ""}</div>
        <div class="my-product-price">${toman(p.price)} · موجودی: ${p.stock ?? 0}</div>
        ${statusBadge(p.status)}
        ${!available ? `<span class="status-badge badge-rejected">اتمام موجودی در بازار</span>` : ""}
      </div>
      <div class="my-product-actions">
        <button data-act="edit">ویرایش</button>
        <button data-act="toggle-avail">${available ? "اتمام موجودی در بازار" : "بازگرداندن به موجود"}</button>
        <button data-act="delete">حذف</button>
      </div>
    `;
    row.querySelector('[data-act="edit"]').onclick = () => startEdit(p);
    row.querySelector('[data-act="toggle-avail"]').onclick = () => {
      db.collection("products").doc(p.id).update({ available: !available })
        .then(() => showToast(available ? "به‌عنوان اتمام موجودی علامت خورد" : "دوباره موجود شد"));
    };
    row.querySelector('[data-act="delete"]').onclick = () => deleteProduct(p.id, p.name);
    myProductsEl.appendChild(row);
  });
}

function startEdit(p) {
  editingId = p.id;
  pName.value = p.name || ""; pPrice.value = p.price || "";
  pStock.value = p.stock ?? 0; pCategory.value = p.category || "";
  pFeatured.checked = !!p.featured;
  productImages = (p.images && p.images.length ? p.images : (p.imageUrl ? [p.imageUrl] : [])).map(url => ({ type: "existing", url }));
  renderImagesRow();
  customFieldsRow.innerHTML = "";
  (p.fields || []).forEach(f => addFieldRow(f.label, f.value));
  productFormTitle.textContent = "ویرایش محصول";
  submitBtn.textContent = "ذخیره تغییرات";
  cancelEditBtn.classList.remove("hidden");
  document.querySelector('[data-tab="products"]').click();
  productForm.scrollIntoView({ behavior: "smooth" });
}

function deleteProduct(id, name) {
  if (!confirm(`آیا مطمئن هستید که می‌خواهید «${name}» را حذف کنید؟`)) return;
  if (!confirm("این عمل قابل بازگشت نیست. حذف نهایی شود؟")) return;
  db.collection("products").doc(id).delete()
    .then(() => showToast("محصول حذف شد"))
    .catch(err => { console.error(err); showToast("خطا در حذف محصول"); });
}

// -------------------- سفارش‌ها (صف هدایت) --------------------
function isVisibleToMe(order) {
  const myIndex = order.queue.indexOf(currentUser.uid);
  if (myIndex === -1) return false;
  if ((order.rejections || {})[currentUser.uid]) return false;
  if (order.assignedTo) return false;
  for (let i = 0; i < myIndex; i++) if (!(order.rejections || {})[order.queue[i]]) return false;
  return true;
}


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
  const ordersTabBtn = document.querySelector('[data-tab="orders"]');
  if (ordersTabBtn) ordersTabBtn.click();
};

function listenOrders() {
  if (ordersUnsub) ordersUnsub();
  neworderFirstLoad = true;
  ordersUnsub = db.collection("orders")
    .where("queue", "array-contains", currentUser.uid)
    .onSnapshot(snapshot => {
      if (!neworderFirstLoad) {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
            const o = { id: change.doc.id, ...change.doc.data() };
            if (o.status === "pending" && isVisibleToMe(o)) showNewOrderPopup(o);
          }
        });
      }
      neworderFirstLoad = false;
      window._myOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(o => o.status === "pending");
      renderOrders();
    }, err => { console.error(err); ordersListEl.innerHTML = `<p class="my-empty">خطا در بارگذاری سفارش‌ها.</p>`; });
}

const stockCache = {};
function getProductStock(productId) {
  if (stockCache[productId] !== undefined) return Promise.resolve(stockCache[productId]);
  return db.collection("products").doc(productId).get().then(doc => {
    const stock = doc.exists ? (doc.data().stock ?? null) : null;
    stockCache[productId] = stock;
    return stock;
  }).catch(() => null);
}

function paymentSummaryHtml(o) {
  if (!o.paymentMethod) return "";
  const statusMap = { pending_review: "در انتظار بررسی", approved: "تایید شده", rejected: "رد شده" };
  const statusCls = { pending_review: "badge-pending", approved: "badge-approved", rejected: "badge-rejected" };
  let details = "";
  if (o.paymentMethod === "receipt") {
    details = `<div>روش پرداخت: فیش واریزی</div>`;
  } else {
    details = `
      <div>روش پرداخت: چک — بانک ${o.checkBank || "—"} · سریال ${o.checkSerial || "—"}</div>
      <div>شماره صیادی: ${o.checkSayad || "—"} · سررسید: ${window.Jalali ? Jalali.isoToShamsi(o.checkDueDate) : o.checkDueDate} · مبلغ: ${toman(o.checkAmount)}</div>
    `;
  }
  const photoUrl = o.receiptImageUrl || o.checkImageUrl;
  const rejectReason = o.paymentStatus === "rejected" && o.paymentRejectionReason ? `<div class="order-shortfall">دلیل رد: ${o.paymentRejectionReason}</div>` : "";
  return `
    <div class="payment-box">
      <div class="order-head"><span class="status-badge ${statusCls[o.paymentStatus]}">پرداخت: ${statusMap[o.paymentStatus] || o.paymentStatus}</span></div>
      ${details}
      ${photoUrl ? `<a href="${photoUrl}" target="_blank" class="payment-photo-link">مشاهده عکس ${o.paymentMethod === "receipt" ? "فیش" : "چک"}</a>` : ""}
      ${rejectReason}
      ${o.paymentMethod === "check" && o.paymentStatus === "approved" ? `<div class="sayad-tag">وضعیت صیادی: ${o.sayadReceived ? "دریافت شد ✅" : "دریافت نشده"}</div>` : ""}
      ${o.paymentStatus === "pending_review" ? `
        <div class="order-actions">
          <button data-act="approve-payment" class="primary-action">تایید پرداخت</button>
          <button data-act="reject-payment">رد پرداخت</button>
        </div>` : ""}
    </div>
  `;
}

function renderOrders() {
  const orders = (window._myOrders || []).filter(isVisibleToMe);
  if (orders.length === 0) { ordersListEl.innerHTML = `<p class="my-empty">در حال حاضر سفارشی برای شما نیست.</p>`; return; }
  ordersListEl.innerHTML = "";
  orders.forEach(o => {
    const itemsText = (o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ");
    const myIndex = o.queue.indexOf(currentUser.uid);
    const noteText = (myIndex + 1 < o.queue.length)
      ? "این سفارش فقط برای شماست. اگر رد کنید، بلافاصله به نزدیک‌ترین تامین‌کننده بعدی نمایش داده می‌شود."
      : "شما آخرین گزینه برای این سفارش هستید.";
    const paymentApproved = !o.paymentMethod || o.paymentStatus === "approved";
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">سفارش جدید</span></div>
      <div class="order-items">${itemsText}</div>
      <div class="order-shortfall"></div>
      ${paymentSummaryHtml(o)}
      <div class="order-total">${toman(o.total)}</div>
      <div class="order-meta">${o.buyerAddress || o.buyerCity || ""}</div>
      <div class="order-countdown">${noteText}</div>
      <div class="order-actions">
        <a href="tel:${o.buyerPhone}">تماس با خریدار</a>
        <button data-act="accept" class="primary-action" ${paymentApproved ? "" : "disabled style=\"opacity:.4\""}>قبول سفارش</button>
        <button data-act="reject">رد کردن</button>
      </div>
      ${!paymentApproved ? `<p class="wizard-note">اول باید پرداخت را تایید کنید.</p>` : ""}
    `;
    card.querySelector('[data-act="accept"]').onclick = () => { if (paymentApproved) acceptOrder(o.id); };
    card.querySelector('[data-act="reject"]').onclick = () => rejectOrder(o.id);
    const approvePayBtn = card.querySelector('[data-act="approve-payment"]');
    if (approvePayBtn) approvePayBtn.onclick = () => {
      db.collection("orders").doc(o.id).update({ paymentStatus: "approved" }).then(() => showToast("پرداخت تایید شد"));
    };
    const rejectPayBtn = card.querySelector('[data-act="reject-payment"]');
    if (rejectPayBtn) rejectPayBtn.onclick = () => {
      const reason = prompt("دلیل رد پرداخت را بنویسید تا مشتری متوجه شود:");
      if (!reason || !reason.trim()) return;
      db.collection("orders").doc(o.id).update({ paymentStatus: "rejected", paymentRejectionReason: reason.trim() })
        .then(() => showToast("پرداخت رد شد"));
    };
    ordersListEl.appendChild(card);

    // هشدار کمبود موجودی — فقط برای اطلاع خود تامین‌کننده، هیچ‌وقت برای مشتری
    const shortfallEl = card.querySelector(".order-shortfall");
    Promise.all((o.items || []).map(it => getProductStock(it.productId).then(stock => ({ it, stock }))))
      .then(results => {
        const shortages = results.filter(r => r.stock != null && r.it.qty > r.stock);
        if (shortages.length === 0) return;
        shortfallEl.innerHTML = shortages.map(r =>
          `⚠️ ${r.it.name}: موجودی ثبت‌شده ${r.stock} عدد است، ${r.it.qty - r.stock} عدد کسری دارید — لطفاً تامین کنید.`
        ).join("<br>");
      });
  });
}

function acceptOrder(orderId) {
  const ref = db.collection("orders").doc(orderId);
  const creditRef = db.collection("creditAccounts"); // بعداً در تراکنش با شناسه دقیق واکشی می‌شود
  db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("سفارش پیدا نشد");
    const data = doc.data();
    if (data.status !== "pending" || data.assignedTo) throw new Error("این سفارش قبلاً توسط تامین‌کننده دیگری پذیرفته شده");
    if (data.paymentMethod && data.paymentStatus !== "approved") throw new Error("اول باید پرداخت را تایید کنید");

    if (data.paymentMethod === "credit") {
      const accId = `${data.buyerPhone}_${currentUser.uid}`;
      const accRef = creditRef.doc(accId);
      const accDoc = await tx.get(accRef);
      if (!accDoc.exists) throw new Error("شما برای این مشتری اعتباری ثبت نکرده‌اید");
      const acc = accDoc.data();
      const used = acc.used || 0;
      const limit = acc.limit || 0;
      if (used + data.total > limit) throw new Error("این سفارش از سقف اعتبار باقیمانده مشتری بیشتر است");
      tx.update(accRef, { used: used + data.total });
    }

    tx.update(ref, { status: "assigned", assignedTo: currentUser.uid, assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }).then(() => showToast("سفارش پذیرفته شد ✅"))
    .catch(err => { console.error(err); showToast(err.message || "خطا در پذیرش سفارش"); });
}

function rejectOrder(orderId) {
  const order = (window._myOrders || []).find(o => o.id === orderId);
  if (!order) return;
  const rejections = { ...(order.rejections || {}), [currentUser.uid]: Date.now() };
  const allRejected = order.queue.every(uid => rejections[uid]);
  const update = { [`rejections.${currentUser.uid}`]: Date.now() };
  if (allRejected) update.status = "unclaimed";
  db.collection("orders").doc(orderId).update(update)
    .then(() => showToast("سفارش رد شد"))
    .catch(err => { console.error(err); showToast("خطا در ثبت رد سفارش"); });
}

// -------------------- سفارش‌های پذیرفته‌شده من (برای وضعیت صیادی) --------------------
let acceptedOrdersUnsub = null;
function listenAcceptedOrders() {
  if (acceptedOrdersUnsub) acceptedOrdersUnsub();
  acceptedOrdersUnsub = db.collection("orders").where("assignedTo", "==", currentUser.uid)
    .onSnapshot(snap => renderAcceptedOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).slice(0, 50)),
      err => console.error(err));
}

function renderAcceptedOrders(orders) {
  const el = document.getElementById("acceptedOrdersList");
  renderCreditSettlements(orders);
  const checkOrders = orders.filter(o => o.paymentMethod === "check");
  if (orders.length === 0) { el.innerHTML = `<p class="my-empty">هنوز سفارشی نپذیرفته‌اید.</p>`; return; }
  el.innerHTML = "";
  orders.forEach(o => {
    const row = document.createElement("div");
    row.className = "order-card";
    const sayadRow = o.paymentMethod === "check"
      ? `<div class="sayad-tag">صیادی: ${o.sayadReceived ? "دریافت شد ✅" : "دریافت نشده"}</div>
         ${!o.sayadReceived ? `<button data-act="sayad" class="primary-action">علامت‌گذاری «صیادی دریافت شد»</button>` : ""}`
      : "";
    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-approved">پذیرفته‌شده</span><span style="font-size:11px;color:var(--muted)">کد: ${o.id.slice(-8).toUpperCase()}</span></div>
      <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
      <div class="order-total">${toman(o.total)}</div>
      ${sayadRow}
    `;
    const sayadBtn = row.querySelector('[data-act="sayad"]');
    if (sayadBtn) sayadBtn.onclick = () => db.collection("orders").doc(o.id).update({ sayadReceived: true }).then(() => showToast("ثبت شد"));
    el.appendChild(row);
  });
}

// -------------------- مشتریان معتبر (اجازه خرید چکی) --------------------
let trustedUnsub = null;
function listenTrustedCustomers() {
  if (trustedUnsub) trustedUnsub();
  trustedUnsub = db.collection("trustedCustomers")
    .where("trustedBy", "array-contains", currentUser.uid)
    .onSnapshot(snap => renderTrustedList(snap.docs.map(d => ({ phone: d.id, ...d.data() }))),
      err => console.error(err));
}

function renderTrustedList(items) {
  const el = document.getElementById("trustedList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز مشتری معتبری اضافه نکرده‌اید.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      <div class="ph">👤</div>
      <div class="my-product-info"><div class="my-product-name">${c.phone}</div></div>
      <div class="my-product-actions"><button data-act="remove">حذف اعتماد</button></div>
    `;
    row.querySelector('[data-act="remove"]').onclick = () => {
      db.collection("trustedCustomers").doc(c.phone).update({
        trustedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
      }).then(() => showToast("حذف شد"));
    };
    el.appendChild(row);
  });
}

document.getElementById("trustedForm").onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById("trustedPhoneInput");
  const phone = input.value.trim();
  if (!/^09\d{9}$/.test(phone)) { showToast("شماره موبایل معتبر ایرانی وارد کنید"); return; }
  db.collection("trustedCustomers").doc(phone).set({
    trustedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
  }, { merge: true }).then(() => { showToast("اضافه شد"); input.value = ""; });
};

// -------------------- سقف اعتبار مشتریان (خرید اعتباری) --------------------
let creditUnsub = null;
function listenCreditAccounts() {
  if (creditUnsub) creditUnsub();
  creditUnsub = db.collection("creditAccounts").where("supplierUid", "==", currentUser.uid)
    .onSnapshot(snap => renderCreditList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error(err));
}

function renderCreditList(items) {
  const el = document.getElementById("creditList");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز به مشتری‌ای اعتبار نداده‌اید.</p>`; return; }
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
        <div class="my-product-price">سقف: ${toman(c.limit)} · مصرف‌شده: ${toman(used)} · باقیمانده: ${toman(remaining)}</div>
      </div>
      <div class="my-product-actions"><button data-act="remove">حذف اعتبار</button></div>
    `;
    row.querySelector('[data-act="remove"]').onclick = () => {
      if (!confirm(`اعتبار «${c.phone}» حذف شود؟`)) return;
      Promise.all([
        db.collection("creditAccounts").doc(c.id).delete(),
        db.collection("creditFlags").doc(c.phone).set({ suppliers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) }, { merge: true }),
      ]).then(() => showToast("حذف شد"));
    };
    el.appendChild(row);
  });
}

document.getElementById("creditForm").onsubmit = (e) => {
  e.preventDefault();
  const phone = normalizeIranPhone(document.getElementById("creditPhoneInput").value);
  const limit = Number(document.getElementById("creditLimitInput").value);
  if (!/^09\d{9}$/.test(phone)) { showToast("شماره موبایل معتبر ایرانی وارد کنید"); return; }
  if (!limit || limit <= 0) { showToast("سقف اعتبار را وارد کنید"); return; }
  const accId = `${phone}_${currentUser.uid}`;
  Promise.all([
    db.collection("creditAccounts").doc(accId).set({ phone, limit, supplierUid: currentUser.uid }, { merge: true }),
    // فقط «وجود اعتبار» به‌صورت عمومی ثبت می‌شود، نه سقف آن
    db.collection("creditFlags").doc(phone).set({ suppliers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true }),
  ]).then(() => {
    showToast("سقف اعتبار ثبت شد");
    document.getElementById("creditForm").reset();
  }).catch(err => { console.error(err); showToast("خطا در ثبت اعتبار"); });
};

// -------------------- تایید واریزی‌های تسویه اعتبار --------------------
function renderCreditSettlements(orders) {
  const el = document.getElementById("creditSettlementsList");
  const pending = orders.filter(o => o.paymentMethod === "credit" && o.creditSettlement && o.creditSettlement.status === "pending");
  if (pending.length === 0) { el.innerHTML = `<p class="my-empty">واریزی در انتظار تاییدی نیست.</p>`; return; }
  el.innerHTML = "";
  pending.forEach(o => {
    const s = o.creditSettlement;
    const photo = s.photoUrl ? `<a href="${s.photoUrl}" target="_blank">مشاهده عکس</a>` : "";
    const row = document.createElement("div");
    row.className = "order-card";
    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">درخواست واریز اعتباری</span></div>
      <div class="order-items">مشتری: ${o.buyerPhone} · مبلغ واریزی: ${toman(s.amount)} · روش: ${s.method === "check" ? "چک" : "فیش بانکی"}</div>
      <div class="order-meta">${photo}</div>
      <div class="order-actions">
        <button data-act="approve" class="primary-action">تایید واریز</button>
        <button data-act="reject">رد</button>
      </div>
    `;
    row.querySelector('[data-act="approve"]').onclick = () => approveCreditSettlement(o);
    row.querySelector('[data-act="reject"]').onclick = () => {
      const reason = prompt("دلیل رد واریز را بنویسید (برای مشتری نمایش داده می‌شود):");
      if (reason === null) return;
      db.collection("orders").doc(o.id).update({
        "creditSettlement.status": "rejected",
        "creditSettlement.rejectionReason": reason.trim(),
      }).then(() => showToast("رد شد"));
    };
    el.appendChild(row);
  });
}

function approveCreditSettlement(o) {
  const accId = `${o.buyerPhone}_${currentUser.uid}`;
  const accRef = db.collection("creditAccounts").doc(accId);
  const orderRef = db.collection("orders").doc(o.id);
  db.runTransaction(async (tx) => {
    const accDoc = await tx.get(accRef);
    if (!accDoc.exists) throw new Error("حساب اعتباری پیدا نشد");
    const used = accDoc.data().used || 0;
    const newUsed = Math.max(0, used - o.creditSettlement.amount);
    tx.update(accRef, { used: newUsed });
    tx.update(orderRef, { "creditSettlement.status": "approved", creditSettled: true });
  }).then(() => showToast("واریز تایید و از بدهی کسر شد"))
    .catch(err => { console.error(err); showToast(err.message || "خطا در ثبت"); });
}

// -------------------- گزارش عملکرد من --------------------
function renderReport() {
  Promise.all([
    db.collection("orders").where("assignedTo", "==", currentUser.uid).get(),
    db.collection("orders").where(`rejections.${currentUser.uid}`, ">", 0).get(),
  ]).then(([acceptedSnap, rejectedSnap]) => {
    const accepted = acceptedSnap.docs.map(d => d.data());
    const revenue = accepted.reduce((s, o) => s + (o.total || 0), 0);
    reportBox.innerHTML = `
      <div class="report-item"><span>سفارش‌های پذیرفته‌شده</span><b>${accepted.length}</b></div>
      <div class="report-item"><span>سفارش‌های رد‌شده</span><b>${rejectedSnap.size}</b></div>
      <div class="report-item"><span>درآمد شما</span><b>${toman(revenue)}</b></div>
    `;
  }).catch(err => console.error(err));
}

// -------------------- پیام‌رسانی با مدیر --------------------
function renderMessages(container, msgs) {
  container.innerHTML = "";
  msgs.forEach(m => {
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble " + (m.sender === "supplier" ? "me" : "them");
    bubble.textContent = m.text;
    container.appendChild(bubble);
  });
  container.scrollTop = container.scrollHeight;
}
function listenMessages() {
  db.collection("messages").where("supplierId", "==", currentUser.uid)
    .onSnapshot(snap => renderMessages(document.getElementById("supplierMessages"), snap.docs.map(d => d.data()).sort((a, b) => ((a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now()) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now())))));
}
function listenPendingMessages() {
  db.collection("messages").where("supplierId", "==", currentUser.uid)
    .onSnapshot(snap => renderMessages(document.getElementById("pendingMessages"), snap.docs.map(d => d.data()).sort((a, b) => ((a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now()) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now())))));
}
function sendMessage(text) {
  if (!text.trim() || !currentUser) return;
  db.collection("messages").add({
    supplierId: currentUser.uid, sender: "supplier", text: text.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
document.getElementById("supplierMsgSend").onclick = () => { const i = document.getElementById("supplierMsgInput"); sendMessage(i.value); i.value = ""; };
document.getElementById("pendingMsgSend").onclick = () => { const i = document.getElementById("pendingMsgInput"); sendMessage(i.value); i.value = ""; };
