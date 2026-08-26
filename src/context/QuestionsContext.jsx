import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { chunkArray } from '../utils/chunk'

const QuestionsContext = createContext(null)

export function QuestionsProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear, subjects } = useSchoolStructure()
  const [myQuestions, setMyQuestions] = useState([])
  const [teacherQuestions, setTeacherQuestions] = useState([])

  useEffect(() => {
    if (!session || !currentAcademicYear) { setMyQuestions([]); setTeacherQuestions([]); return }
    if (session.role === 'student') {
      const q = query(collection(db, 'questions'), where('studentUid', '==', session.uid), where('academicYear', '==', currentAcademicYear))
      const unsub = onSnapshot(q, (s) => setMyQuestions(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
    if (session.role === 'instructor') {
      const subjectIds = subjects.filter((subject) => subject.teacherUid === session.uid).map((subject) => subject.id)
      if (subjectIds.length === 0) { setTeacherQuestions([]); return }
      const subjectChunks = chunkArray(subjectIds)
      const rowsByChunk = subjectChunks.map(() => [])
      const unsubs = subjectChunks.map((chunk, index) => {
        const q = query(collection(db, 'questions'), where('schoolId', '==', session.schoolId), where('subjectId', 'in', chunk), where('academicYear', '==', currentAcademicYear))
        return onSnapshot(q, (snap) => {
          rowsByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          setTeacherQuestions(rowsByChunk.flat())
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }
  }, [session, subjects, currentAcademicYear])

  async function askQuestion(subjectId, text) {
    await addDoc(collection(db, 'questions'), {
      subjectId,
      studentUid: session.uid,
      studentName: session.name,
      text,
      answer: null,
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      createdAt: serverTimestamp(),
    })
  }

  async function answerQuestion(questionId, answerText) {
    await updateDoc(doc(db, 'questions', questionId), { answer: answerText, answeredAt: serverTimestamp() })
  }

  function getQuestionsForSubject(subjectId) {
    return myQuestions.filter((q) => q.subjectId === subjectId && (!q.academicYear || q.academicYear === currentAcademicYear))
  }

  function getTeacherQuestionsForSubject(subjectId) {
    return teacherQuestions.filter((q) => q.subjectId === subjectId && (!q.academicYear || q.academicYear === currentAcademicYear))
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
