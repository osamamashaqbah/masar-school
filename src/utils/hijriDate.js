// تقويم هجري بدون أي مكتبة خارجية — Intl.DateTimeFormat بمتصفحات اليوم بتدعم التقويم الهجري أصلاً
export function toHijriString(date = new Date()) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

// شهر رمضان = 9 بالتقويم الهجري
export function isRamadan(date = new Date()) {
  const month = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).formatToParts(date).find((p) => p.type === 'month')?.value
  return Number(month) === 9
}
