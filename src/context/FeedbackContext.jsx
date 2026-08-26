import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, doc, updateDoc, query, where, onSnapshot, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'
import { logAudit } from '../utils/audit'

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear, features } = useSchoolStructure()
  const feedbackEnabled = features.feedback === true

  const [myCases, setMyCases] = useState([])
  const [adminCases, setAdminCases] = useState([])
  const [activeCaseId, setActiveCaseId] = useState(null)
  const [replies, setReplies] = useState([])

  // كل حالة أنا مشارك فيها (مرسلة أو واردة) — نفس منطق threads بالضبط
  useEffect(() => {
    if (!session || !feedbackEnabled || !currentAcademicYear) { setMyCases([]); return }
    const q = query(
      collection(db, 'feedbackCases'),
      where('schoolId', '==', session.schoolId),
      where('participantUids', 'array-contains', session.uid),
      where('academicYear', '==', currentAcademicYear),
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      setMyCases(list)
    }, (err) => { console.error('[الملاحظات] فشل تحميل حالاتي:', err); setMyCases([]) })
    return () => unsub()
  }, [session, feedbackEnabled, currentAcademicYear])

  // صندوق الإدارة: موجّهة للإدارة، أو مصعّدة إليها — استعلامين منفصلين ودمج، لأن القاعدة الأمنية
  // بتتحقق من recipientRole أو escalatedToAdmin وبدها الحقل يلي عم تفحصه ضمن فلتر الاستعلام نفسه
  useEffect(() => {
    if (!session || session.role !== 'admin' || !feedbackEnabled || !currentAcademicYear) { setAdminCases([]); return }
    const directedQ = query(collection(db, 'feedbackCases'), where('schoolId', '==', session.schoolId), where('recipientRole', '==', 'admin'), where('academicYear', '==', currentAcademicYear))
    const escalatedQ = query(collection(db, 'feedbackCases'), where('schoolId', '==', session.schoolId), where('escalatedToAdmin', '==', true), where('academicYear', '==', currentAcademicYear))
    let directed = [], escalated = []
    function mergeAndSet() {
      const map = new Map()
      ;[...directed, ...escalated].forEach((c) => map.set(c.id, c))
      const list = [...map.values()]
      list.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      setAdminCases(list)
    }
    const unsub1 = onSnapshot(directedQ, (snap) => { directed = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() }, (err) => console.error('[الملاحظات] فشل تحميل صندوق الإدارة:', err))
    const unsub2 = onSnapshot(escalatedQ, (snap) => { escalated = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() }, (err) => console.error('[الملاحظات] فشل تحميل التصعيدات:', err))
    return () => { unsub1(); unsub2() }
  }, [session, feedbackEnabled, currentAcademicYear])

  // ردود الحالة المفتوحة حاليًا — ردود المشاركين دايمًا، وملاحظات الإدارة الداخلية بس للإدارة
  useEffect(() => {
    if (!activeCaseId || !session) { setReplies([]); return }
    const participantsQ = query(
      collection(db, 'feedbackReplies'),
      where('feedbackId', '==', activeCaseId), where('schoolId', '==', session.schoolId), where('visibility', '==', 'participants')
    )
    let participants = [], internal = []
    function mergeAndSet() {
      const list = [...participants, ...internal]
      list.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      setReplies(list)
    }
    const unsub1 = onSnapshot(participantsQ, (snap) => { participants = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() }, (err) => console.error('[الملاحظات] فشل تحميل الردود:', err))
    let unsub2 = () => {}
    if (session.role === 'admin') {
      const internalQ = query(
        collection(db, 'feedbackReplies'),
        where('feedbackId', '==', activeCaseId), where('schoolId', '==', session.schoolId), where('visibility', '==', 'admin_internal')
      )
      unsub2 = onSnapshot(internalQ, (snap) => { internal = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() }, () => { internal = []; mergeAndSet() })
    }
    return () => { unsub1(); unsub2() }
  }, [activeCaseId, session])

  function openCase(feedbackId) {
    setActiveCaseId(feedbackId)
    updateDoc(doc(db, 'feedbackCases', feedbackId), { readBy: arrayUnion(session.uid) }).catch(() => {})
  }

  async function createCase({ route, recipientUid, recipientRole, studentUid, subjectId, kind, category, title, body, requiresResponse, importance }) {
    const participantUids = route === 'parent_to_admin' ? [session.uid] : [session.uid, recipientUid]
    const data = {
      schoolId: session.schoolId,
      academicYear: currentAcademicYear || null,
      route, recipientRole,
      recipientUid: recipientUid || null,
      studentUid: studentUid || null,
      subjectId: subjectId || null,
      createdByUid: session.uid,
      createdByRole: session.role,
      createdByNameSnapshot: session.name,
      kind, category, title: title.trim(), body: body.trim(),
      requiresResponse: !!requiresResponse,
      importance: importance || 'normal',
      status: 'open',
      escalatedToAdmin: false,
      participantUids,
      readBy: [session.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const ref = await addDoc(collection(db, 'feedbackCases'), data)
    if (recipientUid) {
      try { await sendNotification(recipientUid, `ملاحظة جديدة من ${session.name}: ${title.trim()}`, 'feedback', session.schoolId) } catch { /* best-effort */ }
    }
    logAudit(session.schoolId, session.uid, session.name, 'create_feedback', 'feedback', ref.id)
    return ref.id
  }

  async function addReply(feedbackId, body, visibility = 'participants') {
    const trimmed = body.trim()
    if (!trimmed) return
    await addDoc(collection(db, 'feedbackReplies'), {
      feedbackId, schoolId: session.schoolId, authorUid: session.uid, authorRole: session.role,
      authorNameSnapshot: session.name, body: trimmed, visibility, createdAt: serverTimestamp(),
    })
    if (visibility === 'participants') {
      await updateDoc(doc(db, 'feedbackCases', feedbackId), {
        lastReplyAt: serverTimestamp(), lastReplyByUid: session.uid, readBy: [session.uid], updatedAt: serverTimestamp(),
      })
      const targetCase = [...myCases, ...adminCases].find((c) => c.id === feedbackId)
      const otherUid = targetCase?.participantUids?.find((u) => u !== session.uid)
      if (otherUid) {
        try { await sendNotification(otherUid, `رد جديد على ملاحظة من ${session.name}`, 'feedback', session.schoolId) } catch { /* best-effort */ }
      }
      logAudit(session.schoolId, session.uid, session.name, 'reply_feedback', 'feedback', feedbackId)
    } else {
      logAudit(session.schoolId, session.uid, session.name, 'reply_feedback', 'feedback', feedbackId, 'ملاحظة داخلية')
    }
  }

  async function escalateCase(feedbackId) {
    await updateDoc(doc(db, 'feedbackCases', feedbackId), { escalatedToAdmin: true, escalatedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    logAudit(session.schoolId, session.uid, session.name, 'escalate_feedback', 'feedback', feedbackId)
  }

  async function changeStatus(feedbackId, status) {
    const extra = {}
    if (status === 'resolved') extra.resolvedAt = serverTimestamp()
    if (status === 'closed') extra.closedAt = serverTimestamp()
    await updateDoc(doc(db, 'feedbackCases', feedbackId), { status, updatedAt: serverTimestamp(), ...extra })
    const actionMap = { open: 'reopen_feedback', in_progress: 'assign_feedback', resolved: 'resolve_feedback', closed: 'close_feedback' }
    logAudit(session.schoolId, session.uid, session.name, actionMap[status] || 'update_feedback_status', 'feedback', feedbackId)
  }

  async function assignAdmin(feedbackId, adminUid) {
    await updateDoc(doc(db, 'feedbackCases', feedbackId), { assignedAdminUid: adminUid, updatedAt: serverTimestamp() })
    logAudit(session.schoolId, session.uid, session.name, 'assign_feedback', 'feedback', feedbackId)
  }

  return (
    <FeedbackContext.Provider value={{
      myCases, adminCases, activeCaseId, replies,
      openCase, createCase, addReply, escalateCase, changeStatus, assignAdmin,
    }}>
      {children}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}
