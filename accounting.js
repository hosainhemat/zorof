// -----------------------------------------------------------------
// حساب‌داری — ظرف من
// اپن‌سورس، مستقل از بقیه پروژه — فقط از همان firebase-config.js
// (db, auth) استفاده می‌کند. کالکشن‌ها: acc_persons, acc_transactions, acc_checks
// -----------------------------------------------------------------

const authSection = document.getElementById("authSection");
const otpSection = document.getElementById("otpSection");
const panelSection = document.getElementById("panelSection");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const authError = document.getElementById("authError");
const toastEl = document.getElementById("toast");

let currentUser = null;
let isAdmin = false;
let adminPendingCode = null;
let persons = [];
let transactions = [];
let checks = [];
let activeCheckStatus = "pending";
let unsubPersons = null, unsubTxns = null, unsubChecks = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
function toman(n) { return Number(n || 0).toLocaleString("fa-IR") + " تومان"; }

// -------------------- احراز هویت (مثل پنل مدیر) --------------------
document.getElementById("loginBtn").onclick = () => {
  authError.textContent = "";
  auth.signInWithEmailAndPassword(authEmail.value.trim(), authPass.value)
    .catch(err => authError.textContent = "ورود ناموفق بود: " + err.message);
};
document.getElementById("logoutBtn").onclick = () => auth.signOut();

document.getElementById("adminOtpVerifyBtn").onclick = () => {
  const errEl = document.getElementById("otpError");
  const code = document.getElementById("adminOtpInput").value.trim();
  if (code !== adminPendingCode) { errEl.textContent = "کد وارد‌شده درست نیست."; return; }
  errEl.textContent = "";
  otpSection.classList.add("hidden");
  panelSection.classList.remove("hidden");
  startAll();
};
document.getElementById("adminOtpCancelBtn").onclick = () => auth.signOut();

function generateDevOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  authSection.classList.add("hidden");
  otpSection.classList.add("hidden");
  panelSection.classList.add("hidden");
  if (!user) { authSection.classList.remove("hidden"); return; }

  let adminDoc;
  try { adminDoc = await db.collection("admins").doc(user.uid).get(); } catch (e) {}
  isAdmin = adminDoc && adminDoc.exists;
  if (!isAdmin) { authError.textContent = "این حساب دسترسی ندارد."; auth.signOut(); return; }

  adminPendingCode = generateDevOtp();
  document.getElementById("adminDevCode").textContent = `⚠️ حالت آزمایشی (پیامک هنوز وصل نیست) — کد شما: ${adminPendingCode}`;
  document.getElementById("adminOtpInput").value = "";
  otpSection.classList.remove("hidden");
});

// -------------------- تب‌ها --------------------
document.querySelectorAll("#accTabs .tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#accTabs .tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "summary") renderSummary();
    if (btn.dataset.tab === "due") renderDue();
  };
});

function startAll() {
  listenPersons();
  listenTransactions();
  listenChecks();
  document.getElementById("txnDate").value = new Date().toISOString().slice(0, 10);
}

// -------------------- محاسبه مانده هر شخص --------------------
function personBalance(personId) {
  const p = persons.find(x => x.id === personId);
  const opening = (p && p.openingBalance) || 0;
  const sum = transactions
    .filter(t => t.personId === personId)
    .reduce((bal, t) => bal + (t.debit || 0) - (t.credit || 0), 0);
  return opening + sum;
}

function balanceLabel(balance) {
  if (balance > 0) return { text: "بدهکار", cls: "debtor" };
  if (balance < 0) return { text: "بستانکار", cls: "creditor" };
  return { text: "تسویه", cls: "settled" };
}

// -------------------- اشخاص --------------------
function listenPersons() {
  if (unsubPersons) unsubPersons();
  unsubPersons = db.collection("acc_persons").orderBy("createdAt", "desc").onSnapshot(snap => {
    persons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPersonsList();
    populatePersonSelects();
  }, err => console.error(err));
}

