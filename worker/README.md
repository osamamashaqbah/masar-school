# masar-admin-ops (Cloudflare Worker)

بديل عن Firebase Cloud Functions لعملية إنشاء الحساب الفردي (`createSchoolUser`) — بدون
الحاجة لترقية Firebase لخطة Blaze. يشتغل كسيرفر موثوق يحمل مفتاح Service Account، يتحقق من
هوية المدير المتصل (Firebase ID token)، وينشئ حساب Auth + ملف Firestore بشكل ذرّي مع تراجع
تلقائي لو فشلت أي خطوة بعد الأخرى.

النطاق الحالي: تهيئة مدرسة كاملة (`create-school`) وإنشاء الحسابات وإدارة دورة حياتها (`create-school-user` و`update-school-user`) وتسجيل التدقيق الموثوق (`audit-log`) وتحديث مؤشرات المنصة (`refresh-platform-stats`). كل المسارات عليها حدّ حافة لكل IP، وحدّ إضافي لكل فاعل موثّق.
المؤشرات تُحسب من Worker وتُكتب بصلاحية الخدمة، والعميل لا يستطيع تعديلها مباشرة.

## أول مرة (إعداد)

```bash
cd worker
npm install
npx wrangler login          # بيفتح المتصفح لتسجيل الدخول لحساب Cloudflare
```

انسخ مفتاح Service Account (نفسه يلي بـ `serviceAccountKey.json` بجذر المشروع) كسر محلي
للتطوير:

```bash
cp .dev.vars.example .dev.vars
# افتح .dev.vars واستبدل القيمة بمحتوى serviceAccountKey.json كامل بصيغة JSON بسطر واحد
```

## تجربة محلية

```bash
npm run dev
```

بيشتغل على `http://127.0.0.1:8787`. جرب إنشاء مستخدم مدرسة:

```bash
curl -X POST http://127.0.0.1:8787/create-school-user \
  -H "Authorization: Bearer <ID token لمدير حقيقي>" \
  -H "Content-Type: application/json" \
  -d '{"name":"معلّم تجريبي","email":"test@example.com","password":"123456","role":"instructor"}'
```

للحصول على ID token لمدير حقيقي: سجّل دخول بالتطبيق من المتصفح، وبتبويب console نفّذ
`await firebase.auth().currentUser.getIdToken()` (أو أضف زر مؤقت بالواجهة يطبعه).

المدير يقدر يدير حسابات نفس المدرسة عبر `update-school-user` باستخدام أحد الإجراءات:
`deactivate` أو `activate` أو `reset-password` أو `delete`. الحذف ينظّف ملف Auth
وملف Firestore وروابط ولي الأمر، ويمنع حذف ملف المستخدم مباشرة من المتصفح.
إعادة تعيين كلمة السر ترجع كلمة مؤقتة للمدير مرة واحدة، ويُطلب من المستخدم تغييرها عند أول دخول.

## إنشاء مدرسة من Super Admin

`POST /create-school` متاح فقط لحساب موجود في `platformAdmins/{uid}`، ويتطلب Firebase ID token
بتسجيل دخول حديث خلال آخر 10 دقائق. جسم الطلب:

```json
{
  "requestId": "uuid",
  "schoolName": "مدرسة النور",
  "adminName": "مدير النور",
  "adminEmail": "admin@example.com"
}
```

ينشئ Worker حساب Auth وكلمة سر مؤقتة عشوائية، ثم يكتب ذريًا `schools` و`users` و`platformStats`
وسجل `auditLog`. كلمة السر لا تُحفظ ولا تدخل السجل، وتُعاد في response النجاح مرة واحدة للواجهة.
إذا فشل commit Firestore يحذف Worker حساب Auth ويحذف حجز العملية؛ وإذا فشل التراجع يعيد
`provisioning_rollback_failed` ويحتاج الأمر فحصًا يدويًا. `requestId` يجعل إعادة نفس الطلب آمنة:
العملية المكتملة لا تنشئ مدرسة ثانية، بل تصدر كلمة مؤقتة جديدة للحساب الموجود.

الأخطاء المتوقعة تشمل `unauthenticated` و`permission_denied` و`recent_login_required` و`EMAIL_EXISTS`
و`rate_limited` و`provisioning_failed`. لا تُعرض تفاصيل Google الداخلية للعميل.

## النشر

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
# الصق محتوى serviceAccountKey.json كامل (سطر واحد) لما يطلب منك، Enter

npm run deploy
```

بعد النشر رح يطبع لك رابط شبيه بـ `https://masar-admin-ops.<subdomain>.workers.dev`. هذا
الرابط هو يلي لازم تحطه بمتغيّر `VITE_ADMIN_OPS_WORKER_URL` بملف `.env` تبع الواجهة الرئيسية.
انشر Worker أولًا، ثم ابنِ وانشر الواجهة بعد ضبط المتغيّر. لا تعمل إنشاء مدرسة تجريبية على
production كـ smoke test؛ يكفي التحقق من ظهور `/superadmin` ووجود النموذج دون إرسال الطلب.

`audit-log` يستقبل الإجراء والهدف والتفاصيل فقط، ويستخرج هوية الفاعل والمدرسة والدور من Firebase ID token وFirestore. الكتابة المباشرة إلى مجموعة `auditLog` ممنوعة في قواعد Firestore.

`refresh-platform-stats` يعيد حساب أعداد المستخدمين من ملفات المدرسة ويحدّث سجل `platformStats` المجمّع بصلاحية Worker. يستدعيه زر تحديث المؤشرات في لوحة إدارة المدرسة.

حدود الحماية الحالية: 300 طلباً/دقيقة لكل IP على المسار، و180 عملية/دقيقة لكل مستخدم موثّق على المسار، وحجم طلب أقصى 32KB. هذه حماية من الإساءة والاستنزاف وليست عدّاداً محاسبياً دقيقاً.

**قبل ما تنشر:** افتح `wrangler.jsonc` وتأكد `ALLOWED_ORIGIN` مضبوط على دومين الاستضافة
الفعلي تبع الواجهة (مو `localhost`)، وإلا رح يترفض كل طلب بسبب CORS.

## ليش ما استخدمنا firebase-admin مباشرة؟

حزمة `firebase-admin` الرسمية معتمدة على Node.js/gRPC وما بتشتغل بشكل موثوق على بيئة
Cloudflare Workers. بدلها، `src/google.ts` و`src/firestore.ts` بيكلموا REST APIs تبع Google
مباشرة (Identity Toolkit + Firestore) باستخدام `jose` لتوقيع/تحقق JWT عبر Web Crypto.
