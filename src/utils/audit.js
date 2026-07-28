import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// سجل تدقيق: مين سوى شو ومتى — best-effort، ما لازم يوقف العملية الأساسية لو فشل
export async function logAudit(schoolId, actorUid, actorName, action, targetType, targetId, details = '') {
  try {
    await addDoc(collection(db, 'auditLog'), {
      schoolId, actorUid, actorName, action, targetType, targetId: targetId || null, details,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[سجل التدقيق] فشل التسجيل:', err)
  }
}
