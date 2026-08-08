# خطة تنفيذ: تخصيص المنصة لكل مدرسة (White-Label Branding)

**الحالة:** خطة معتمدة — جاهزة للتنفيذ، ما تنفّذت بعد.
**تاريخ الاعتماد:** 2026-07-28
**المشروع:** `D:\My_Projects\My_Projects\masar-school-master` — Firebase project: `masar-school-demo`

> استخدم هالملف كنقطة بداية بجلسة جديدة. اقرأه للـ Claude وقلّه "نفّذ هالخطة".

---

## الفكرة
كل مدرسة تشتري المنصة تقدر تخصّص نسختها: اسم المنصة الظاهر، الشعار، ولون. صاحب المنصة (superadmin) وإدارة المدرسة (admin) الاثنين يقدروا يعدّلوا.

## قرار معماري مهم (اتفقنا عليه، ما يتغيّر بدون نقاش جديد)
**خيار أ:** صفحة تسجيل الدخول (`Login.jsx`) وشاشة `/superadmin` بيضلّوا "مسار" دايمًا (هوية المنصة نفسها). التخصيص يظهر بس **بعد** تسجيل الدخول (الشريط العلوي + عنوان تبويب المتصفح + الأيقونة). السبب: ما في subdomain لكل مدرسة، فما في طريقة نعرف هوية المدرسة **قبل** ما يسجّل المستخدم دخول بدون فتح ثغرة (تسريب اسم مدرسة أي بريد قبل التحقق من كلمة السر).

---

## 1. البيانات (Schema) — إضافي بالكامل، صفر خطر كسر

```
schools/{id}.branding = {
  logoUrl: string | null,
  primaryColor: string | null,   // موجود أصلاً
  platformName: string | null,   // جديد
}
```

أي مدرسة ما عدّلت — الحقول null، كل الواجهة بترجع لـ"مسار" والأيقونة الافتراضية تلقائيًا (fallback بكل مكان، مش استثناء).

## 2. Firestore Rules — تعديل دقيق ومحصور

القاعدة الحالية (`schools/{schoolId}` update) أصلاً بتسمح للإدارة (`isAdmin()`) تعدّل `branding` كـ map. المطلوب إضافي:

- السماح لـ `isPlatformAdmin()` بتعديل **حقل `branding` بس** (مش أي حقل تاني بوثيقة المدرسة) — سطر واحد إضافي بنفس نمط الشرط الموجود.
- **درس مهم اتعلّمناه بجلسة سابقة:** هاي كتابة (update) على وثيقة وحدة بمعرّف معروف — مش list query — فمعفية تمامًا من قيود list queries (الحقول لازم تكون بفلتر الاستعلام، وممنوع استخدام `let` — كلاهما يرجّع permission-denied بصمت لأي list query بس بيشتغلوا تمام لأي get/update مفرد). ما في خطر هون لأنها عملية update مفردة.
- بعد التعديل: تشغيل `firebase deploy --only firestore:rules` والتحقق بسكربت REST بسيط (signInWithPassword + REST calls مباشر) **قبل** لمس أي UI.

## 3. شاشة الإدارة (self-service) — توسيع مش بناء من الصفر

`SettingsPage.jsx` فيها أصلاً قسم "هوية كشف العلامات المطبوع" — أوسّعه ليصير "تخصيص المنصة": نفس الحقول (شعار، لون) + حقل جديد "اسم المنصة". نفس دالة `updateBranding` الموجودة بـ `SchoolStructureContext.jsx`، إضافة مفتاح وحدة بس بالكائن (`platformName`).

## 4. شاشة صاحب المنصة (`/superadmin`)

إضافة نموذج تعديل صغير بنفس مكان drill-in الحالي بـ `SuperAdminPage.jsx` — نفس الحقول الثلاثة، يكتب مباشرة على `schools/{id}.branding` (يعتمد على الرول الجديدة ببند 2). محمي بنفس منطق تسجيل السبب (`logAudit`) الموجود أصلاً لكل عملية صاحب منصة.

## 5. الشريط العلوي بعد تسجيل الدخول (`Layout.jsx`)

