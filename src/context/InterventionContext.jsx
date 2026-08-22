import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, query, where, onSnapshot, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { sendNotification } from '../utils/notify'
import { logAudit } from '../utils/audit'

const InterventionContext = createContext(null)

export function InterventionProvider({ children }) {
  const { session } = useSession()
  const [byStudent, setByStudent] = useState({}) // studentUid -> interventions[]
  const [watchedUid, setWatchedUid] = useState(null)
  const [error, setError] = useState('')

  // نافذة واحدة مفتوحة بكل مرة (صفحة الملف الشخصي لطالب واحد) — نفس فكرة activeCaseId بـ FeedbackContext
  useEffect(() => {
    if (!session || session.role !== 'admin' || !watchedUid) { setError(''); return }
    setError('')
    const q = query(
      collection(db, 'studentInterventions'),
      where('schoolId', '==', session.schoolId), where('studentUid', '==', watchedUid)
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setByStudent((prev) => ({ ...prev, [watchedUid]: list }))
    }, (err) => { console.error('[التدخلات] فشل تحميل تدخلات الطالب:', err); setError('تعذّر تحميل خطط التدخل لهذا الطالب.') })
    return () => unsub()
  }, [session, watchedUid])

  function watchStudent(studentUid) {
    setWatchedUid(studentUid)
  }

  function interventionsFor(studentUid) {
    return byStudent[studentUid] || []
  }

  async function createIntervention({ studentUid, studentName, riskLevel, reason, assignedToUid, assignedToName, action, followUpDate }) {
    const ref = await addDoc(collection(db, 'studentInterventions'), {
      schoolId: session.schoolId, studentUid, studentName,
      riskLevel: riskLevel || 'medium', reason: reason || '',
      assignedToUid: assignedToUid || null, assignedToName: assignedToName || null,
      action: action || '', followUpDate: followUpDate || null,
      status: 'open',
      timeline: [{ atMs: Date.now(), byUid: session.uid, byName: session.name, kind: 'created', text: reason || '' }],
      createdByUid: session.uid, createdByName: session.name,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'create_intervention', 'studentIntervention', ref.id, studentName)
    if (assignedToUid) {
      try { await sendNotification(assignedToUid, `اتعيّنت مسؤول متابعة لخطة تدخل بخصوص ${studentName}`, 'warning', session.schoolId) } catch { /* best-effort */ }
    }
    return ref.id
  }

  async function addNote(interventionId, text) {
    const trimmed = text.trim()
    if (!trimmed) return
    await updateDoc(doc(db, 'studentInterventions', interventionId), {
      timeline: arrayUnion({ atMs: Date.now(), byUid: session.uid, byName: session.name, kind: 'note', text: trimmed }),
      updatedAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'note_intervention', 'studentIntervention', interventionId)
  }

  async function changeStatus(interventionId, status) {
    const extra = {}
    if (status === 'resolved') extra.resolvedAt = serverTimestamp()
    if (status === 'closed') extra.closedAt = serverTimestamp()
    await updateDoc(doc(db, 'studentInterventions', interventionId), {
      status, updatedAt: serverTimestamp(),
      timeline: arrayUnion({ atMs: Date.now(), byUid: session.uid, byName: session.name, kind: 'status', text: status }),
      ...extra,
    })
    const actionMap = { open: 'reopen_intervention', in_progress: 'progress_intervention', resolved: 'resolve_intervention', closed: 'close_intervention' }
    logAudit(session.schoolId, session.uid, session.name, actionMap[status] || 'update_intervention_status', 'studentIntervention', interventionId)
  }

  async function reassign(interventionId, assignedToUid, assignedToName) {
    await updateDoc(doc(db, 'studentInterventions', interventionId), {
      assignedToUid, assignedToName, updatedAt: serverTimestamp(),
      timeline: arrayUnion({ atMs: Date.now(), byUid: session.uid, byName: session.name, kind: 'reassign', text: assignedToName }),
    })
    logAudit(session.schoolId, session.uid, session.name, 'reassign_intervention', 'studentIntervention', interventionId, assignedToName)
    try { await sendNotification(assignedToUid, 'اتعيّنت مسؤول متابعة لخطة تدخل طالب', 'warning', session.schoolId) } catch { /* best-effort */ }
  }

  return (
    <InterventionContext.Provider value={{
      watchStudent, interventionsFor, createIntervention, addNote, changeStatus, reassign, error,
    }}>
      {children}
    </InterventionContext.Provider>
  )
}

export function useIntervention() {
  const ctx = useContext(InterventionContext)
  if (!ctx) throw new Error('useIntervention must be used inside InterventionProvider')
  return ctx
}