document.getElementById("personForm").onsubmit = (e) => {
  e.preventDefault();
  const name = document.getElementById("perName").value.trim();
  if (!name) { showToast("نام را وارد کنید"); return; }
  db.collection("acc_persons").add({
    name,
    phone: document.getElementById("perPhone").value.trim(),
    type: document.getElementById("perType").value,
    openingBalance: Number(document.getElementById("perOpening").value) || 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => { showToast("شخص اضافه شد"); e.target.reset(); });
};

function renderPersonsList() {
  const q = (document.getElementById("personSearch").value || "").trim();
  const el = document.getElementById("personsList");
  const items = persons.filter(p => !q || p.name.includes(q));
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">شخصی ثبت نشده.</p>`; return; }
  el.innerHTML = "";
  items.forEach(p => {
    const bal = personBalance(p.id);
    const lbl = balanceLabel(bal);
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `
      <div class="ph">${p.type === "supplier" ? "🚚" : p.type === "customer" ? "🧑‍💼" : "👤"}</div>
      <div class="my-product-info">
        <div class="my-product-name">${p.name}</div>
        <div class="my-product-price">${p.phone || ""}</div>
        <span class="person-balance-tag ${lbl.cls}">${lbl.text} — ${toman(Math.abs(bal))}</span>
      </div>
      <div class="my-product-actions">
        <button data-act="open">صورت‌حساب</button>
        <button data-act="delete">حذف</button>
      </div>
    `;
    row.querySelector('[data-act="open"]').onclick = () => {
      document.querySelector('[data-tab="statement"]').click();
      document.getElementById("statementPersonSelect").value = p.id;
      renderStatement();
    };
    row.querySelector('[data-act="delete"]').onclick = () => {
      if (!confirm(`«${p.name}» حذف شود؟`)) return;
      if (!confirm("اسناد ثبت‌شده برای این شخص باقی می‌مانند ولی دیگر به کسی متصل نیستند. ادامه؟")) return;
      db.collection("acc_persons").doc(p.id).delete().then(() => showToast("حذف شد"));
    };
    el.appendChild(row);
  });
}
document.getElementById("personSearch").oninput = renderPersonsList;

function populatePersonSelects() {
  [document.getElementById("statementPersonSelect"), document.getElementById("chkPersonSelect")].forEach(select => {
    const current = select.value;
    select.innerHTML = "";
    persons.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.name;
      select.appendChild(opt);
    });
    if (current) select.value = current;
  });
  renderStatement();
}

// -------------------- صورت‌حساب / اسناد --------------------
function listenTransactions() {
  if (unsubTxns) unsubTxns();
  unsubTxns = db.collection("acc_transactions").orderBy("date", "asc").onSnapshot(snap => {
    transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPersonsList();
    renderStatement();
  }, err => console.error(err));
}

document.getElementById("statementPersonSelect").onchange = renderStatement;

