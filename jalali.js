// -----------------------------------------------------------------
// تبدیل تاریخ میلادی ↔ شمسی — تست‌شده با نوروز ۱۴۰۳/۱۴۰۴/۱۴۰۵
// -----------------------------------------------------------------
(function (global) {
  function div(a, b) { return Math.trunc(a / b); }
  function mod(a, b) { return a - Math.trunc(a / b) * b; }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
          + div(153 * mod(gm + 9, 12) + 2, 5)
          + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return [gy, gm, gd];
  }

  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];

  function jalCal(jy) {
    const bl = breaks.length;
    const gy = jy + 621;
    let leapJ = -14, jp = breaks[0];
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('invalid jalali year ' + jy);
    let jump = 0;
    for (let i = 1; i < bl; i += 1) {
      const jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn)[0];
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      const r2 = jalCal(jy);
      if (r2.leap === 1) k += 1;
    }
    return [jy, 7 + div(k, 30), mod(k, 30) + 1];
  }

  function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

  const MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

  // ورودی: تاریخ ISO میلادی "YYYY-MM-DD" → خروجی: رشته شمسی "YYYY/MM/DD"
  function isoToShamsi(iso) {
    if (!iso) return "";
    const [gy, gm, gd] = iso.split("-").map(Number);
    const [jy, jm, jd] = toJalali(gy, gm, gd);
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  }
  // ورودی: تاریخ ISO میلادی → خروجی: رشته شمسی خوانا "۴ مهر ۱۴۰۵"
  function isoToShamsiLong(iso) {
    if (!iso) return "";
    const [gy, gm, gd] = iso.split("-").map(Number);
    const [jy, jm, jd] = toJalali(gy, gm, gd);
    return `${jd.toLocaleString("fa-IR")} ${MONTHS[jm - 1]} ${jy.toLocaleString("fa-IR")}`;
  }
  // امروز به شمسی [jy,jm,jd] و همان لحظه به ISO میلادی
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function todayJalali() {
    const d = new Date();
    return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  // تبدیل [jy,jm,jd] به ISO میلادی برای ذخیره در دیتابیس
  function jalaliToIso(jy, jm, jd) {
    const [gy, gm, gd] = toGregorian(jy, jm, jd);
    return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
  }

  global.Jalali = { toJalali, toGregorian, isoToShamsi, isoToShamsiLong, todayIso, todayJalali, jalaliToIso, MONTHS };
})(window);
