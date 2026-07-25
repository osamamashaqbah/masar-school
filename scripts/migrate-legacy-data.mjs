// ترحيل لمرة وحدة: بيانات قديمة من قبل ما يصير المشروع multi-tenant ما إلها schoolId.
// هاد السكربت بيلاقي حساب الإدارة القديم (بالإيميل)، بيعمله مدرسة، وبيلحق schoolId
// بكل وثيقة قديمة ناقصها الحقل عبر كل المجموعات.
//
// التشغيل:
//   node scripts/migrate-legacy-data.mjs --admin-email osamaplus17@gmail.com --school "اسم المدرسة"

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

const { 'admin-email': adminEmail, school } = parseArgs()

if (!adminEmail || !school) {
  console.error('الاستخدام: node scripts/migrate-legacy-data.mjs --admin-email old@owner.com --school "اسم المدرسة"')
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
await schoolRef.set({ name: school, adminUid: ownerDoc.id, createdAt: new Date() })
const schoolId = schoolRef.id

await ownerDoc.ref.set({ role: 'admin', schoolId }, { merge: true })
console.log(`أنشأنا مدرسة "${school}" (${schoolId}) وحوّلنا ${adminEmail} لحساب admin فيها.`)

const collections = [
  'users', 'grades', 'sections', 'subjects', 'homework', 'submissions',
  'quizStats', 'notifications', 'notes', 'questions', 'marks', 'attendance', 'progress',
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

console.log('خلص الترحيل.')
