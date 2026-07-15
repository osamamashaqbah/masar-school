import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, onSnapshot, increment } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const QuizStatsContext = createContext(null)

export function QuizStatsProvider({ children }) {
  const { session } = useSession()
  const [allStats, setAllStats] = useState([])

  useEffect(() => {
    if (!session) { setAllStats([]); return }

    if (session.role === 'instructor' || session.role === 'owner') {
      const unsub = onSnapshot(collection(db, 'quizStats'), (snapshot) => {
        setAllStats(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const q = query(collection(db, 'quizStats'), where('uid', 'in', session.childUids.slice(0, 10)))
      const unsub = onSnapshot(q, (snapshot) => {
        setAllStats(snapshot.docs.map((d) => d.data()))
      })
      return () => unsub()
    }

    setAllStats([])
  }, [session])

  async function recordAttempt(subjectId, isCorrect) {
    if (!session) return
    const docId = `${session.uid}_${subjectId}`
    await setDoc(
      doc(db, 'quizStats', docId),
      { uid: session.uid, subjectId, attempts: increment(1), correct: increment(isCorrect ? 1 : 0) },
      { merge: true }
    )
  }

  function getCourseAggregateStats(subjectId) {
    const rows = allStats.filter((s) => s.subjectId === subjectId)
    return rows.reduce((acc, r) => ({ attempts: acc.attempts + r.attempts, correct: acc.correct + r.correct }), { attempts: 0, correct: 0 })
  }

  function getStudentStats(uid, subjectId) {
    const row = allStats.find((s) => s.uid === uid && s.subjectId === subjectId)
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