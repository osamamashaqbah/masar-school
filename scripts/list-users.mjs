import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const snap = await db.collection('users').get()
console.log(`عدد المستخدمين: ${snap.size}\n`)
snap.docs.forEach((d) => {
  const u = d.data()
  console.log(`${d.id}  |  ${u.role}  |  ${u.name}  |  ${u.email}  |  schoolId:${u.schoolId}`)
})
