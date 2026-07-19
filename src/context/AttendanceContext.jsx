import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { sendNotification } from '../utils/notify'

const AttendanceContext = createContext(null)

export function AttendanceProvider({ children }) {
  const { session } = useSession()
  const [myAbsences, setMyAbsences] = useState([])
  const [childrenAbsences, setChildrenAbsences] = useState([])

  useEffect(() => {
    if (!session || session.role !== 'student') { setMyAbsences([]); return }
    const q = query(collection(db, 'attendance'), where('studentUid', '==', session.uid))
    const unsub = onSnapshot(q, (s) => setMyAbsences(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'parent' || !session.childUids?.length) { setChildrenAbsences([]); return }
    const q = query(collection(db, 'attendance'), where('studentUid', 'in', session.childUids.slice(0, 10)))
    const unsub = onSnapshot(q, (s) => setChildrenAbsences(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  // بيرجع مصفوفة uid تبع الطلاب الغايبين بهاي الشعبة بهاد التاريخ
  async function getAttendanceForDate(sectionId, date) {
    const q = query(
      collection(db, 'attendance'),
      where('teacherUid', '==', session.uid),
      where('date', '==', date),
      where('sectionId', '==', sectionId)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data().studentUid)
  }

  async function setAbsent(studentUid, sectionId, date) {
    const docId = `${studentUid}_${date}`
    await setDoc(doc(db, 'attendance', docId), {
      studentUid,
      sectionId,
      date,
      teacherUid: session.uid,
      createdAt: Date.now(),
    })

    // إشعار الطالب وأهله بالغياب — أفضل جهد، ما لازم يوقف حفظ الحضور لو فشل لأي سبب.
    try {
      const studentSnap = await getDoc(doc(db, 'users', studentUid))
      if (studentSnap.exists()) {
        const student = studentSnap.data()
        await sendNotification(studentUid, `تسجّل غياب عليك بتاريخ ${date}.`, 'attendance')
        for (const parentUid of student.parentUids || []) {
          await sendNotification(parentUid, `غاب/ت ${student.name} بتاريخ ${date}.`, 'attendance')
        }
      }
    } catch {
      // ما منوقف عملية تسجيل الحضور بسبب فشل الإشعار
    }
  }

  async function setPresent(studentUid, date) {
    const docId = `${studentUid}_${date}`
    await deleteDoc(doc(db, 'attendance', docId))
  }

  function getAbsenceDatesFor(uid) {
    const pool = session?.role === 'student' ? myAbsences : childrenAbsences
    return pool.filter((a) => a.studentUid === uid).map((a) => a.date).sort().reverse()
  }

  return (
    <AttendanceContext.Provider value={{ getAttendanceForDate, setAbsent, setPresent, getAbsenceDatesFor }}>
      {children}
    </AttendanceContext.Provider>
  )
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext)
  if (!ctx) throw new Error('useAttendance must be used inside AttendanceProvider')
  return ctx
}