document.getElementById("txnForm").onsubmit = (e) => {
  e.preventDefault();
  const personId = document.getElementById("statementPersonSelect").value;
  if (!personId) { showToast("اول یک شخص انتخاب یا اضافه کنید"); return; }
  const debit = Number(document.getElementById("txnDebit").value) || 0;
  const credit = Number(document.getElementById("txnCredit").value) || 0;
  if (!debit && !credit) { showToast("مبلغ بدهکار یا بستانکار را وارد کنید"); return; }
  db.collection("acc_transactions").add({
    personId,
    date: document.getElementById("txnDate").value || new Date().toISOString().slice(0, 10),
    desc: document.getElementById("txnDesc").value.trim(),
    debit, credit,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => {
    showToast("سند ثبت شد");
    document.getElementById("txnDesc").value = "";
    document.getElementById("txnDebit").value = "";
    document.getElementById("txnCredit").value = "";
  });
};

function renderStatement() {
  const personId = document.getElementById("statementPersonSelect").value;
  const balanceBox = document.getElementById("personBalanceBox");
  const listEl = document.getElementById("txnList");
  if (!personId) { balanceBox.innerHTML = ""; listEl.innerHTML = ""; return; }

  const p = persons.find(x => x.id === personId);
  const bal = personBalance(personId);
  const lbl = balanceLabel(bal);
  balanceBox.innerHTML = `<div>${p ? p.name : ""}</div><div class="amount ${lbl.cls}">${lbl.text} ${toman(Math.abs(bal))}</div>`;

  const items = transactions.filter(t => t.personId === personId);
  if (items.length === 0 && !(p && p.openingBalance)) { listEl.innerHTML = `<p class="my-empty">سندی ثبت نشده.</p>`; return; }

  listEl.innerHTML = "";
  let running = (p && p.openingBalance) || 0;
  if (p && p.openingBalance) {
    const row = document.createElement("div");
    row.className = "acc-row";
    row.innerHTML = `<div class="acc-row-top"><span>مانده اولیه</span></div><div class="acc-row-main"><span>—</span><span>${toman(Math.abs(running))}</span></div>`;
    listEl.appendChild(row);
  }
  items.forEach(t => {
    running += (t.debit || 0) - (t.credit || 0);
    const row = document.createElement("div");
    row.className = "acc-row";
    row.innerHTML = `
      <div class="acc-row-top"><span>${t.date || ""}</span><span>${t.desc || ""}</span></div>
      <div class="acc-row-main">
        <span>${t.debit ? `<span class="acc-amt-debit">بدهکار: ${toman(t.debit)}</span>` : ""}${t.credit ? `<span class="acc-amt-credit">بستانکار: ${toman(t.credit)}</span>` : ""}</span>
        <button data-act="del" style="border:none;background:none;color:var(--muted);cursor:pointer">✕</button>
      </div>
      <div class="acc-balance-after">مانده بعد از این سند: ${toman(Math.abs(running))} ${running > 0 ? "بدهکار" : running < 0 ? "بستانکار" : ""}</div>
    `;
    row.querySelector('[data-act="del"]').onclick = () => {
      if (confirm("این سند حذف شود؟")) db.collection("acc_transactions").doc(t.id).delete();
    };
    listEl.appendChild(row);
  });
}

// -------------------- چک‌ها --------------------
function listenChecks() {
  if (unsubChecks) unsubChecks();
  unsubChecks = db.collection("acc_checks").orderBy("dueDate", "asc").onSnapshot(snap => {
    checks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChecksList();
    renderDue();
  }, err => console.error(err));
}

document.getElementById("checkForm").onsubmit = (e) => {
  e.preventDefault();
  const personId = document.getElementById("chkPersonSelect").value;
  if (!personId) { showToast("اول یک شخص انتخاب یا اضافه کنید"); return; }
  const amount = Number(document.getElementById("chkAmount").value);
  const dueDate = document.getElementById("chkDue").value;
  if (!amount || !dueDate) { showToast("مبلغ و تاریخ سررسید را وارد کنید"); return; }
  db.collection("acc_checks").add({
    personId,
    direction: document.getElementById("chkDirection").value,
    amount,
    checkNumber: document.getElementById("chkNumber").value.trim(),
    bank: document.getElementById("chkBank").value.trim(),
    dueDate, status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => { showToast("چک ثبت شد"); e.target.reset(); });
};

function renderCheckStatusFilters() {
  const statuses = [{ key: "pending", label: "در جریان" }, { key: "cashed", label: "وصول‌شده" }, { key: "bounced", label: "برگشتی" }];
  const el = document.getElementById("checkStatusFilters");
  el.innerHTML = "";
  statuses.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip" + (s.key === activeCheckStatus ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => { activeCheckStatus = s.key; renderCheckStatusFilters(); renderChecksList(); };
    el.appendChild(btn);
  });
}
renderCheckStatusFilters();

function personName(id) { const p = persons.find(x => x.id === id); return p ? p.name : "—"; }

