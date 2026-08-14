import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, doc, setDoc, updateDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'

const ExcuseRequestContext = createContext(null)

export function ExcuseRequestProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear, subjects } = useSchoolStructure()
  const [myRequests, setMyRequests] = useState([])
  const [sectionRequests, setSectionRequests] = useState([])

  const myTaughtSectionIds = session?.role === 'instructor'
    ? [...new Set(subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.sectionId))]
    : []
  const sectionIdsKey = myTaughtSectionIds.join(',')

  useEffect(() => {
    if (!session || session.role !== 'parent') { setMyRequests([]); return }
    const q = query(collection(db, 'excuseRequests'), where('requestedByUid', '==', session.uid))
    const unsub = onSnapshot(q, (s) => setMyRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  useEffect(() => {
    if (myTaughtSectionIds.length === 0) { setSectionRequests([]); return }
    const q = query(collection(db, 'excuseRequests'), where('schoolId', '==', session.schoolId), where('instructorUids', 'array-contains', session.uid))
    const unsub = onSnapshot(q, (s) => setSectionRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey])

  async function submitRequest(studentUid, studentName, sectionId, date, reason) {
    const instructorUids = [...new Set(subjects
      .filter((subject) => subject.sectionId === sectionId && subject.teacherUid)
      .map((subject) => subject.teacherUid))]
    await addDoc(collection(db, 'excuseRequests'), {
      studentUid, studentName, sectionId, date, reason: reason.trim(),
      status: 'pending', requestedByUid: session.uid, schoolId: session.schoolId, instructorUids, createdAt: Date.now(),
    })
  }

  // موافقة الطلب بتسجّل الغياب "بعذر" تلقائيًا — يغني المعلّم عن تذكّره وقت أخذ الحضور
  async function decideRequest(request, status) {
    await updateDoc(doc(db, 'excuseRequests', request.id), { status, decidedAt: Date.now(), decidedByUid: session.uid })
    if (status === 'approved') {
      const docId = `${request.studentUid}_${request.date}`
      await setDoc(doc(db, 'attendance', docId), {
        studentUid: request.studentUid, sectionId: request.sectionId, date: request.date, excused: true,
        teacherUid: session.uid, schoolId: session.schoolId, academicYear: currentAcademicYear, createdAt: Date.now(),
      })
    }
    try {
      await sendNotification(
        request.requestedByUid,
        status === 'approved' ? `تمت الموافقة على طلب العذر بتاريخ ${request.date}.` : `تم رفض طلب العذر بتاريخ ${request.date}.`,
        'attendance', session.schoolId
      )
    } catch { /* best-effort */ }
  }

  return (
    <ExcuseRequestContext.Provider value={{ myRequests, sectionRequests, submitRequest, decideRequest }}>
      {children}
    </ExcuseRequestContext.Provider>
  )
}

export function useExcuseRequests() {
  const ctx = useContext(ExcuseRequestContext)
  if (!ctx) throw new Error('useExcuseRequests must be used inside ExcuseRequestProvider')
  return ctx
}
