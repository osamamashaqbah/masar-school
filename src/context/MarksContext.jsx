import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const MarksContext = createContext(null)

export function MarksProvider({ children }) {
  const { session } = useSession()
  const [myMarks, setMyMarks] = useState([])
  const [allMarks, setAllMarks] = useState([])

  useEffect(() => {
    if (!session) { setMyMarks([]); return }
    if (session.role === 'student') {
      const q = query(collection(db, 'marks'), where('studentUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setMyMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
    setMyMarks([])
  }, [session])

  useEffect(() => {
    if (!session) { setAllMarks([]); return }

    if (session.role === 'owner') {
      const unsub = onSnapshot(collection(db, 'marks'), (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    if (session.role === 'instructor') {
      const q = query(collection(db, 'marks'), where('teacherUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const q = query(collection(db, 'marks'), where('studentUid', 'in', session.childUids.slice(0, 10)))
      const unsub = onSnapshot(q, (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    setAllMarks([])
  }, [session])

  // value نص حر مكتوب من المعلّم مباشرة، زي "18/20" أو "ممتاز"
  async function setMarkValue(subjectId, studentUid, categoryId, value) {
    const docId = `${studentUid}_${subjectId}_${categoryId}`
    await setDoc(doc(db, 'marks', docId), {
      subjectId,
      studentUid,
      categoryId,
      value,
      teacherUid: session.uid,
      updatedAt: Date.now(),
    })
  }

  function getMarksForStudentSubject(uid, subjectId) {
    const pool = session?.role === 'student' ? myMarks : allMarks
    return pool.filter((m) => m.studentUid === uid && m.subjectId === subjectId)
  }

  function getMarkValue(uid, subjectId, categoryId) {
    const marks = getMarksForStudentSubject(uid, subjectId)
    const found = marks.find((m) => m.categoryId === categoryId)
    return found ? found.value : null
  }

  return (
    <MarksContext.Provider value={{ setMarkValue, getMarksForStudentSubject, getMarkValue }}>
      {children}
    </MarksContext.Provider>
  )
}

export function useMarks() {
  const ctx = useContext(MarksContext)
  if (!ctx) throw new Error('useMarks must be used inside MarksProvider')
  return ctx
}