function renderChecksList() {
  const el = document.getElementById("checksList");
  const items = checks.filter(c => c.status === activeCheckStatus);
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">چکی در این وضعیت نیست.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const row = document.createElement("div");
    row.className = "my-product";
    const actions = c.status === "pending"
      ? `<button data-act="cash">وصول شد</button><button data-act="bounce">برگشت خورد</button>`
      : "";
    row.innerHTML = `
      <div class="ph">${c.direction === "received" ? "⬇️" : "⬆️"}</div>
      <div class="my-product-info">
        <div class="my-product-name">${personName(c.personId)} — ${toman(c.amount)}</div>
        <div class="my-product-price">${c.direction === "received" ? "دریافتی" : "پرداختی"} · سررسید ${c.dueDate} · ${c.bank || ""} ${c.checkNumber ? "#" + c.checkNumber : ""}</div>
      </div>
      <div class="my-product-actions">${actions}<button data-act="delete">حذف</button></div>
    `;
    const cashBtn = row.querySelector('[data-act="cash"]');
    if (cashBtn) cashBtn.onclick = () => db.collection("acc_checks").doc(c.id).update({ status: "cashed" }).then(() => showToast("وصول شد"));
    const bounceBtn = row.querySelector('[data-act="bounce"]');
    if (bounceBtn) bounceBtn.onclick = () => db.collection("acc_checks").doc(c.id).update({ status: "bounced" }).then(() => showToast("ثبت شد"));
    row.querySelector('[data-act="delete"]').onclick = () => { if (confirm("این چک حذف شود؟")) db.collection("acc_checks").doc(c.id).delete(); };
    el.appendChild(row);
  });
}

// -------------------- سررسید پرداخت --------------------
function renderDue() {
  const el = document.getElementById("dueList");
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  const items = checks.filter(c => c.status === "pending").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (items.length === 0) { el.innerHTML = `<p class="my-empty">چک در جریانی وجود ندارد.</p>`; return; }
  el.innerHTML = "";
  items.forEach(c => {
    const overdue = c.dueDate < today;
    const row = document.createElement("div");
    row.className = "my-product due-item" + (overdue ? " overdue" : "");
    row.innerHTML = `
      <div class="ph">${c.direction === "received" ? "⬇️" : "⬆️"}</div>
      <div class="my-product-info">
        <div class="my-product-name">${personName(c.personId)} — ${toman(c.amount)}</div>
        <div class="due-date">${overdue ? "⚠️ سررسید گذشته: " : "سررسید: "}${c.dueDate}</div>
      </div>
    `;
    el.appendChild(row);
  });
}

// -------------------- گزارش کلی --------------------
function renderSummary() {
  let totalDebt = 0, totalCredit = 0;
  const debtors = [], creditors = [];
  persons.forEach(p => {
    const bal = personBalance(p.id);
    if (bal > 0) { totalDebt += bal; debtors.push({ p, bal }); }
    else if (bal < 0) { totalCredit += -bal; creditors.push({ p, bal }); }
  });
  debtors.sort((a, b) => b.bal - a.bal);
  creditors.sort((a, b) => a.bal - b.bal);

  document.getElementById("summaryBox").innerHTML = `
    <div class="report-item"><span>مجموع بدهکاران (به ما بدهکارند)</span><b>${toman(totalDebt)}</b></div>
    <div class="report-item"><span>مجموع بستانکاران (ما بدهکاریم)</span><b>${toman(totalCredit)}</b></div>
    <div class="report-item"><span>خالص وضعیت</span><b>${toman(totalDebt - totalCredit)}</b></div>
  `;

  const debtorsEl = document.getElementById("debtorsList");
  debtorsEl.innerHTML = debtors.length === 0 ? `<p class="my-empty">بدهکاری نیست.</p>` : "";
  debtors.forEach(({ p, bal }) => {
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `<div class="ph">🧑‍💼</div><div class="my-product-info"><div class="my-product-name">${p.name}</div></div><div class="my-product-price">${toman(bal)}</div>`;
    debtorsEl.appendChild(row);
  });

  const creditorsEl = document.getElementById("creditorsList");
  creditorsEl.innerHTML = creditors.length === 0 ? `<p class="my-empty">بستانکاری نیست.</p>` : "";
  creditors.forEach(({ p, bal }) => {
    const row = document.createElement("div");
    row.className = "my-product";
    row.innerHTML = `<div class="ph">🚚</div><div class="my-product-info"><div class="my-product-name">${p.name}</div></div><div class="my-product-price">${toman(-bal)}</div>`;
    creditorsEl.appendChild(row);
  });
}
