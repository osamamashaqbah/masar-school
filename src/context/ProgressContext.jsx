import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { chunkArray } from '../utils/chunk'

const ProgressContext = createContext(null)

export function ProgressProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear } = useSchoolStructure()
  const [progress, setProgress] = useState({})
  const [allProgress, setAllProgress] = useState([])

  useEffect(() => {
    if (!session) { setProgress({}); return }
    const q = query(collection(db, 'progress'), where('uid', '==', session.uid))
    const unsub = onSnapshot(q, (snapshot) => {
      const map = {}
      snapshot.docs.forEach((d) => {
        const data = d.data()
        if (!data.academicYear || data.academicYear === currentAcademicYear) map[data.subjectId] = data.completedLessons
      })
      setProgress(map)
    })
    return () => unsub()
  }, [session, currentAcademicYear])

  useEffect(() => {
    if (!session) { setAllProgress([]); return }

    if (session.role === 'instructor' || session.role === 'admin') {
      const q = query(collection(db, 'progress'), where('schoolId', '==', session.schoolId))
      const unsub = onSnapshot(q, (snapshot) => {
        setAllProgress(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const chunks = chunkArray(session.childUids)
      const rowsByChunk = chunks.map(() => [])
      const unsubs = chunks.map((chunk, index) => {
        const q = query(collection(db, 'progress'), where('uid', 'in', chunk))
        return onSnapshot(q, (snapshot) => {
          rowsByChunk[index] = snapshot.docs.map((d) => d.data())
          setAllProgress(rowsByChunk.flat())
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }

    setAllProgress([])
  }, [session])

  // docId يتضمّن السنة الدراسية — التقدّم "ما يرجع للخلف" حسب قواعد Firestore، فلازم كل سنة توثيقها لحالها
  async function completeLesson(subjectId, lessonIndex) {
    if (!session) return
    const current = progress[subjectId] || 0
    const updated = Math.max(current, lessonIndex + 1)
    const docId = `${session.uid}_${subjectId}_${currentAcademicYear}`
    await setDoc(doc(db, 'progress', docId), {
      uid: session.uid, subjectId, completedLessons: updated, schoolId: session.schoolId, academicYear: currentAcademicYear,
    })
  }

  function getStudentProgress(uid, subjectId) {
    const row = allProgress.find((p) => p.uid === uid && p.subjectId === subjectId
      && (!p.academicYear || p.academicYear === currentAcademicYear))
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
