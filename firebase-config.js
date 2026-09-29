// -----------------------------------------------------------------
// این فایل را با اطلاعات پروژه Firebase خودتان جایگزین کنید.
// این اطلاعات را از: Firebase Console → Project Settings → SDK setup and configuration
// پیدا می‌کنید. راهنمای کامل در README.md است.
// -----------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBlYv0T75v11EUMI6NxrCXItHmpMCp2Foo",
  authDomain: "my-zarf.firebaseapp.com",
  projectId: "my-zarf",
  storageBucket: "my-zarf.firebasestorage.app",
  messagingSenderId: "765982924362",
  appId: "1:765982924362:web:1cefbee1e4db693c0610b3"
};

// شماره نسخه برنامه — هر بار فایل‌ها را آپدیت می‌کنید عوض می‌شود تا بتوانید ببینید گوشی نسخه جدید را گرفته یا نه
const APP_VERSION = "2026-09-27-a";

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// نمونه جداگانه مخصوص «مشتری» (نشست ناشناس)، تا نشست مشتری با نشست مدیر/تامین‌کننده
// در یک مرورگر قاطی نشود. برای کار کردن، در Firebase → Authentication → Sign-in method
// گزینه Anonymous را فعال کنید (رایگان است).
const customerApp = firebase.initializeApp(firebaseConfig, "customer");
const customerAuth = customerApp.auth();
const customerDb = customerApp.firestore();

// -----------------------------------------------------------------
// تنظیمات Cloudinary — برای ذخیره عکس محصولات (نیازی به کارت بانکی ندارد)
// این دو مقدار را از پنل Cloudinary خودتان جایگزین کنید. راهنما در README.md
// -----------------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = "lawoiiar";
const CLOUDINARY_UPLOAD_PRESET = "zorof_products";

// -----------------------------------------------------------------
// ابزارهای شماره موبایل ایران (برای ورود/ثبت‌نام تامین‌کننده و مدیر)
// -----------------------------------------------------------------
function normalizeIranPhone(phone) {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("0098")) p = p.slice(4);
  if (p.startsWith("98")) p = p.slice(2);
  if (p.startsWith("9") && p.length === 10) p = "0" + p;
  return p;
}
function isValidIranPhone(phone) {
  return /^09\d{9}$/.test(normalizeIranPhone(phone));
}
function phoneToVirtualEmail(phone) {
  return normalizeIranPhone(phone) + "@phone.zarf.app";
}
function generateDevOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }
