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

let editingProductId = null;
let productImages = []; // { type: 'existing', url } | { type: 'new', file, previewUrl }
let productCategoriesCache = [];

let currentUser = null;
let isAdmin = false;
let adminPendingCode = null;
let activeProductStatus = "pending";
let unsubProducts = null;
let allProductsCache = [];
let unsubMessages = null;
let allSuppliersCache = [];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
function toman(n) { return Number(n).toLocaleString("fa-IR") + " تومان"; }

function reportWriteError(action, err) {
  console.error(action, err);
  const code = err && err.code ? err.code : "";
  if (code === "permission-denied") {
    showToast("❌ ذخیره نشد: دسترسی رد شد. قوانین Firestore را دوباره Publish کنید و مطمئن شوید سند admins برای حساب شما وجود دارد.");
  } else {
    showToast("❌ خطا در " + action + (code ? " (" + code + ")" : ""));
  }
}

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
  listenProductCategories();
  listenCategoriesAdmin();
  loadCustomers();
  loadCreditData();
  loadAllOrders();
  loadReport();
  loadShopProfile();
  listenTrustedCustomers();
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
  products: "محصولات", categories: "دسته‌بندی‌ها", suppliers: "تامین‌کنندگان",
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

// ===================== محصولات (افزودن / ویرایش / حذف) =====================

// دسته‌بندی‌ها برای پر کردن select فرم محصول (زنده از Firestore)
function listenProductCategories() {
  db.collection("categories").orderBy("order", "asc").onSnapshot(snap => {
    productCategoriesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const current = pCategory.value;
    pCategory.innerHTML = "";
    productCategoriesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name; opt.textContent = c.name;
      pCategory.appendChild(opt);
    });
    if (current) pCategory.value = current;
  });
}

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
  reader.onload = e => { productImages.push({ type: "new", file, previewUrl: e.target.result }); renderImagesRow(); };
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

function resetProductForm() {
  productForm.reset();
  productImages = []; renderImagesRow();
  customFieldsRow.innerHTML = "";
  editingProductId = null;
  productFormTitle.textContent = "افزودن محصول جدید";
  submitBtn.textContent = "ذخیره محصول";
  cancelEditBtn.classList.add("hidden");
}
cancelEditBtn.onclick = resetProductForm;

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
      status: "approved", // مدیر مستقیم می‌سازد، نیازی به تایید جداگانه نیست
      supplierId: currentUser.uid,
      supplierName: "فروشگاه",
    };

    // موقعیت فروشگاه (اگر در تنظیمات ثبت شده باشد) روی محصول هم می‌نشیند — برای نمایش فاصله به مشتری
    try {
      const siteDoc = await db.collection("settings").doc("site").get();
      if (siteDoc.exists) {
        const site = siteDoc.data();
        if (site.shopLat != null) data.supplierLat = site.shopLat;
        if (site.shopLng != null) data.supplierLng = site.shopLng;
        if (site.shopCity) data.supplierCity = site.shopCity;
      }
    } catch (e) { /* بدون موقعیت هم مشکلی نیست */ }

    if (editingProductId) {
      await db.collection("products").doc(editingProductId).update(data);
      showToast("محصول ویرایش شد");
    } else {
      data.available = true;
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("products").add(data);
      showToast("محصول ثبت شد ✅");
    }
    resetProductForm();
  } catch (err) {
    console.error(err);
    showToast(err.message || "خطا در ذخیره محصول");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingProductId ? "ذخیره تغییرات" : "ذخیره محصول";
  }
};

// -------------------- لیست محصولات --------------------
function listenProducts() {
  if (unsubProducts) unsubProducts();
  unsubProducts = db.collection("products").onSnapshot(snap => {
    allProductsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0)));
    renderProductsList();
    renderInventory(allProductsCache);
  }, err => { console.error(err); document.getElementById("productsList").innerHTML = `<p class="my-empty">خطا در بارگذاری.</p>`; });
}

function statusBadge(status) {
  const map = {
    pending: { text: "در انتظار (قدیمی)", cls: "badge-pending" },
    approved: { text: "تایید شده", cls: "badge-approved" },
    rejected: { text: "رد شده (قدیمی)", cls: "badge-rejected" },
  };
  const s = map[status] || map.approved;
  return `<span class="status-badge ${s.cls}">${s.text}</span>`;
}

