// رسائل عربية جاهزة لأكواد أخطاء Firestore/Auth الشائعة — بدل ما نعرض كود/رسالة تقنية خام للمستخدم.
// استخدمها بدل تكرار نفس التخمين بكل صفحة عندها catch على عملية Firestore.
const MESSAGES = {
  'permission-denied': 'ما عندك صلاحية تنفّذ هالعملية.',
  unauthenticated: 'لازم تسجّل دخول من جديد.',
  unavailable: 'تعذّر الاتصال بالسيرفر. تأكد من الإنترنت وحاول مرة ثانية.',
  'failed-precondition': 'تعذّر تنفيذ العملية بسبب حالة البيانات الحالية.',
  'not-found': 'الوثيقة المطلوبة غير موجودة.',
  'invalid-mark': 'الدرجة لازم تكون بين صفر والحد الأعلى.',
}

export function firestoreErrorMessage(err, fallback = 'صار خطأ غير متوقع. حاول مرة ثانية.') {
  return MESSAGES[err?.code] || fallback
}
