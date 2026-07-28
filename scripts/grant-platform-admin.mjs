// يمنح حساب Firebase Auth صلاحية "صاحب المنصة" (super-admin) — منفصل تمامًا عن نموذج المدارس،
// ما بيقدر أي حدا يعطيها لحاله من المتصفح (القواعد تمنع الكتابة على platformAdmins إطلاقًا).
// لو الحساب مش موجود بـ Firebase Auth أصلاً، السكربت بينشئه (لازم --password أول مرة).
//
// التشغيل (حساب موجود مسبقًا):
//   node scripts/grant-platform-admin.mjs --email osama@example.com
// التشغيل (حساب جديد):
//   node scripts/grant-platform-admin.mjs --email osama@example.com --password "كلمة سر قوية"

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1]
  }
  return args
}

const { email, password } = parseArgs()
if (!email) {
  console.error('الاستخدام: node scripts/grant-platform-admin.mjs --email someone@example.com [--password "كلمة سر قوية"]')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()

let user
try {
  user = await auth.getUserByEmail(email)
  console.log(`لقيت حساب موجود: ${email} (${user.uid})`)
} catch (err) {
  if (err.code !== 'auth/user-not-found') throw err
  if (!password) {
    console.error(`ما في حساب بهالإيميل أصلاً. لو بدك تنشئه، أعد التشغيل مع --password "كلمة سر قوية".`)
    process.exit(1)
  }
  user = await auth.createUser({ email, password })
  console.log(`أنشأنا حساب جديد: ${email} (${user.uid})`)
}

await db.collection('platformAdmins').doc(user.uid).set({
  name: user.displayName || email,
  addedAt: new Date(),
  addedBy: 'script',
})

console.log(`تم منح ${email} (${user.uid}) صلاحية صاحب المنصة.`)
