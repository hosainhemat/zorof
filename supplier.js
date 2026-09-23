// -----------------------------------------------------------------
// پنل تامین‌کننده — ظرف من
// -----------------------------------------------------------------

const authSection = document.getElementById("authSection");
const pendingSection = document.getElementById("pendingSection");
const panelSection = document.getElementById("panelSection");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const supplierNameInput = document.getElementById("supplierName");
const supplierPhoneInput = document.getElementById("supplierPhone");
const authError = document.getElementById("authError");
const welcomeName = document.getElementById("welcomeName");
const myProductsEl = document.getElementById("myProducts");
const toastEl = document.getElementById("toast");
const supplierCitySelect = document.getElementById("supplierCity");
const getLocationBtn = document.getElementById("getLocationBtn");
const locationStatusEl = document.getElementById("locationStatus");
const ordersListEl = document.getElementById("ordersList");
const reportBox = document.getElementById("reportBox");

const productForm = document.getElementById("productForm");
const pName = document.getElementById("pName");
const pDesc = document.getElementById("pDesc");
const pPrice = document.getElementById("pPrice");
const pStock = document.getElementById("pStock");
const pCategory = document.getElementById("pCategory");
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");
const photoPickerLabel = document.getElementById("photoPickerLabel");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

let editingId = null;
let selectedFile = null;
let currentUser = null;
let supplierProfile = { city: "", lat: null, lng: null, status: "pending" };
let ordersUnsub = null;
let ordersTimer = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }

// دسته‌بندی‌ها
(PRODUCT_CATEGORIES || []).forEach(cat => {
  const opt = document.createElement("option");
  opt.value = cat; opt.textContent = cat;
  pCategory.appendChild(opt);
});
// شهرها
if (typeof IRAN_CITIES !== "undefined") {
  const ph = document.createElement("option"); ph.value = ""; ph.textContent = "شهر خود را انتخاب کنید";
  supplierCitySelect.appendChild(ph);
  IRAN_CITIES.forEach(city => {
    const opt = document.createElement("option"); opt.value = city; opt.textContent = city;
    supplierCitySelect.appendChild(opt);
  });
}

// -------------------- احراز هویت --------------------
document.getElementById("loginBtn").onclick = () => {
  authError.textContent = "";
  auth.signInWithEmailAndPassword(authEmail.value.trim(), authPass.value)
    .catch(err => authError.textContent = translateAuthError(err));
};

