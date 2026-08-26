import { auth } from '../firebase'

// سجل التدقيق يمر عبر Worker موثوق. لا نرسل هوية الفاعل أو المدرسة كحقيقة؛ Worker يستخرجها من التوكن وملف المستخدم.
export async function logAudit(schoolId, actorUid, actorName, action, targetType, targetId, details = '') {
  void actorUid
  void actorName
  try {
    const workerUrl = import.meta.env.VITE_ADMIN_OPS_WORKER_URL?.replace(/\/$/, '')
    const idToken = await auth.currentUser?.getIdToken()
    if (!workerUrl || !idToken) {
      console.error('[سجل التدقيق] Worker غير مضبوط أو الجلسة منتهية')
      return false
    }
    const response = await fetch(`${workerUrl}/audit-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ schoolId, action, targetType, targetId: targetId || null, details }),
    })
    if (!response.ok) throw new Error(`audit-log ${response.status}`)
    return true
  } catch (err) {
    console.error('[سجل التدقيق] فشل التسجيل:', err)
    return false
  }
}

export async function requireAudit(schoolId, actorUid, actorName, action, targetType, targetId, details = '') {
  if (!await logAudit(schoolId, actorUid, actorName, action, targetType, targetId, details)) {
    throw new Error('audit_unavailable')
  }
}
