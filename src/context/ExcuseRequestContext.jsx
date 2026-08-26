import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, doc, runTransaction, onSnapshot, query, where } from 'firebase/firestore'
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
    if (!session || session.role !== 'parent' || !currentAcademicYear) { setMyRequests([]); return }
    const q = query(collection(db, 'excuseRequests'), where('requestedByUid', '==', session.uid), where('academicYear', '==', currentAcademicYear))
    const unsub = onSnapshot(q, (s) => setMyRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session, currentAcademicYear])

  useEffect(() => {
    if (myTaughtSectionIds.length === 0 || !currentAcademicYear) { setSectionRequests([]); return }
    const q = query(collection(db, 'excuseRequests'), where('schoolId', '==', session.schoolId), where('instructorUids', 'array-contains', session.uid), where('academicYear', '==', currentAcademicYear))
    const unsub = onSnapshot(q, (s) => setSectionRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey, currentAcademicYear])

  async function submitRequest(studentUid, studentName, sectionId, date, reason) {
    const instructorUids = [...new Set(subjects
      .filter((subject) => subject.sectionId === sectionId && subject.teacherUid)
      .map((subject) => subject.teacherUid))]
    await addDoc(collection(db, 'excuseRequests'), {
      studentUid, studentName, sectionId, date, reason: reason.trim(),
      status: 'pending', requestedByUid: session.uid, schoolId: session.schoolId, academicYear: currentAcademicYear, instructorUids, createdAt: Date.now(),
    })
  }

  // موافقة الطلب بتسجّل الغياب "بعذر" تلقائيًا — يغني المعلّم عن تذكّره وقت أخذ الحضور
  async function decideRequest(request, status) {
    if (!['approved', 'rejected'].includes(status)) throw new Error('invalid-excuse-decision')

    const requestRef = doc(db, 'excuseRequests', request.id)
    const attendanceRef = doc(db, 'attendance', `${request.studentUid}_${request.date}`)
    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef)
      if (!requestSnap.exists() || requestSnap.data().status !== 'pending') throw new Error('excuse-request-not-pending')

      let attendanceSnap = null
      if (status === 'approved') attendanceSnap = await transaction.get(attendanceRef)

      transaction.update(requestRef, { status, decidedAt: Date.now(), decidedByUid: session.uid })
      if (status !== 'approved') return

      const requestData = requestSnap.data()
      const attendanceData = {
        studentUid: requestData.studentUid,
        sectionId: requestData.sectionId,
        date: requestData.date,
        excused: true,
        excuseRequestId: request.id,
        updatedByUid: session.uid,
        updatedAt: Date.now(),
      }
      if (attendanceSnap.exists()) {
        transaction.update(attendanceRef, attendanceData)
      } else {
        transaction.set(attendanceRef, {
          ...attendanceData,
          teacherUid: session.uid,
          schoolId: session.schoolId,
          academicYear: currentAcademicYear,
          createdAt: Date.now(),
        })
      }
    })
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