function renderProductsList() {
  const el = document.getElementById("productsList");
  const q = (document.getElementById("productSearch").value || "").trim();
  let items = allProductsCache;
  if (q) items = items.filter(p => (p.name || "").includes(q));

  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز محصولی ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const img0 = (p.images && p.images[0]) || p.imageUrl;
    const thumb = img0 ? `<img src="${img0}" alt="">` : `<div class="ph">🍽️</div>`;
    const available = p.available !== false;
    const legacyNotApproved = p.status && p.status !== "approved";
    const actions = [];
    if (legacyNotApproved) actions.push(`<button data-act="approve">تایید</button>`);
    actions.push(`<button data-act="edit">ویرایش</button>`);
    actions.push(`<button data-act="toggle-avail">${available ? "اتمام موجودی" : "بازگرداندن"}</button>`);
    actions.push(`<button data-act="delete">حذف</button>`);
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      ${thumb}
      <div class="my-product-info">
        <div class="my-product-name">${p.name}${p.featured ? " 🔥" : ""}</div>
        <div class="my-product-price">${toman(p.price)} · موجودی: ${p.stock ?? 0}</div>
        ${legacyNotApproved ? statusBadge(p.status) : ""}
        ${!available ? `<span class="status-badge badge-rejected">اتمام موجودی در بازار</span>` : ""}
      </div>
      <div class="my-product-actions">${actions.join("")}</div>
    `;
    const approveBtn = row.querySelector('[data-act="approve"]');
    if (approveBtn) approveBtn.onclick = () => db.collection("products").doc(p.id).update({ status: "approved" }).then(() => showToast("تایید شد"));
    row.querySelector('[data-act="edit"]').onclick = () => startEditProduct(p);
    row.querySelector('[data-act="toggle-avail"]').onclick = () => {
      db.collection("products").doc(p.id).update({ available: !available })
        .then(() => showToast(available ? "به‌عنوان اتمام موجودی علامت خورد" : "دوباره موجود شد"));
    };
    row.querySelector('[data-act="delete"]').onclick = () => deleteProduct(p.id, p.name);
    el.appendChild(row);
  });
}
document.getElementById("productSearch").oninput = renderProductsList;

function startEditProduct(p) {
  editingProductId = p.id;
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
  selectTab("products");
  productForm.scrollIntoView({ behavior: "smooth" });
}

function deleteProduct(id, name) {
  if (!confirm(`آیا مطمئن هستید که می‌خواهید «${name}» را حذف کنید؟`)) return;
  if (!confirm("این عمل قابل بازگشت نیست. حذف نهایی شود؟")) return;
  db.collection("products").doc(id).delete()
    .then(() => showToast("محصول حذف شد"))
    .catch(err => reportWriteError("حذف محصول", err));
}

// ===================== تامین‌کنندگان =====================

// ===================== پروفایل فروشگاه (موقعیت، حداقل سفارش، هزینه ارسال) =====================
if (typeof IRAN_CITIES !== "undefined") {
  const sel = document.getElementById("shopCitySelect");
  const ph = document.createElement("option"); ph.value = ""; ph.textContent = "شهر فروشگاه را انتخاب کنید";
  sel.appendChild(ph);
  IRAN_CITIES.forEach(city => {
    const opt = document.createElement("option"); opt.value = city; opt.textContent = city;
    sel.appendChild(opt);
  });
}

let shopProfile = {};
function loadShopProfile() {
  db.collection("settings").doc("site").get().then(doc => {
    shopProfile = doc.exists ? doc.data() : {};
    document.getElementById("shopCitySelect").value = shopProfile.shopCity || "";
    document.getElementById("shopMinOrder").value = shopProfile.shopMinOrder || "";
    document.getElementById("shopDeliveryFee").value = shopProfile.shopDeliveryFee || "";
    if (shopProfile.shopLat != null) document.getElementById("shopLocationStatus").textContent = "موقعیت مکانی دقیق ثبت شده ✅";
  });
}

document.getElementById("getShopLocationBtn").onclick = () => {
  if (!navigator.geolocation) { showToast("مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند"); return; }
  const btn = document.getElementById("getShopLocationBtn");
  btn.textContent = "در حال دریافت موقعیت...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      shopProfile.shopLat = pos.coords.latitude;
      shopProfile.shopLng = pos.coords.longitude;
      db.collection("settings").doc("site").set({ shopLat: shopProfile.shopLat, shopLng: shopProfile.shopLng }, { merge: true })
        .then(() => { document.getElementById("shopLocationStatus").textContent = "موقعیت مکانی دقیق ثبت شده ✅"; showToast("موقعیت فروشگاه ثبت شد"); })
        .catch(err => reportWriteError("ثبت موقعیت فروشگاه", err));
      btn.textContent = "دریافت موقعیت مکانی دقیق فروشگاه";
    },
    () => { showToast("دسترسی به موقعیت مکانی رد شد"); btn.textContent = "دریافت موقعیت مکانی دقیق فروشگاه"; }
  );
};

document.getElementById("saveShopProfileBtn").onclick = () => {
  const data = {
    shopCity: document.getElementById("shopCitySelect").value,
    shopMinOrder: Number(document.getElementById("shopMinOrder").value) || null,
    shopDeliveryFee: Number(document.getElementById("shopDeliveryFee").value) || null,
  };
  db.collection("settings").doc("site").set(data, { merge: true })
    .then(() => showToast("پروفایل فروشگاه ذخیره شد ✅"))
    .catch(err => reportWriteError("ذخیره پروفایل فروشگاه", err));
};

// ===================== نام و لوگوی فروشگاه =====================
db.collection("settings").doc("site").get().then(doc => {
  if (!doc.exists) return;
  const data = doc.data();
  if (data.storeName) document.getElementById("storeNameInput").value = data.storeName;
  if (data.logoUrl) {
    const preview = document.getElementById("logoPreview");
    preview.src = data.logoUrl;
    preview.classList.remove("hidden");
    document.getElementById("logoPickerLabel").classList.add("hidden");
  }
}).catch(() => {});

document.getElementById("saveStoreNameBtn").onclick = () => {
  const name = document.getElementById("storeNameInput").value.trim();
  db.collection("settings").doc("site").set({ storeName: name }, { merge: true })
    .then(() => showToast("نام فروشگاه ذخیره شد ✅ — همین الان در فروشگاه عوض می‌شود"))
    .catch(err => reportWriteError("ذخیره نام فروشگاه", err));
};

let selectedLogoFile = null;
document.getElementById("logoInput").onchange = () => {
  const file = document.getElementById("logoInput").files[0];
  if (!file) return;
  selectedLogoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById("logoPreview");
    preview.src = e.target.result;
    preview.classList.remove("hidden");
    document.getElementById("logoPickerLabel").classList.add("hidden");
  };
  reader.readAsDataURL(file);
};

document.getElementById("saveLogoBtn").onclick = async () => {
  if (!selectedLogoFile) { showToast("اول یک عکس انتخاب کنید"); return; }
  const btn = document.getElementById("saveLogoBtn");
  btn.disabled = true; btn.textContent = "در حال آپلود...";
  try {
    const url = await uploadToCloudinary(selectedLogoFile);
    await db.collection("settings").doc("site").set({ logoUrl: url }, { merge: true });
    showToast("لوگو ذخیره شد ✅ — همین الان در فروشگاه عوض می‌شود");
    selectedLogoFile = null;
  } catch (err) {
    reportWriteError("آپلود لوگو", err);
  } finally {
    btn.disabled = false; btn.textContent = "ذخیره لوگو";
  }
};

document.getElementById("removeLogoBtn").onclick = () => {
  if (!confirm("لوگوی فعلی حذف شود؟")) return;
  db.collection("settings").doc("site").set({ logoUrl: null }, { merge: true })
    .then(() => {
      showToast("لوگو حذف شد");
      document.getElementById("logoPreview").classList.add("hidden");
      document.getElementById("logoPickerLabel").classList.remove("hidden");
      selectedLogoFile = null;
    })
    .catch(err => reportWriteError("حذف لوگو", err));
};

// ===================== مشتریان معتبر برای پرداخت چکی =====================
function listenTrustedCustomers() {
  db.collection("trustedCustomers").onSnapshot(snap => {
    renderTrustedList(snap.docs.map(d => ({ phone: d.id, ...d.data() })));
  }, err => console.error(err));
}

function renderTrustedList(items) {
  const el = document.getElementById("trustListAdmin");
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">هنوز مشتری معتبری اضافه نشده.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      <div class="ph">✅</div>
      <div class="my-product-info"><div class="my-product-name">${c.name || "بدون نام"}</div><div class="my-product-price">${c.phone}</div></div>
      <div class="my-product-actions"><button data-act="remove">حذف از لیست معتبر</button></div>
    `;
    row.querySelector('[data-act="remove"]').onclick = () => {
      if (!confirm("این مشتری از لیست معتبرهای پرداخت چکی حذف شود؟")) return;
      db.collection("trustedCustomers").doc(c.phone).delete()
        .then(() => showToast("حذف شد"))
        .catch(err => reportWriteError("حذف مشتری معتبر", err));
    };
    el.appendChild(row);
  });
}