document.getElementById("registerBtn").onclick = () => {
  authError.textContent = "";
  const name = supplierNameInput.value.trim();
  const phone = supplierPhoneInput.value.trim();
  if (!name || !phone) { authError.textContent = "نام فروشگاه و شماره تماس الزامی است."; return; }
  auth.createUserWithEmailAndPassword(authEmail.value.trim(), authPass.value)
    .then(cred => {
      return cred.user.updateProfile({ displayName: name }).then(() =>
        db.collection("suppliers").doc(cred.user.uid).set({
          name, phone, email: authEmail.value.trim(),
          status: "pending", city: "", lat: null, lng: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
      );
    })
    .catch(err => authError.textContent = translateAuthError(err));
};

document.getElementById("logoutBtn").onclick = () => auth.signOut();
document.getElementById("pendingLogoutBtn").onclick = () => auth.signOut();

function translateAuthError(err) {
  const map = {
    "auth/invalid-email": "ایمیل معتبر نیست.",
    "auth/user-not-found": "کاربری با این ایمیل پیدا نشد.",
    "auth/wrong-password": "رمز عبور اشتباه است.",
    "auth/email-already-in-use": "این ایمیل قبلاً ثبت‌نام کرده — وارد شوید.",
    "auth/weak-password": "رمز عبور باید حداقل ۶ کاراکتر باشد.",
  };
  return map[err.code] || "خطایی رخ داد: " + err.message;
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  if (ordersUnsub) { ordersUnsub(); ordersUnsub = null; }
  if (ordersTimer) { clearInterval(ordersTimer); ordersTimer = null; }

  authSection.classList.add("hidden");
  pendingSection.classList.add("hidden");
  panelSection.classList.add("hidden");

  if (!user) { authSection.classList.remove("hidden"); return; }

  db.collection("suppliers").doc(user.uid).get().then(doc => {
    supplierProfile = doc.exists ? doc.data() : { status: "pending" };
    if (supplierProfile.status === "approved") {
      panelSection.classList.remove("hidden");
      welcomeName.textContent = user.displayName || user.email;
      supplierCitySelect.value = supplierProfile.city || "";
      if (supplierProfile.lat != null) locationStatusEl.textContent = "موقعیت مکانی دقیق ثبت شده ✅";
      listenMyProducts();
      listenOrders();
      renderReport();
      listenMessages();
    } else if (supplierProfile.status === "rejected") {
      pendingSection.classList.remove("hidden");
      pendingSection.querySelector("h1").textContent = "درخواست شما رد شد";
      pendingSection.querySelector(".auth-sub").textContent = "متاسفانه درخواست همکاری شما تایید نشد. برای پیگیری پیام بفرستید.";
      listenPendingMessages();
    } else {
      pendingSection.classList.remove("hidden");
      listenPendingMessages();
    }
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

// -------------------- موقعیت فروشگاه --------------------
supplierCitySelect.onchange = () => {
  supplierProfile.city = supplierCitySelect.value;
  db.collection("suppliers").doc(currentUser.uid).set({ city: supplierProfile.city }, { merge: true });
};

getLocationBtn.onclick = () => {
  if (!navigator.geolocation) { showToast("مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند"); return; }
  getLocationBtn.textContent = "در حال دریافت موقعیت...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      supplierProfile.lat = pos.coords.latitude;
      supplierProfile.lng = pos.coords.longitude;
      db.collection("suppliers").doc(currentUser.uid).set({ lat: supplierProfile.lat, lng: supplierProfile.lng }, { merge: true });
      locationStatusEl.textContent = "موقعیت مکانی دقیق ثبت شده ✅";
      getLocationBtn.textContent = "دریافت موقعیت مکانی دقیق (برای صف سفارش‌ها)";
      showToast("موقعیت مکانی ثبت شد");
    },
    () => { showToast("دسترسی به موقعیت مکانی رد شد"); getLocationBtn.textContent = "دریافت موقعیت مکانی دقیق (برای صف سفارش‌ها)"; }
  );
};

// -------------------- انتخاب عکس --------------------
photoInput.onchange = () => {
  const file = photoInput.files[0];
  if (!file) return;
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => { photoPreview.src = e.target.result; photoPreview.classList.remove("hidden"); photoPickerLabel.classList.add("hidden"); };
  reader.readAsDataURL(file);
};

function resetForm() {
  productForm.reset();
  photoPreview.classList.add("hidden"); photoPreview.src = "";
  photoPickerLabel.classList.remove("hidden");
  selectedFile = null; editingId = null;
  submitBtn.textContent = "افزودن محصول";
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
  const desc = pDesc.value.trim();
  const price = Number(pPrice.value);
  const stock = Number(pStock.value);
  const category = pCategory.value;
  if (!name || !price) { showToast("عنوان و قیمت را کامل کنید"); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "در حال ذخیره...";
  try {
    let imageUrl = null;
    if (selectedFile) imageUrl = await uploadToCloudinary(selectedFile);

    const data = {
      name, desc, price, category, stock: isNaN(stock) ? 0 : stock,
      supplierId: currentUser.uid,
      supplierName: currentUser.displayName || currentUser.email,
      supplierCity: supplierProfile.city || null,
    };
    if (supplierProfile.lat != null) data.supplierLat = supplierProfile.lat;
    if (supplierProfile.lng != null) data.supplierLng = supplierProfile.lng;
    if (imageUrl) data.imageUrl = imageUrl;

    if (editingId) {
      data.status = "pending";
      await db.collection("products").doc(editingId).update(data);
      showToast("محصول ویرایش شد و برای تایید مجدد ارسال شد");
    } else {
      data.status = "pending";
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("products").add(data);
      showToast("محصول ثبت شد — پس از تایید مدیر نمایش داده می‌شود");
    }
    resetForm();
  } catch (err) {
    console.error(err);
    showToast("خطا در ذخیره محصول");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? "ذخیره تغییرات" : "افزودن محصول";
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
    const row = document.createElement("div");
    row.className = "my-product";
    const thumb = p.imageUrl ? `<img src="${p.imageUrl}" alt="">` : `<div class="ph">🍽️</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}</div>
        <div class="my-product-price">${toman(p.price)} · موجودی: ${p.stock ?? 0}</div>
        ${statusBadge(p.status)}
      </div>
      <div class="my-product-actions">
        <button data-act="edit">ویرایش</button>
        <button data-act="delete">حذف</button>
      </div>
    `;
    row.querySelector('[data-act="edit"]').onclick = () => startEdit(p);
    row.querySelector('[data-act="delete"]').onclick = () => deleteProduct(p.id);
    myProductsEl.appendChild(row);
  });
}

function startEdit(p) {
  editingId = p.id;
  pName.value = p.name || ""; pDesc.value = p.desc || ""; pPrice.value = p.price || "";
  pStock.value = p.stock ?? 0; pCategory.value = p.category || "";
  if (p.imageUrl) { photoPreview.src = p.imageUrl; photoPreview.classList.remove("hidden"); photoPickerLabel.classList.add("hidden"); }
  submitBtn.textContent = "ذخیره تغییرات";
  cancelEditBtn.classList.remove("hidden");
  document.querySelector('[data-tab="products"]').click();
  productForm.scrollIntoView({ behavior: "smooth" });
}

function deleteProduct(id) {
  if (!confirm("این محصول حذف شود؟")) return;
  db.collection("products").doc(id).delete()
    .then(() => showToast("محصول حذف شد"))
    .catch(err => { console.error(err); showToast("خطا در حذف محصول"); });
}

// -------------------- سفارش‌ها (صف هدایت) --------------------
const REVEAL_WINDOW_MS = 2 * 60 * 1000; // ۲ دقیقه

function revealTimeForIndex(order, i) {
  if (i === 0) return order.createdAtMs;
  const prevSupplier = order.queue[i - 1];
  const prevReveal = revealTimeForIndex(order, i - 1);
  const prevReject = (order.rejections || {})[prevSupplier];
  return prevReject ? prevReject : prevReveal + REVEAL_WINDOW_MS;
}

function isVisibleToMe(order) {
  const myIndex = order.queue.indexOf(currentUser.uid);
  if (myIndex === -1) return false;
  if ((order.rejections || {})[currentUser.uid]) return false; // خودم رد کرده‌ام
  if (order.assignedTo) return false; // قبلاً پذیرفته شده
  return Date.now() >= revealTimeForIndex(order, myIndex);
}

function listenOrders() {
  if (ordersUnsub) ordersUnsub();
  ordersUnsub = db.collection("orders")
    .where("queue", "array-contains", currentUser.uid)
    .where("status", "==", "pending")
    .onSnapshot(snapshot => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      window._myOrders = orders;
      renderOrders();
    }, err => { console.error(err); ordersListEl.innerHTML = `<p class="my-empty">خطا در بارگذاری سفارش‌ها.</p>`; });

  if (ordersTimer) clearInterval(ordersTimer);
  ordersTimer = setInterval(renderOrders, 5000); // برای به‌روزرسانی نمایش/شمارش معکوس
}

function renderOrders() {
  const orders = (window._myOrders || []).filter(isVisibleToMe);
  if (orders.length === 0) { ordersListEl.innerHTML = `<p class="my-empty">در حال حاضر سفارشی برای شما نیست.</p>`; return; }
  ordersListEl.innerHTML = "";
  orders.forEach(o => {
    const itemsText = (o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ");
    const myIndex = o.queue.indexOf(currentUser.uid);
    const nextReveal = revealTimeForIndex(o, myIndex + 1);
    const remainMs = Math.max(0, nextReveal - Date.now());
    const remainMin = Math.floor(remainMs / 60000);
    const remainSec = Math.floor((remainMs % 60000) / 1000);
    const timeLabel = (myIndex + 1 < o.queue.length)
      ? `اگر پاسخ ندهید، تا ${remainMin}:${String(remainSec).padStart(2, "0")} دیگر به تامین‌کننده بعدی هم نمایش داده می‌شود`
      : `شما آخرین گزینه در این سفارش هستید`;

    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-head">
        <span class="status-badge badge-pending">سفارش جدید</span>
      </div>
      <div class="order-items">${itemsText}</div>
      <div class="order-total">${toman(o.total)}</div>
      <div class="order-meta">${o.buyerAddress || o.buyerCity || ""}</div>
      <div class="order-countdown">${timeLabel}</div>
      <div class="order-actions">
        <a href="tel:${o.buyerPhone}">تماس با خریدار</a>
        <button data-act="accept" class="primary-action">قبول سفارش</button>
        <button data-act="reject">رد کردن</button>
      </div>
    `;
    card.querySelector('[data-act="accept"]').onclick = () => acceptOrder(o.id);
    card.querySelector('[data-act="reject"]').onclick = () => rejectOrder(o.id);
    ordersListEl.appendChild(card);
  });
}

function acceptOrder(orderId) {
  const ref = db.collection("orders").doc(orderId);
  db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("سفارش پیدا نشد");
    const data = doc.data();
    if (data.status !== "pending" || data.assignedTo) throw new Error("این سفارش قبلاً توسط تامین‌کننده دیگری پذیرفته شده");
    tx.update(ref, { status: "assigned", assignedTo: currentUser.uid, assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }).then(() => {
    showToast("سفارش پذیرفته شد ✅");
  }).catch(err => {
    console.error(err);
    showToast(err.message || "خطا در پذیرش سفارش");
  });
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
  db.collection("messages").where("supplierId", "==", currentUser.uid).orderBy("createdAt", "asc")
    .onSnapshot(snap => renderMessages(document.getElementById("supplierMessages"), snap.docs.map(d => d.data())));
}
function listenPendingMessages() {
  db.collection("messages").where("supplierId", "==", currentUser.uid).orderBy("createdAt", "asc")
    .onSnapshot(snap => renderMessages(document.getElementById("pendingMessages"), snap.docs.map(d => d.data())));
}

function sendMessage(text) {
  if (!text.trim() || !currentUser) return;
  db.collection("messages").add({
    supplierId: currentUser.uid, sender: "supplier", text: text.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

document.getElementById("supplierMsgSend").onclick = () => {
  const input = document.getElementById("supplierMsgInput");
  sendMessage(input.value); input.value = "";
};
document.getElementById("pendingMsgSend").onclick = () => {
  const input = document.getElementById("pendingMsgInput");
  sendMessage(input.value); input.value = "";
};
