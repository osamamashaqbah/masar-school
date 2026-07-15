import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const ProgressContext = createContext(null)

export function ProgressProvider({ children }) {
  const { session } = useSession()
  const [progress, setProgress] = useState({})
  const [allProgress, setAllProgress] = useState([])

  useEffect(() => {
    if (!session) { setProgress({}); return }
    const q = query(collection(db, 'progress'), where('uid', '==', session.uid))
    const unsub = onSnapshot(q, (snapshot) => {
      const map = {}
      snapshot.docs.forEach((d) => { const data = d.data(); map[data.subjectId] = data.completedLessons })
      setProgress(map)
    })
    return () => unsub()
  }, [session])

  useEffect(() => {
    if (!session) { setAllProgress([]); return }

    if (session.role === 'instructor' || session.role === 'owner') {
      const unsub = onSnapshot(collection(db, 'progress'), (snapshot) => {
        setAllProgress(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const q = query(collection(db, 'progress'), where('uid', 'in', session.childUids.slice(0, 10)))
      const unsub = onSnapshot(q, (snapshot) => {
        setAllProgress(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    setAllProgress([])
  }, [session])

  async function completeLesson(subjectId, lessonIndex) {
    if (!session) return
    const current = progress[subjectId] || 0
    const updated = Math.max(current, lessonIndex + 1)
    const docId = `${session.uid}_${subjectId}`
    await setDoc(doc(db, 'progress', docId), { uid: session.uid, subjectId, completedLessons: updated })
  }

  function getStudentProgress(uid, subjectId) {
    const row = allProgress.find((p) => p.uid === uid && p.subjectId === subjectId)
    return row ? row.completedLessons : 0
  }

  return (
    <ProgressContext.Provider value={{ progress, completeLesson, getStudentProgress }}>
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgress() {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider')
  return ctx
}