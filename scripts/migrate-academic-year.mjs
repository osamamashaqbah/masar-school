// ترحيل لمرة وحدة: بيضيف مفهوم "السنة الدراسية" لبيانات موجودة أصلاً بلا بُعد زمني.
// بيمشي على كل المدارس الموجودة (مش مدرسة وحدة زي migrate-legacy-data.mjs)، ويلحّق:
//   - schools/{id}.currentAcademicYear (لو ناقصة)
//   - academicYear على كل وثيقة بالمجموعات التسع يلي أضفناها لها الحقل، بنفس سنة مدرستها
//
// التشغيل:
//   node scripts/migrate-academic-year.mjs [--year 2025-2026]

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1]
  }
  return args
}

const { year = '2025-2026' } = parseArgs()

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// 1) currentAcademicYear على كل مدرسة ناقصتها + بناء خريطة schoolId -> year للاستخدام تحت
const schoolsSnap = await db.collection('schools').get()
const schoolYear = {}
const missingSchools = []
for (const doc of schoolsSnap.docs) {
  const existing = doc.data().currentAcademicYear
  schoolYear[doc.id] = existing || year
  if (!existing) missingSchools.push(doc)
}
for (let i = 0; i < missingSchools.length; i += 450) {
  const batch = db.batch()
  missingSchools.slice(i, i + 450).forEach((d) => batch.set(d.ref, { currentAcademicYear: year }, { merge: true }))
  await batch.commit()
}
console.log(`schools: لحّقنا currentAcademicYear بـ ${missingSchools.length} مدرسة (الباقي كان عندها أصلاً).`)

// 2) academicYear على كل وثيقة ناقصتها بالمجموعات التسع، حسب سنة مدرستها
const collections = ['marks', 'attendance', 'quizStats', 'homework', 'submissions', 'notes', 'questions', 'progress', 'subjects']

for (const name of collections) {
  const snap = await db.collection(name).get()
  const missing = snap.docs.filter((d) => !d.data().academicYear && schoolYear[d.data().schoolId])
  if (missing.length === 0) {
    console.log(`${name}: كل شي فيه academicYear أصلاً (أو schoolId مش معروف)، ما في داعي لتعديل.`)
    continue
  }
  for (let i = 0; i < missing.length; i += 450) {
    const batch = db.batch()
    missing.slice(i, i + 450).forEach((d) => batch.set(d.ref, { academicYear: schoolYear[d.data().schoolId] }, { merge: true }))
    await batch.commit()
  }
  console.log(`${name}: لحّقنا academicYear بـ ${missing.length} وثيقة.`)
}

console.log('خلص ترحيل السنة الدراسية.')
