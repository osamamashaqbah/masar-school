// سكربت داخلي: يمسح كل بيانات المنصة (كل المدارس) من Auth + Firestore،
// وبعدين يبني مدرسة عرض تجريبي واحدة فيها 4 حسابات (إدارة/معلّم/طالب/ولي أمر) مربوطين ببعض.
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
const projectId = serviceAccount.project_id || ''
const confirmation = process.argv.includes('--confirm=DESTROY_TEST_DATA')
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)
const isTestProject = /(^|[-_])(test|dev)([-_]|$)/i.test(projectId)

if (!confirmation || (!usingEmulators && !isTestProject) || projectId === 'masar-school-demo') {
  console.error('مرفوض: full-reset يعمل فقط على Emulator أو مشروع test/dev مع --confirm=DESTROY_TEST_DATA، وليس على الإنتاج.')
  process.exit(1)
}

initializeApp({ credential: cert(serviceAccount), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com` })
const auth = getAuth()
const db = getFirestore()
const bucket = getStorage().bucket()

const COLLECTIONS = [
  'attendance', 'grades', 'homework', 'marks', 'notes', 'notifications',
  'progress', 'questions', 'quizStats', 'sections', 'subjects', 'submissions',
  'users', 'schools', 'threads', 'messages', 'earlyWarnings', 'honorBoards',
  'announcements', 'auditLog', 'excuseRequests', 'timetables',
  'feedbackCases', 'feedbackReplies', 'teacherAvailability', 'teacherAbsences',
  'substituteCoverage', 'studentInterventions', 'examPeriods', 'examSlots',
  'questionBank', 'rolloverOperations', 'platformStats', 'userDirectory',
  'schoolDeletionOperations',
]

console.log('== حذف Firebase Auth ==')
let nextPageToken
let deletedAuth = 0
do {
  const list = await auth.listUsers(1000, nextPageToken)
  if (list.users.length > 0) {
    const res = await auth.deleteUsers(list.users.map((u) => u.uid))
    deletedAuth += res.successCount
  }
  nextPageToken = list.pageToken
} while (nextPageToken)
console.log(`تم حذف ${deletedAuth} حساب Auth`)

console.log('== حذف مجموعات Firestore ==')
for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get()
  const batchSize = 400
  let deleted = 0
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch()
    snap.docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += Math.min(batchSize, snap.docs.length - i)
  }
  console.log(`${name}: حذف ${deleted}`)
}

await bucket.deleteFiles({ prefix: 'schools/' })
console.log('Storage: حُذفت ملفات المدارس')

console.log('\n== بناء مدرسة العرض التجريبي ==')
const schoolRef = db.collection('schools').doc()
const schoolId = schoolRef.id

async function createAccount(role, name, email, password, extra = {}) {
  const rec = await auth.createUser({ email, password, displayName: name })
  await db.collection('users').doc(rec.uid).set({ name, role, email, schoolId, ...extra })
  await db.collection('userDirectory').doc(rec.uid).set({ name, role, schoolId, sectionId: extra.sectionId || null, status: 'active', contactUids: [] })
  return rec.uid
}

const currentAcademicYear = '2025-2026'
const demoPassword = `Demo-${randomUUID()}`
const adminUid = await createAccount('admin', 'مدير العرض', 'admin@demo.masar', demoPassword)
await schoolRef.set({ name: 'مدرسة العرض التجريبي', adminUid, currentAcademicYear, createdAt: FieldValue.serverTimestamp() })

const instructorUid = await createAccount('instructor', 'أ. سامي المعلّم', 'instructor@demo.masar', demoPassword)

const gradeRef = await db.collection('grades').add({ name: 'الصف السابع', schoolId })
const sectionRef = await db.collection('sections').add({ name: 'شعبة أ', gradeId: gradeRef.id, schoolId })
await db.collection('subjects').add({
  name: 'الرياضيات', sectionId: sectionRef.id, schoolId, academicYear: currentAcademicYear,
  teacherUid: instructorUid, teacherName: 'أ. سامي المعلّم', lessons: [],
})

const studentUid = await createAccount('student', 'خالد الطالب', 'student@demo.masar', demoPassword, { sectionId: sectionRef.id })
const parentUid = await createAccount('parent', 'ولي أمر خالد الطالب', 'parent@demo.masar', demoPassword, { childUids: [studentUid] })
await db.collection('users').doc(studentUid).update({ parentUids: FieldValue.arrayUnion(parentUid) })

console.log(`\nschoolId: ${schoolId}`)
console.log('حسابات العرض:')
console.log(`  إدارة   : admin@demo.masar / ${demoPassword}`)
console.log(`  معلّم   : instructor@demo.masar / ${demoPassword}`)
console.log(`  طالب    : student@demo.masar / ${demoPassword}`)
console.log(`  ولي أمر : parent@demo.masar / ${demoPassword}`)
