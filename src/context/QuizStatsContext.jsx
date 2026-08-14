import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, onSnapshot, increment } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { chunkArray } from '../utils/chunk'

const QuizStatsContext = createContext(null)

export function QuizStatsProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear, subjects } = useSchoolStructure()
  const [allStats, setAllStats] = useState([])

  useEffect(() => {
    if (!session) { setAllStats([]); return }

    if (session.role === 'admin') {
      const q = query(collection(db, 'quizStats'), where('schoolId', '==', session.schoolId))
      const unsub = onSnapshot(q, (snapshot) => {
        setAllStats(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    if (session.role === 'instructor') {
      const subjectIds = subjects.filter((subject) => subject.teacherUid === session.uid).map((subject) => subject.id)
      if (subjectIds.length === 0) { setAllStats([]); return }
      const subjectChunks = chunkArray(subjectIds)
      const rowsByChunk = subjectChunks.map(() => [])
      const unsubs = subjectChunks.map((chunk, index) => {
        const q = query(collection(db, 'quizStats'), where('schoolId', '==', session.schoolId), where('subjectId', 'in', chunk))
        return onSnapshot(q, (snapshot) => {
          rowsByChunk[index] = snapshot.docs.map((d) => d.data())
          setAllStats(rowsByChunk.flat())
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const chunks = chunkArray(session.childUids)
      const rowsByChunk = chunks.map(() => [])
      const unsubs = chunks.map((chunk, index) => {
        const q = query(collection(db, 'quizStats'), where('uid', 'in', chunk))
        return onSnapshot(q, (snapshot) => {
          rowsByChunk[index] = snapshot.docs.map((d) => d.data())
          setAllStats(rowsByChunk.flat())
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }

    setAllStats([])
  }, [session, subjects])

  // docId يتضمّن السنة الدراسية — وإلا الـ increment كان رح يضل يتراكم عبر السنين على نفس الوثيقة للأبد
  async function recordAttempt(subjectId, isCorrect) {
    if (!session) return
    const docId = `${session.uid}_${subjectId}_${currentAcademicYear}`
    await setDoc(
      doc(db, 'quizStats', docId),
      { uid: session.uid, subjectId, schoolId: session.schoolId, academicYear: currentAcademicYear, attempts: increment(1), correct: increment(isCorrect ? 1 : 0) },
      { merge: true }
    )
  }

  function getCourseAggregateStats(subjectId) {
    const rows = allStats.filter((s) => s.subjectId === subjectId && (!s.academicYear || s.academicYear === currentAcademicYear))
    return rows.reduce((acc, r) => ({ attempts: acc.attempts + r.attempts, correct: acc.correct + r.correct }), { attempts: 0, correct: 0 })
  }

  function getStudentStats(uid, subjectId) {
    const row = allStats.find((s) => s.uid === uid && s.subjectId === subjectId && (!s.academicYear || s.academicYear === currentAcademicYear))
    return row || { attempts: 0, correct: 0 }
  }

  return (
    <QuizStatsContext.Provider value={{ recordAttempt, getCourseAggregateStats, getStudentStats }}>
      {children}
    </QuizStatsContext.Provider>
  )
}

export function useQuizStats() {
  const ctx = useContext(QuizStatsContext)
  if (!ctx) throw new Error('useQuizStats must be used inside QuizStatsProvider')
  return ctx
}
