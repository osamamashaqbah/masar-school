import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const SchoolStructureContext = createContext(null)

export function SchoolStructureProvider({ children }) {
  const { session } = useSession()
  const [grades, setGrades] = useState([])
  const [sections, setSections] = useState([])
  const [subjects, setSubjects] = useState([])

  useEffect(() => {
    if (!session) return
    const unsub1 = onSnapshot(collection(db, 'grades'), (s) => setGrades(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub2 = onSnapshot(collection(db, 'sections'), (s) => setSections(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub3 = onSnapshot(collection(db, 'subjects'), (s) => setSubjects(s.docs.map((d) => ({ id: d.id, ...d.data(), lessons: d.data().lessons || [] }))))
    return () => { unsub1(); unsub2(); unsub3() }
  }, [session])

  async function addGrade(name) {
    await addDoc(collection(db, 'grades'), { name })
  }

  async function addSection(gradeId, name) {
    await addDoc(collection(db, 'sections'), { gradeId, name })
  }

  async function addSubject({ sectionId, name, teacherUid, teacherName }) {
    await addDoc(collection(db, 'subjects'), {
      sectionId, name, teacherUid: teacherUid || null, teacherName, lessons: [],
      gradeCategories: [
        { id: 'quiz', label: 'اختبارات الدروس', weight: 10, auto: true },
        { id: 'homework', label: 'الواجبات', weight: 10, auto: true },
        { id: 'exam1', label: 'الاختبار الأول', weight: 15, auto: false },
        { id: 'exam2', label: 'الاختبار الثاني', weight: 15, auto: false },
        { id: 'continuous', label: 'التقويم المستمر', weight: 10, auto: false },
        { id: 'final', label: 'الاختبار النهائي', weight: 40, auto: false },
      ],
    })
  }

  function getSectionsForGrade(gradeId) {
    return sections.filter((s) => s.gradeId === gradeId)
  }

  function getSubjectsForSection(sectionId) {
    return subjects.filter((s) => s.sectionId === sectionId)
  }

  async function addLessonToSubject(subjectId, lesson) {
    await updateDoc(doc(db, 'subjects', subjectId), { lessons: arrayUnion(lesson) })
  }
  async function updateSubjectCategories(subjectId, categories) {
    await updateDoc(doc(db, 'subjects', subjectId), { gradeCategories: categories })
  }

  async function updateSubjectLesson(subjectId, lessonIndex, updates) {
    const subject = subjects.find((s) => s.id === subjectId)
    if (!subject) return
    const newLessons = subject.lessons.map((l, i) => (i === lessonIndex ? { ...l, ...updates } : l))
    await updateDoc(doc(db, 'subjects', subjectId), { lessons: newLessons })
  }

  return (
    <SchoolStructureContext.Provider
     value={{
        grades, sections, subjects,
        addGrade, addSection, addSubject,
        getSectionsForGrade, getSubjectsForSection,
        addLessonToSubject, updateSubjectLesson, updateSubjectCategories,
      }}
    >
      {children}
    </SchoolStructureContext.Provider>
  )
}

export function useSchoolStructure() {
  const ctx = useContext(SchoolStructureContext)
  if (!ctx) throw new Error('useSchoolStructure must be used inside SchoolStructureProvider')
  return ctx
}