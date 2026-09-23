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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// -----------------------------------------------------------------
// تنظیمات Cloudinary — برای ذخیره عکس محصولات (نیازی به کارت بانکی ندارد)
// این دو مقدار را از پنل Cloudinary خودتان جایگزین کنید. راهنما در README.md
// -----------------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = "lawoiiar";
const CLOUDINARY_UPLOAD_PRESET = "zorof_products";

// دسته‌بندی‌های ثابت محصولات — اگر خواستید می‌توانید این لیست را تغییر دهید
const PRODUCT_CATEGORIES = ["یکبار مصرف", "چینی و سرامیک", "شیشه‌ای", "استیل", "سایر"];
