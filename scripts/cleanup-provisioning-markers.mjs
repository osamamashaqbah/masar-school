// يحذف محاولات إنشاء المدارس المكتملة الأقدم من فترة الاحتفاظ المحددة.
// الافتراضي dry-run؛ لا حذف إلا مع --delete --confirm=CLEANUP_PROVISIONING_MARKERS.

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--delete') args.delete = true
    else if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i += 1 }
  }
  return args
}

const args = parseArgs()
const retentionDays = Number(args.days || 7)
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
  console.error('قيمة --days يجب أن تكون رقمًا صحيحًا بين 1 و365.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
const snapshot = await db.collection('schoolProvisioningRequests').where('status', '==', 'completed').get()
const expired = snapshot.docs.filter((item) => {
  const createdAt = item.get('createdAt')
  const createdAtMs = typeof createdAt === 'string'
    ? Date.parse(createdAt)
    : (createdAt?.toMillis?.() || (createdAt instanceof Date ? createdAt.getTime() : NaN))
  return Number.isFinite(createdAtMs) && createdAtMs < cutoff
})

console.log(`المكتمل: ${snapshot.size}، الأقدم من ${retentionDays} أيام: ${expired.length}`)
expired.forEach((item) => console.log(`  ${item.id}  ${item.get('schoolName') || ''}  ${item.get('createdAt') || ''}`))
if (!args.delete || args.confirm !== 'CLEANUP_PROVISIONING_MARKERS') {
  console.log('هذا عرض فقط. للحذف أضف --delete --confirm=CLEANUP_PROVISIONING_MARKERS.')
  process.exit(0)
}

for (let i = 0; i < expired.length; i += 400) {
  const batch = db.batch()
  expired.slice(i, i + 400).forEach((item) => batch.delete(item.ref))
  await batch.commit()
}
console.log(`تم حذف ${expired.length} marker.`)
