// سكربت داخلي لإنشاء مدرسة جديدة + أول حساب إدارة فيها. يُستخدم فقط من طرفنا وقت بيع
// المنصة لمدرسة جديدة — ما في تسجيل ذاتي عام بالتطبيق.
//
// الإعداد (مرة وحدة): Firebase Console > Project Settings > Service Accounts >
// Generate new private key، واحفظ الملف باسم serviceAccountKey.json بجذر المشروع (مُتجاهل بـ .gitignore).
//
// التشغيل:
//   node scripts/create-school.mjs --school "اسم المدرسة" --name "اسم مدير المدرسة" --email admin@school.com --password "كلمة سر قوية"

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

const { school, name, email, password } = parseArgs()

if (!school || !name || !email || !password) {
  console.error('الاستخدام: node scripts/create-school.mjs --school "اسم المدرسة" --name "اسم المدير" --email admin@school.com --password "كلمة سر"')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })

const auth = getAuth()
const db = getFirestore()

const userRecord = await auth.createUser({ email, password, displayName: name })

const schoolRef = db.collection('schools').doc()
await schoolRef.set({ name: school, adminUid: userRecord.uid, createdAt: new Date() })
await db.collection('users').doc(userRecord.uid).set({
  name,
  role: 'admin',
  email,
  schoolId: schoolRef.id,
  status: 'active',
  mustChangePassword: true,
})

console.log(`تم إنشاء مدرسة "${school}" (schoolId: ${schoolRef.id})`)
console.log(`حساب الإدارة: ${email} / ${password}`)
