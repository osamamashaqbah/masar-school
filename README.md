# مسار (Masar)

منصة مدرسية متعددة المستأجرين (multi-tenant SaaS) لإدارة الحضور، العلامات،
الواجبات، ومتابعة أولياء الأمور. مبنية بـ React + Vite + Firebase
(Auth/Firestore)، وتخدم أكثر من مدرسة من نفس مشروع Firebase الواحد، مع عزل
كامل لبيانات كل مدرسة عن غيرها.

## النموذج متعدد المستأجرين

- كل مدرسة = وثيقة بمجموعة `schools`، وكل وثيقة بأي مجموعة أخرى (مستخدمين،
  صفوف، مواد، علامات، حضور...) فيها حقل `schoolId` يربطها بمدرستها.
- العزل بين المدارس مطبّق داخل `firestore.rules` نفسها (مو بس بالواجهة) —
  أي مستخدم ما بيقدر يقرا أو يكتب بيانات مدرسة غير مدرسته، بغض النظر عن دوره.
- الأدوار داخل كل مدرسة: `admin` (إدارة المدرسة)، `instructor` (معلّم)،
  `student` (طالب)، `parent` (ولي أمر).
- **ما في تسجيل ذاتي عام.** مدرسة جديدة بتنعمل فقط عن طريق سكربت داخلي
  (`scripts/create-school.mjs`) وقت كل عملية بيع — قواعد Firestore نفسها
  بترفض إنشاء أي مدرسة أو حساب `admin` من المتصفح إطلاقًا. بعد ما تُنشأ
  المدرسة، الإدارة بتضيف بقية الحسابات (معلمين، طلاب، أولياء أمور) من
  داخل لوحتها هي.
- المنتج الافتراضي (فرع `master`) واحد لكل الزبائن. أي تخصيص خاص بمدرسة
  معينة (فيتشرز إضافية، تصميم مختلف) بيصير على فرع منفصل خاص فيها.

### إنشاء مدرسة جديدة (وقت البيع)

```bash
node scripts/create-school.mjs --school "اسم المدرسة" --name "اسم مدير المدرسة" --email admin@school.com --password "كلمة سر قوية"
```

يحتاج مفتاح خدمة (service account) من Firebase Console > Project Settings >
Service Accounts > Generate new private key، محفوظ باسم
`serviceAccountKey.json` بجذر المشروع (متجاهل من git تلقائيًا).

## التشغيل محليًا

```bash
npm install
cp .env.example .env   # وحط فيه مفاتيح مشروع Firebase تبعك
npm run dev
```

### متغيرات البيئة (`.env`)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_OPS_WORKER_URL=
```

## السكربتات

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | سيرفر تطوير محلي |
| `npm run build` | بناء نسخة الإنتاج بمجلد `dist/` |
| `npm run lint` | فحص الكود بـ oxlint |
| `npm test` | اختبارات الوحدة (utils) |
| `npm run test:rules` | اختبارات عزل المدارس بقواعد Firestore عبر المحاكي |
| `npm run preview` | معاينة نسخة الإنتاج المبنية محليًا |

## النشر (Deploy)

```bash
npm run build
npx firebase deploy --only hosting,firestore:rules
```

انشر Worker العمليات الإدارية من مجلد `worker/` بعد ضبط سر
`FIREBASE_SERVICE_ACCOUNT_KEY`، ثم ضع رابطه في `VITE_ADMIN_OPS_WORKER_URL` قبل بناء الواجهة.

## النسخ الاحتياطي

فعّل جدولة نسخ احتياطي تلقائي لـ Firestore (ميزة مدفوعة حسب حجم البيانات — راجع
التسعير قبل التفعيل):
[Firebase Console → Firestore Database → Backups → Create backup schedule](https://console.firebase.google.com/project/masar-school-demo/firestore/backups)
واختر تكرار يومي أو أسبوعي حسب الحاجة.

## البنية

- `src/pages/` — صفحات كل دور (إدارة، معلّم، طالب، ولي أمر)
- `src/context/` — حالة التطبيق عبر React Context، كل واحد مسؤول عن
  مجموعة Firestore واحدة (علامات، حضور، واجبات...)
- `src/utils/` — دوال منطق خالصة (حساب العلامات، قراءة ملفات استيراد الطلاب)
- `firestore.rules` — قواعد الأمان وعزل المدارس، المصدر الحقيقي للصلاحيات
