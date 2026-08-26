// ترحيل لمرة وحدة: بيانات قديمة من قبل ما يصير المشروع multi-tenant ما إلها schoolId.
// هاد السكربت بيلاقي حساب الإدارة القديم (بالإيميل)، بيعمله مدرسة، وبيلحق schoolId
// بكل وثيقة قديمة ناقصها الحقل عبر كل المجموعات.
//
// التشغيل:
//   node scripts/migrate-legacy-data.mjs --admin-email osamaplus17@gmail.com --school "اسم المدرسة" --academic-year 2025-2026

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

const { 'admin-email': adminEmail, school, 'academic-year': academicYear } = parseArgs()

if (!adminEmail || !school || !academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
  console.error('الاستخدام: node scripts/migrate-legacy-data.mjs --admin-email old@owner.com --school "اسم المدرسة" --academic-year 2025-2026')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const ownerSnap = await db.collection('users').where('email', '==', adminEmail).limit(1).get()
if (ownerSnap.empty) {
  console.error(`ما لقيت مستخدم بالإيميل ${adminEmail}`)
  process.exit(1)
}
const ownerDoc = ownerSnap.docs[0]

const schoolRef = db.collection('schools').doc()
await schoolRef.set({ name: school, adminUid: ownerDoc.id, currentAcademicYear: academicYear, createdAt: new Date() })
const schoolId = schoolRef.id

await ownerDoc.ref.set({ role: 'admin', schoolId }, { merge: true })
console.log(`أنشأنا مدرسة "${school}" (${schoolId}) وحوّلنا ${adminEmail} لحساب admin فيها.`)

const collections = [
  'users', 'grades', 'sections', 'subjects', 'homework', 'submissions',
  'quizStats', 'notifications', 'notes', 'questions', 'marks', 'attendance', 'progress',
  'threads', 'messages', 'earlyWarnings', 'honorBoards', 'userDirectory',
]

for (const name of collections) {
  const snap = await db.collection(name).get()
  const missing = snap.docs.filter((d) => !d.data().schoolId)
  if (missing.length === 0) {
    console.log(`${name}: كل شي فيه schoolId أصلاً، ما في داعي لتعديل.`)
    continue
  }
  // batched write بحد أقصى 500 عملية لكل batch
  for (let i = 0; i < missing.length; i += 450) {
    const batch = db.batch()
    missing.slice(i, i + 450).forEach((d) => batch.set(d.ref, { schoolId }, { merge: true }))
    await batch.commit()
  }
  console.log(`${name}: لحّقنا schoolId بـ ${missing.length} وثيقة.`)
}

const usersForDirectory = await db.collection('users').where('schoolId', '==', schoolId).get()
for (let i = 0; i < usersForDirectory.docs.length; i += 450) {
  const batch = db.batch()
  usersForDirectory.docs.slice(i, i + 450).forEach((userDoc) => {
    const user = userDoc.data()
    const contactUids = user.role === 'student'
      ? (Array.isArray(user.parentUids) ? user.parentUids : [])
      : (Array.isArray(user.messageContactUids) ? user.messageContactUids : [])
    batch.set(db.collection('userDirectory').doc(userDoc.id), {
      name: user.name || '', role: user.role, schoolId,
      sectionId: user.sectionId || null, status: user.status || 'active', contactUids,
    }, { merge: true })
  })
  await batch.commit()
}
console.log(`userDirectory: جهّزنا ${usersForDirectory.size} ملف عرض محدود.`)

const yearCollections = [
  'subjects', 'homework', 'submissions', 'quizStats', 'notes', 'questions', 'marks', 'attendance',
  'progress', 'earlyWarnings', 'excuseRequests', 'feedbackCases', 'studentInterventions',
  'teacherAvailability', 'teacherAbsences', 'substituteCoverage', 'timetables', 'examPeriods', 'examSlots',
  'questionBank',
]
for (const name of yearCollections) {
  const snap = await db.collection(name).where('schoolId', '==', schoolId).get()
  const missingYear = snap.docs.filter((item) => !item.data().academicYear)
  for (let i = 0; i < missingYear.length; i += 450) {
    const batch = db.batch()
    missingYear.slice(i, i + 450).forEach((item) => batch.set(item.ref, { academicYear }, { merge: true }))
    await batch.commit()
  }
  if (missingYear.length > 0) console.log(`${name}: أضفنا السنة الدراسية إلى ${missingYear.length} وثيقة.`)
}

console.log('خلص الترحيل.')
