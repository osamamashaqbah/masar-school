import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, increment, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { chunkArray } from '../utils/chunk'

const QuestionBankContext = createContext(null)

export const DIFFICULTIES = [
  { id: 'easy', label: 'سهل' },
  { id: 'medium', label: 'متوسط' },
  { id: 'hard', label: 'صعب' },
]

export function QuestionBankProvider({ children }) {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const [questions, setQuestions] = useState([])

  // بنك الأسئلة كله للمدرسة — للإدارة والمعلمين بس (القواعد بتمنع الطلاب). عدد معقول لمدرسة
  // وحدة (مئات لآلاف بحد أقصى)، فـ listener وحدة مقبولة هون بدون حاجة لـ pagination الآن
  useEffect(() => {
    if (!session || (session.role !== 'admin' && session.role !== 'instructor')) { setQuestions([]); return }
    const subjectIds = session.role === 'instructor'
      ? subjects.filter((subject) => subject.teacherUid === session.uid).map((subject) => subject.id)
      : null
    if (subjectIds && subjectIds.length === 0) { setQuestions([]); return }

    const chunks = subjectIds ? chunkArray(subjectIds) : [null]
    const rowsByChunk = chunks.map(() => [])
    const handleError = (err) => {
      console.error('[بنك الأسئلة] فشل التحميل:', err)
      setQuestions([])
    }
    const unsubs = chunks.map((chunk, index) => {
      const filters = [where('schoolId', '==', session.schoolId)]
      if (chunk) filters.push(where('subjectId', 'in', chunk))
      return onSnapshot(query(collection(db, 'questionBank'), ...filters), (snap) => {
        rowsByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setQuestions(rowsByChunk.flat())
      }, handleError)
    })
    return () => unsubs.forEach((unsub) => unsub())
  }, [session, subjects])

  async function addQuestion({ subjectId, subjectName, questionText, options, correctIndex, difficulty, tags }) {
    const ref = await addDoc(collection(db, 'questionBank'), {
      schoolId: session.schoolId, subjectId, subjectName,
      questionText: questionText.trim(), options: options.map((o) => o.trim()), correctIndex,
      difficulty: difficulty || 'medium', tags: tags || [],
      timesUsed: 0, timesCorrect: 0,
      createdByUid: session.uid, createdByName: session.name, createdAt: serverTimestamp(),
    })
    return ref.id
  }

  async function duplicateQuestion(question) {
    return addQuestion({
      subjectId: question.subjectId, subjectName: question.subjectName,
      questionText: `${question.questionText} (نسخة)`, options: question.options,
      correctIndex: question.correctIndex, difficulty: question.difficulty, tags: question.tags,
    })
  }

  async function updateQuestion(questionId, updates) {
    await updateDoc(doc(db, 'questionBank', questionId), updates)
  }

  async function deleteQuestion(questionId) {
    await deleteDoc(doc(db, 'questionBank', questionId))
  }

  // بيستدعيها QuizPage لما تجاوب على سؤال أصله من البنك (bankQuestionId محطوط على نسخة السؤال
  // جوا quiz الدرس) — إحصائية "نسبة الإجابة الصحيحة" لتحليل جودة الاختبار
  async function recordUsage(questionId, isCorrect) {
    try {
      await updateDoc(doc(db, 'questionBank', questionId), {
        timesUsed: increment(1), timesCorrect: increment(isCorrect ? 1 : 0),
      })
    } catch (err) {
      console.error('[بنك الأسئلة] فشل تسجيل الاستخدام:', err)
    }
  }

  function questionsForSubject(subjectId) {
    return questions.filter((q) => q.subjectId === subjectId)
  }

  // اختيار عشوائي من أسئلة مطابقة (مادة + صعوبة اختياريًا) — بدون تكرار، للاستخدام ببناء اختبار
  function pickRandom(subjectId, difficulty, count) {
    const pool = questions.filter((q) => q.subjectId === subjectId && (!difficulty || q.difficulty === difficulty))
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  return (
    <QuestionBankContext.Provider value={{
      questions, addQuestion, duplicateQuestion, updateQuestion, deleteQuestion,
      recordUsage, questionsForSubject, pickRandom,
    }}>
      {children}
    </QuestionBankContext.Provider>
  )
}

export function useQuestionBank() {
  const ctx = useContext(QuestionBankContext)
  if (!ctx) throw new Error('useQuestionBank must be used inside QuestionBankProvider')
  return ctx
}
