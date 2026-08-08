import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Cache محلي دائم (IndexedDB) — بيخلي آخر بيانات محمّلة (جدول، إعلانات، حضور...) تضل متاحة
// للقراءة بدون نت، وبيطبّر أي setDoc/updateDoc صار بانقطاع النت تلقائيًا لما يرجع الاتصال،
// بدل ما نبني طابور IndexedDB يدوي لحالنا. multiTabManager حتى ما تنكسر لو المستخدم فاتح
// أكتر من تبويب بنفس الوقت (بدونها ثاني تبويب بياخذ "فشل القفل" بدل ما يشتغل).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const storage = getStorage(app)