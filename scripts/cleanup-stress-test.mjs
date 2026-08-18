// تنظيف طارئ: يدور على أي مدرسة بقي معرّفها يبلّش بـ STRESS_TEST_ (بقايا تست ضغط انقطع بالنص)
// ويحذفها بالكامل — نفس منطق scripts/delete-school-data.mjs بس بدون تأكيد يدوي لأنه واضح
// من الاسم إنها بيانات اختبار مش بيانات حقيقية.
//
// التشغيل: node scripts/cleanup-stress-test.mjs

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
db.settings({ preferRest: true })

const schoolsSnap = await db.collection('schools').get()
const staleSchoolIds = schoolsSnap.docs.filter((d) => d.id.startsWith('STRESS_TEST_')).map((d) => d.id)

if (staleSchoolIds.length === 0) {
  console.log('ما في أي بقايا STRESS_TEST_ — كل شي نظيف.')
  process.exit(0)
}

console.log(`لقيت ${staleSchoolIds.length} مدرسة اختبار عالقة: ${staleSchoolIds.join(', ')}`)

const collections = [
  'attendance', 'grades', 'homework', 'marks', 'notes', 'notifications', 'progress', 'questions',
  'quizStats', 'sections', 'subjects', 'submissions', 'users', 'threads', 'messages', 'earlyWarnings',
  'honorBoards', 'announcements', 'auditLog', 'excuseRequests', 'timetables', 'feedbackCases',
  'feedbackReplies', 'teacherAvailability', 'teacherAbsences', 'substituteCoverage',
  'studentInterventions', 'examPeriods', 'examSlots', 'questionBank', 'rolloverOperations', 'platformStats',
]
for (const schoolId of staleSchoolIds) {
  let total = 0
  for (const name of collections) {
    const snap = await db.collection(name).where('schoolId', '==', schoolId).get()
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch()
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    total += snap.docs.length
  }
  await db.collection('schools').doc(schoolId).delete()
  console.log(`  حُذفت ${schoolId} (${total} وثيقة)`)
}

console.log('\nتم التنظيف بالكامل.')