document.getElementById("addTrustBtn").onclick = () => {
  const phone = document.getElementById("trustPhoneInput").value.trim();
  if (!/^09\d{9}$/.test(phone)) { showToast("شماره موبایل معتبر (۱۱ رقم، شروع با ۰۹) وارد کنید"); return; }
  const name = document.getElementById("trustNameInput").value.trim();
  db.collection("trustedCustomers").doc(phone).set({
    name: name || null, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).then(() => {
    showToast("مشتری به لیست معتبر اضافه شد ✅");
    document.getElementById("trustPhoneInput").value = "";
    document.getElementById("trustNameInput").value = "";
  }).catch(err => reportWriteError("افزودن مشتری معتبر", err));
};

// ===================== سقف اعتبار مشتریان =====================
document.getElementById("saveCreditLimitBtn").onclick = () => {
  const phone = document.getElementById("creditPhoneInput").value.trim();
  if (!/^09\d{9}$/.test(phone)) { showToast("شماره موبایل معتبر (۱۱ رقم، شروع با ۰۹) وارد کنید"); return; }
  const limit = Number(document.getElementById("creditLimitInput").value);
  if (!limit || limit <= 0) { showToast("سقف اعتبار را وارد کنید"); return; }
  db.collection("creditAccounts").doc(phone).set({
    limit, used: firebase.firestore.FieldValue.increment(0), // اگر سند تازه است used از ۰ شروع می‌شود
  }, { merge: true }).then(() => {
    showToast("سقف اعتبار ذخیره شد ✅ (هیچ‌وقت به خود مشتری نشان داده نمی‌شود)");
    document.getElementById("creditPhoneInput").value = "";
    document.getElementById("creditLimitInput").value = "";
  }).catch(err => reportWriteError("ذخیره سقف اعتبار", err));
};

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

function approveCreditSettlementAdmin(orderId, amount, phone) {
  const ref = db.collection("orders").doc(orderId);
  const creditRef = db.collection("creditAccounts").doc(phone);
  db.runTransaction(async (tx) => {
    const creditDoc = await tx.get(creditRef);
    const used = creditDoc.exists ? (creditDoc.data().used || 0) : 0;
    tx.update(ref, { "creditSettlement.status": "approved" });
    tx.set(creditRef, { used: Math.max(0, used - amount) }, { merge: true });
  }).then(() => showToast("واریزی تایید و از بدهی مشتری کسر شد ✅"))
    .catch(err => reportWriteError("تایید واریزی اعتباری", err));
}
function rejectCreditSettlementAdmin(orderId) {
  const reason = prompt("دلیل رد واریزی (برای مشتری نمایش داده می‌شود):");
  if (reason === null) return;
  db.collection("orders").doc(orderId).update({
    "creditSettlement.status": "rejected",
    "creditSettlement.rejectionReason": reason.trim(),
  }).then(() => showToast("واریزی رد شد"))
    .catch(err => reportWriteError("رد واریزی اعتباری", err));
}

function renderCreditSettlementsAdmin(orders) {
  const el = document.getElementById("creditSettlementsAdminList");
  if (orders.length === 0) { el.innerHTML = `<p class="my-empty">واریزی‌ای ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  const statusLabel = { pending: "در انتظار بررسی شما", approved: "تایید و کسر شد", rejected: "رد شد" };
  orders.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).forEach(o => {
    const s = o.creditSettlement;
    const photo = s.photoUrl ? `<a href="${s.photoUrl}" target="_blank">مشاهده عکس</a>` : "";
    const actions = s.status === "pending"
      ? `<button data-act="approve-settle" class="primary-action">تایید و کسر از بدهی</button><button data-act="reject-settle">رد کردن</button>`
      : "";
    const row = document.createElement("div");
    row.className = "order-card";
    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">${statusLabel[s.status] || s.status}</span></div>
      <div class="order-items">مشتری: ${o.buyerPhone} · مبلغ: ${toman(s.amount)} · روش: ${s.method === "check" ? "چک" : "فیش بانکی"}</div>
      <div class="order-meta">${photo} ${s.rejectionReason ? "· دلیل رد: " + s.rejectionReason : ""}</div>
      <div class="order-actions">${actions}</div>
    `;
    const appBtn = row.querySelector('[data-act="approve-settle"]'); if (appBtn) appBtn.onclick = () => approveCreditSettlementAdmin(o.id, s.amount, o.buyerPhone);
    const rejBtn = row.querySelector('[data-act="reject-settle"]'); if (rejBtn) rejBtn.onclick = () => rejectCreditSettlementAdmin(o.id);
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
  return "فروشگاه"; // از این پس فقط یک مدیر همه‌چیز را انجام می‌دهد
}

function approveOrderPayment(orderId) {
  db.collection("orders").doc(orderId).update({ paymentStatus: "approved", paymentRejectionReason: null })
    .then(() => showToast("پرداخت تایید شد ✅"))
    .catch(err => reportWriteError("تایید پرداخت", err));
}
function rejectOrderPayment(orderId) {
  const reason = prompt("دلیل رد پرداخت (برای مشتری نمایش داده می‌شود):");
  if (reason === null) return;
  if (!reason.trim()) { showToast("نوشتن دلیل الزامی است"); return; }
  db.collection("orders").doc(orderId).update({ paymentStatus: "rejected", paymentRejectionReason: reason.trim() })
    .then(() => showToast("پرداخت رد شد"))
    .catch(err => reportWriteError("رد پرداخت", err));
}
function acceptOrderAdmin(orderId) {
  const ref = db.collection("orders").doc(orderId);
  db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("سفارش پیدا نشد");
    const data = doc.data();
    if (data.status !== "pending" || data.assignedTo) throw new Error("این سفارش قبلاً پذیرفته شده");

    if (data.paymentMethod === "credit") {
      const creditRef = db.collection("creditAccounts").doc(data.buyerPhone);
      const creditDoc = await tx.get(creditRef);
      const limit = creditDoc.exists ? (creditDoc.data().limit || 0) : 0;
      const used = creditDoc.exists ? (creditDoc.data().used || 0) : 0;
      if (used + (data.total || 0) > limit) throw new Error("این سفارش از سقف اعتبار باقیمانده مشتری بیشتر است — یا سقفش را افزایش دهید، یا سفارش را رد کنید.");
      tx.set(creditRef, { used: used + (data.total || 0) }, { merge: true });
    }

    tx.update(ref, { status: "assigned", assignedTo: currentUser.uid, assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }).then(() => showToast("سفارش پذیرفته شد ✅"))
    .catch(err => { console.error(err); showToast(err.message || "خطا در پذیرش سفارش"); });
}
function rejectOrderAdmin(orderId) {
  const reason = prompt("دلیل رد سفارش (برای مشتری نمایش داده می‌شود):");
  if (reason === null) return;
  db.collection("orders").doc(orderId).update({ status: "rejected", paymentRejectionReason: reason.trim() || "امکان تامین این سفارش نیست" })
    .then(() => showToast("سفارش رد شد"))
    .catch(err => reportWriteError("رد سفارش", err));
}
function toggleSayadReceived(orderId, current) {
  db.collection("orders").doc(orderId).update({ sayadReceived: !current })
    .then(() => showToast(!current ? "صیادی: دریافت شد ✅" : "صیادی: برگشت به حالت دریافت‌نشده"))
    .catch(err => reportWriteError("ثبت وضعیت صیادی", err));
}

function renderAllOrders(orders) {
  const el = document.getElementById("allOrdersList");
  if (orders.length === 0) { el.innerHTML = `<p class="my-empty">هنوز سفارشی نیست.</p>`; return; }
  el.innerHTML = "";
  orders.forEach(o => {
    const row = document.createElement("div");
    row.className = "order-card";
    const statusMap = { pending: "در انتظار بررسی", assigned: "پذیرفته‌شده و در حال آماده‌سازی", rejected: "رد شده" };

    // نمایش کامل روش پرداخت برای مدیر — چیزی پنهان نیست
    const payStatusLabel = { pending_review: "در انتظار بررسی شما", approved: "تایید شده", rejected: "رد شده" };
    let paymentBox = "";
    let paymentActions = "";
    if (o.paymentMethod) {
      const photoUrl = o.receiptImageUrl || o.checkImageUrl;
      const methodLabel = o.paymentMethod === "check" ? "چک" : o.paymentMethod === "credit" ? "خرید اعتباری" : "واریز بانکی (فیش)";
      let details = "";
      if (o.paymentMethod === "check") {
        details = `بانک: ${o.checkBank || "—"} · سریال: ${o.checkSerial || "—"} · صیادی: ${o.checkSayad || "—"} · سررسید: ${typeof toJalaliString === "function" ? toJalaliString(o.checkDueDate) : (o.checkDueDate || "—")} · مبلغ: ${toman(o.checkAmount)}`;
      }
      const rejectLine = (o.paymentStatus === "rejected" && o.paymentRejectionReason)
        ? `<div class="order-shortfall">دلیل رد: ${o.paymentRejectionReason}</div>` : "";
      const sayadLine = (o.paymentMethod === "check" && o.paymentStatus === "approved")
        ? `<div class="sayad-tag">وضعیت صیادی: ${o.sayadReceived ? "دریافت شد ✅" : "دریافت نشده"}</div>` : "";
      paymentBox = `
        <div class="acc-row" style="margin-top:8px">
          <div class="acc-row-top"><span>روش پرداخت: ${methodLabel}</span><span>${payStatusLabel[o.paymentStatus] || o.paymentStatus}</span></div>
          ${details ? `<div class="order-meta">${details}</div>` : ""}
          ${photoUrl ? `<a href="${photoUrl}" target="_blank"><img src="${photoUrl}" alt="مدرک پرداخت" style="max-width:120px;border-radius:8px;margin-top:6px"></a>` : ""}
          ${rejectLine}${sayadLine}
        </div>`;

      if (o.paymentStatus === "pending_review") {
        paymentActions += `<button data-act="approve-pay" class="primary-action">تایید پرداخت</button><button data-act="reject-pay">رد پرداخت</button>`;
      }
      if (o.paymentMethod === "check" && o.paymentStatus === "approved") {
        paymentActions += `<button data-act="toggle-sayad">${o.sayadReceived ? "برگرداندن به دریافت‌نشده" : "صیادی دریافت شد"}</button>`;
      }
    }

    let orderActions = "";
    const canAccept = o.status === "pending" && (!o.paymentMethod || o.paymentStatus === "approved");
    if (canAccept) orderActions += `<button data-act="accept" class="primary-action">قبول سفارش</button><button data-act="reject-order">رد سفارش</button>`;
    if (o.status === "rejected" && o.paymentRejectionReason) orderActions += `<div class="order-shortfall">دلیل: ${o.paymentRejectionReason}</div>`;

    row.innerHTML = `
      <div class="order-head"><span class="status-badge badge-pending">${statusMap[o.status] || o.status}</span></div>
      <div class="order-items">${(o.items || []).map(it => `${it.name} × ${it.qty}`).join("، ")}</div>
      <div class="order-total">${toman(o.total)}</div>
      <div class="order-meta">خریدار: ${o.buyerPhone} · ${o.buyerAddress || o.buyerCity || ""}</div>
      ${paymentBox}
      <div class="order-actions">${paymentActions}${orderActions}</div>
    `;
    const approvePayBtn = row.querySelector('[data-act="approve-pay"]'); if (approvePayBtn) approvePayBtn.onclick = () => approveOrderPayment(o.id);
    const rejectPayBtn = row.querySelector('[data-act="reject-pay"]'); if (rejectPayBtn) rejectPayBtn.onclick = () => rejectOrderPayment(o.id);
    const sayadBtn = row.querySelector('[data-act="toggle-sayad"]'); if (sayadBtn) sayadBtn.onclick = () => toggleSayadReceived(o.id, !!o.sayadReceived);
    const acceptBtn = row.querySelector('[data-act="accept"]'); if (acceptBtn) acceptBtn.onclick = () => acceptOrderAdmin(o.id);
    const rejectOrderBtn = row.querySelector('[data-act="reject-order"]'); if (rejectOrderBtn) rejectOrderBtn.onclick = () => rejectOrderAdmin(o.id);
    el.appendChild(row);
  });
}

// ===================== موجودی =====================
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

  const accepted = orders.filter(o => o.assignedTo);
  const rejected = orders.filter(o => o.status === "rejected");
  const totalRevenue = accepted.reduce((s, o) => s + (o.total || 0), 0);

  el.innerHTML = `
    <div class="report-item"><span>کل درآمد فروشگاه</span><b>${toman(totalRevenue)}</b></div>
    <div class="report-item"><span>کل سفارش‌ها</span><b>${orders.length}</b></div>
    <div class="report-item"><span>سفارش‌های پذیرفته‌شده</span><b>${accepted.length}</b></div>
    <div class="report-item"><span>سفارش‌های رد‌شده</span><b>${rejected.length}</b></div>
  `;
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
