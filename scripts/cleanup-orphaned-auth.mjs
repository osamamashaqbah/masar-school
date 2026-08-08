// حسابات Firebase Auth بلا ملف تعريف Firestore مطابق (users/{uid}) — تصير لما تفشل كتابة
// الملف الشخصي بعد نجاح إنشاء حساب Auth (AdminPage.jsx / BulkImportContext.jsx) قبل إضافة
// آلية التراجع التلقائي. حساب يتيم كهيك بريده محجوز للأبد وما تقدر الواجهة تديره.
// وضع افتراضي: عرض فقط (dry-run). --yes يحذف الحسابات اليتيمة فعليًا.
//
// التشغيل:
//   node scripts/cleanup-orphaned-auth.mjs
//   node scripts/cleanup-orphaned-auth.mjs --yes

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const yes = process.argv.includes('--yes')

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

async function listAllAuthUsers() {
  const users = []
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  return users
}

const authUsers = await listAllAuthUsers()
console.log(`إجمالي حسابات Auth: ${authUsers.length}`)

const orphaned = []
for (let i = 0; i < authUsers.length; i += 300) {
  const chunk = authUsers.slice(i, i + 300)
  const snaps = await db.getAll(...chunk.map((u) => db.collection('users').doc(u.uid)))
  chunk.forEach((u, idx) => { if (!snaps[idx].exists) orphaned.push(u) })
}

if (orphaned.length === 0) {
  console.log('ما في حسابات يتيمة.')
  process.exit(0)
}

console.log(`\nحسابات يتيمة (بلا ملف Firestore): ${orphaned.length}`)
orphaned.forEach((u) => console.log(`  ${u.uid}  ${u.email || '(بدون بريد)'}  أُنشئ: ${u.metadata.creationTime}`))

if (!yes) {
  console.log('\nهذا عرض فقط (dry-run). أضف --yes لحذف هالحسابات فعليًا.')
  process.exit(0)
}

console.log('\n== حذف الحسابات اليتيمة ==')
const uids = orphaned.map((u) => u.uid)
for (let i = 0; i < uids.length; i += 1000) {
  const chunk = uids.slice(i, i + 1000)
  const res = await auth.deleteUsers(chunk)
  console.log(`  حُذف ${res.successCount}/${chunk.length}`)
}
console.log('تم.')