- استبدال `<div className="brand-name">مسار</div>` بـ `{branding.platformName || 'مسار'}`
- لو `branding.logoUrl` موجود: عرضه بدل أيقونة `ti-school` الافتراضية بـ `.brand-mark`
- **لا تلمس** أي مكان تاني بنفس الملف (bottomnav، الروابط، إلخ) — تغيير محصور بسطرين بس.

## 6. عنوان تبويب المتصفح + الأيقونة (favicon)

`useEffect` جديد جوا `Layout.jsx` (يشتغل بس بعد ما `branding`/`schoolName` يتحمّلوا):

```js
useEffect(() => {
  document.title = branding.platformName || schoolName || 'مسار'
  if (branding.logoUrl) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = branding.logoUrl
  }
}, [branding, schoolName])
```

ما في تعديل على `index.html` نفسه — الافتراضي (قبل تسجيل الدخول، أو لمدرسة بدون تخصيص) يضل زي ما هو.

## 7. صفحة الدخول و `/superadmin` — ثابتة، ما بتتغيّر إطلاقًا

بالاتفاق (خيار أ) — `Login.jsx` و `/superadmin` بيضلّوا "مسار" دايمًا، هوية المنصة نفسها مش أي زبون. **لا لمس على هالملفين إطلاقًا** بهاي المرحلة.

## 8. الاختبار (تحقق حقيقي بالمتصفح والـREST، مش افتراض)

- سكربت REST مباشر (نفس أسلوب `signInWithPassword` + REST calls) يتحقق إنه تحديث `branding` عالمدرسة التجريبية ينجح (كـ admin وكـ platform admin).
- متصفح فعلي: تسجيل دخول admin، تعديل اسم/شعار، تأكد الشريط العلوي وعنوان التبويب تغيّروا فورًا.
- **تحقق سلبي مهم:** مدرسة **بدون** أي تخصيص (لو فيه أكتر من مدرسة مستقبلًا) لازم تبين "مسار" تمامًا زي الوضع الحالي — صفر تغيير لأي حدا ما عدّل شي.
- تسجيل خروج ودخول من جديد: صفحة الدخول لازم تضل "مسار" دايمًا (خيار أ).

## 9. النشر

`firestore:rules` أول (البيانات جاهزة قبل الواجهة)، بعدين `npm run build` + `firebase deploy --only hosting`.

---

## ليش هاي الخطة آمنة (ما في خطر كسر شي)

- كل تعديل **إضافي** (حقل جديد، شرط OR جديد بالرول) — صفر حذف أو تعديل على منطق موجود.
- كل قراءة لـ `branding` بالواجهة أصلاً معمولة بـ `branding?.field || default` (نفس النمط المستخدم بـ `ReportCardPrint.jsx`) — fallback مضمون.
- التعديل على الرول محصور بحقل وحدة (`branding`) بوثيقة معروفة (get/update مفرد) — مش list query، معفي من كل قيود list-query المكتشفة سابقًا.
- ما في أي لمس لـ `Login.jsx` أو مسار `/superadmin` — مطابق تمامًا للقرار المعماري.

---

## ملاحظات سياق مهمة لأي جلسة جديدة تنفّذ هالخطة

- **حساب Firebase project:** `masar-school-demo`. `.firebaserc` فيه `default: masar-school-demo`.
- **حسابات ديمو (كلمة السر لكل الحسابات: `Demo@1234`):** `admin@demo.masar`, `instructor@demo.masar`, `student@demo.masar`, `parent@demo.masar`.
- **حساب صاحب المنصة:** `admin@masar.com` (كلمة السر عند المستخدم، مش هون).
- **قبل أي `firebase deploy --only firestore:rules`:** تأكد التغيير مش list-query context (لو كان، لازم تتجنّب `let` وتتأكد الحقول يلي الرول بتفحصها موجودة بفلاتر الاستعلام).
- **بعد أي `npm run build`:** لازم `firebase deploy --only hosting` عشان يوصل للموقع الحي فعليًا (build وحده ما بينشر شي).
- **آخر commit مرتبط:** `888556b` (فيتشرز اليوم) و `16eb5cb` (إصلاح CI). الخطة هاي **ما انبنت بعد**، مبنية فوق هالكومتّات.
