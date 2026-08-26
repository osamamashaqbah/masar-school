// يحذف كل بيانات مدرسة واحدة نهائيًا بطريقة قابلة للاستئناف.
// الافتراضي dry-run؛ الحذف يحتاج --delete و --confirm-school="اسم المدرسة".
// لا نختبر هذا السكربت على بيانات الإنتاج الحقيقية.
//
// التشغيل الآمن:
//   node scripts/delete-school-data.mjs --school-id XYZ123
//   node scripts/delete-school-data.mjs --school-id XYZ123 --delete --confirm-school="اسم المدرسة"

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--delete') args.delete = true
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--yes') args.legacyYes = true
    else if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i += 1 }
  }
  return args
}

const args = parseArgs()
const schoolId = args['school-id']
if (!schoolId || args.legacyYes) {
  console.error('الاستخدام: node scripts/delete-school-data.mjs --school-id XYZ123 [--delete --confirm-school="اسم المدرسة"]')
  if (args.legacyYes) console.error('الخيار --yes لم يعد مقبولًا؛ استخدم تأكيد اسم المدرسة صراحة.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com` })
const auth = getAuth()
const db = getFirestore()
const bucket = getStorage().bucket()

const SCHOOL_SCOPED_COLLECTIONS = [
  'attendance', 'grades', 'homework', 'marks', 'notes', 'notifications',
  'progress', 'questions', 'quizStats', 'sections', 'subjects', 'submissions',
  'users', 'threads', 'messages', 'earlyWarnings', 'honorBoards',
  'announcements', 'auditLog', 'excuseRequests', 'timetables',
  'feedbackCases', 'feedbackReplies', 'teacherAvailability', 'teacherAbsences',
  'substituteCoverage', 'studentInterventions', 'examPeriods', 'examSlots',
  'questionBank', 'rolloverOperations', 'userDirectory',
  'schoolProvisioningRequests',
]

const schoolRef = db.collection('schools').doc(schoolId)
const markerRef = db.collection('schoolDeletionOperations').doc(schoolId)
const [schoolSnap, markerSnap] = await Promise.all([schoolRef.get(), markerRef.get()])
if (!schoolSnap.exists && !markerSnap.exists) {
  console.error(`ما في مدرسة أو عملية حذف معلّقة بهذا المعرّف: ${schoolId}`)
  process.exit(1)
}

const schoolName = schoolSnap.exists ? (schoolSnap.data().name || schoolId) : (markerSnap.data().schoolName || schoolId)
const marker = markerSnap.exists ? markerSnap.data() : null
if (marker?.status === 'completed') {
  console.log(`عملية حذف المدرسة ${schoolId} مكتملة.`)
  process.exit(0)
}

if (!marker) {
  const usersSnap = await db.collection('users').where('schoolId', '==', schoolId).get()
  const counts = {}
  for (const name of SCHOOL_SCOPED_COLLECTIONS) {
    counts[name] = (await db.collection(name).where('schoolId', '==', schoolId).get()).size
  }
  console.log(`المدرسة: ${schoolName} (${schoolId})`)
  console.log(`هيتحذف: ${usersSnap.size} حساب Auth، و${Object.values(counts).reduce((a, b) => a + b, 0)} وثيقة، وملفات Storage الخاصة بالمدرسة.`)
  console.log('هذا dry-run. لا شيء انحذف.')
  if (!args.delete || args['confirm-school'] !== schoolName) {
    console.log(`للتنفيذ: أضف --delete --confirm-school="${schoolName}".`)
    process.exit(0)
  }

  const now = new Date().toISOString()
  await markerRef.create({
    schoolId, schoolName, status: 'in_progress', authUids: usersSnap.docs.map((doc) => doc.id),
    deletedAuthUids: [], completedCollections: [], completedStages: [], createdAt: now, updatedAt: now,
  })
} else if (!args.delete || args['confirm-school'] !== schoolName) {
  console.log(`عملية حذف معلّقة للمدرسة ${schoolName}. أعد التشغيل مع --delete --confirm-school="${schoolName}" للاستئناف.`)
  process.exit(0)
}

let operation = (await markerRef.get()).data()
const updateOperation = async (patch) => {
  operation = { ...operation, ...patch, updatedAt: new Date().toISOString() }
  await markerRef.set(operation)
}

console.log('== حذف مجموعات Firestore ==')
for (const name of SCHOOL_SCOPED_COLLECTIONS) {
  if (operation.completedCollections.includes(name)) continue
  const snap = await db.collection(name).where('schoolId', '==', schoolId).get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }
  await updateOperation({ completedCollections: [...operation.completedCollections, name] })
  console.log(`${name}: حذف ${snap.size}`)
}

if (!operation.completedStages.includes('storage')) {
  console.log('== حذف ملفات Storage ==')
  await bucket.deleteFiles({ prefix: `schools/${schoolId}/` })
  await updateOperation({ completedStages: [...operation.completedStages, 'storage'] })
}

if (!operation.completedStages.includes('school-records')) {
  await db.collection('platformStats').doc(schoolId).delete().catch(() => {})
  await schoolRef.delete().catch((err) => { if (err.code !== 5) throw err })
  await updateOperation({ completedStages: [...operation.completedStages, 'school-records'] })
}

console.log('== حذف حسابات Auth ==')
const deletedAuthUids = new Set(operation.deletedAuthUids || [])
const remainingAuthUids = (operation.authUids || []).filter((uid) => !deletedAuthUids.has(uid))
for (let i = 0; i < remainingAuthUids.length; i += 1000) {
  const chunk = remainingAuthUids.slice(i, i + 1000)
  const result = await auth.deleteUsers(chunk)
  const failedIndexes = new Set((result.errors || []).map((error) => error.index))
  chunk.forEach((uid, index) => { if (!failedIndexes.has(index)) deletedAuthUids.add(uid) })
  await updateOperation({ deletedAuthUids: [...deletedAuthUids] })
  console.log(`  حُذف ${chunk.length - failedIndexes.size}/${chunk.length}`)
  if (failedIndexes.size > 0) throw new Error(`تعذّر حذف ${failedIndexes.size} حساب Auth؛ العملية محفوظة للاستئناف.`)
}

await markerRef.delete()
console.log(`\nتم حذف مدرسة ${schoolId} بالكامل، ويمكن إعادة تشغيل السكربت بأمان إذا انقطع أثناء أي مرحلة.`)
