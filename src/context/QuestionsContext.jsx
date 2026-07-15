import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const QuestionsContext = createContext(null)

export function QuestionsProvider({ children }) {
  const { session } = useSession()
  const [myQuestions, setMyQuestions] = useState([])
  const [teacherQuestions, setTeacherQuestions] = useState([])

  useEffect(() => {
    if (!session) return
    if (session.role === 'student') {
      const q = query(collection(db, 'questions'), where('studentUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setMyQuestions(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
    if (session.role === 'instructor') {
      const unsub = onSnapshot(collection(db, 'questions'), (s) => setTeacherQuestions(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
  }, [session])

  async function askQuestion(subjectId, text) {
    await addDoc(collection(db, 'questions'), {
      subjectId,
      studentUid: session.uid,
      studentName: session.name,
      text,
      answer: null,
      createdAt: serverTimestamp(),
    })
  }

  async function answerQuestion(questionId, answerText) {
    await updateDoc(doc(db, 'questions', questionId), { answer: answerText, answeredAt: serverTimestamp() })
  }

  function getQuestionsForSubject(subjectId) {
    return myQuestions.filter((q) => q.subjectId === subjectId)
  }

  function getTeacherQuestionsForSubject(subjectId) {
    return teacherQuestions.filter((q) => q.subjectId === subjectId)
  }

  return (
    <QuestionsContext.Provider value={{ askQuestion, answerQuestion, getQuestionsForSubject, getTeacherQuestionsForSubject, teacherQuestions }}>
      {children}
    </QuestionsContext.Provider>
  )
}

export function useQuestions() {
  const ctx = useContext(QuestionsContext)
  if (!ctx) throw new Error('useQuestions must be used inside QuestionsProvider')
  return ctx
}