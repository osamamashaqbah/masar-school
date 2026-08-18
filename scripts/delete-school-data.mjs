// حذف كل بيانات مدرسة واحدة نهائيًا: كل الوثائق يلي عندها هالـ schoolId بكل مجموعة،
// حسابات Auth تبع مستخدميها، ووثيقة المدرسة نفسها (schools/{id}) + platformStats/{id}.
// إجراء لا رجعة فيه — يشتغل بس عن طريق Admin SDK، ومحمي بتأكيد يدوي قبل الحذف الفعلي.
//
// التشغيل:
//   node scripts/delete-school-data.mjs --school-id XYZ123
//   node scripts/delete-school-data.mjs --school-id XYZ123 --yes   (يتخطى التأكيد اليدوي)

import { readFileSync } from 'fs'
import { createInterface } from 'readline/promises'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--yes') { args.yes = true; continue }
    if (argv[i].startsWith('--')) { args[argv[i].replace(/^--/, '')] = argv[i + 1]; i++ }
  }
  return args
}

const { 'school-id': schoolId, yes } = parseArgs()
if (!schoolId) {
  console.error('الاستخدام: node scripts/delete-school-data.mjs --school-id XYZ123 [--yes]')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

// كل مجموعة فيها حقل schoolId على مستوى الوثيقة (مصدرها: بحث collection(db, ...) بكامل src/)
const SCHOOL_SCOPED_COLLECTIONS = [
  'attendance', 'grades', 'homework', 'marks', 'notes', 'notifications',
  'progress', 'questions', 'quizStats', 'sections', 'subjects', 'submissions',
  'users', 'threads', 'messages', 'earlyWarnings', 'honorBoards',
  'announcements', 'auditLog', 'excuseRequests', 'timetables',
  'feedbackCases', 'feedbackReplies', 'teacherAvailability', 'teacherAbsences',
  'substituteCoverage', 'studentInterventions', 'examPeriods', 'examSlots',
  'questionBank', 'rolloverOperations',
]

const schoolSnap = await db.collection('schools').doc(schoolId).get()
if (!schoolSnap.exists) {
  console.error(`ما في مدرسة بهالمعرّف: ${schoolId}`)
  process.exit(1)
}
console.log(`المدرسة: ${schoolSnap.data().name || schoolId} (${schoolId})`)

const usersSnap = await db.collection('users').where('schoolId', '==', schoolId).get()
const authUids = usersSnap.docs.map((d) => d.id)
console.log(`هيتحذف: ${authUids.length} حساب Auth، ووثائق ${SCHOOL_SCOPED_COLLECTIONS.length} مجموعة، ووثيقة المدرسة + إحصائياتها.`)

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('اكتب اسم المدرسة بالضبط للتأكيد (لا رجعة بعدها): ')
  rl.close()
  if (answer.trim() !== (schoolSnap.data().name || '')) {
    console.error('الاسم ما تطابق — تم الإلغاء، ما انحذف أي شي.')
    process.exit(1)
  }
}

console.log('== حذف حسابات Auth ==')
for (let i = 0; i < authUids.length; i += 1000) {
  const chunk = authUids.slice(i, i + 1000)
  if (chunk.length === 0) continue
  const res = await auth.deleteUsers(chunk)
  console.log(`  حُذف ${res.successCount}/${chunk.length}`)
}

console.log('== حذف مجموعات Firestore ==')
for (const name of SCHOOL_SCOPED_COLLECTIONS) {
  const snap = await db.collection(name).where('schoolId', '==', schoolId).get()
  const batchSize = 400
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch()
    snap.docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  console.log(`${name}: حذف ${snap.docs.length}`)
}

await db.collection('platformStats').doc(schoolId).delete().catch(() => {})
await db.collection('schools').doc(schoolId).delete()
console.log(`\nتم حذف مدرسة ${schoolId} بالكامل.`)
