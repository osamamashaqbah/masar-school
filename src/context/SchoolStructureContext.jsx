import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const SchoolStructureContext = createContext(null)

export function SchoolStructureProvider({ children }) {
  const { session } = useSession()
  const [grades, setGrades] = useState([])
  const [sections, setSections] = useState([])
  const [allSubjects, setAllSubjects] = useState([])
  const [syncedPermissions, setSyncedPermissions] = useState(false)

  // المواد المؤرشفة (archived: true) بتنخبّى من كل مكان بالتطبيق تلقائيًا لأنه كل الصفحات
  // بتشتق قائمتها من "subjects" هون — بس بياناتها (درجات، حضور، تقدّم...) بتضل محفوظة بـ Firestore.
  const subjects = allSubjects.filter((s) => !s.archived)
  const archivedSubjects = allSubjects.filter((s) => s.archived)

  useEffect(() => {
    if (!session) return
    const unsub1 = onSnapshot(collection(db, 'grades'), (s) => setGrades(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub2 = onSnapshot(collection(db, 'sections'), (s) => setSections(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub3 = onSnapshot(collection(db, 'subjects'), (s) => setAllSubjects(s.docs.map((d) => ({ id: d.id, ...d.data(), lessons: d.data().lessons || [] }))))
    return () => { unsub1(); unsub2(); unsub3() }
  }, [session])

  // إصلاح ذاتي: بعض معلمي المواد القديمة (أو يلي انربطوا بمادة قبل ما نضيف حقل taughtSectionIds)
  // ممكن يوصلهم الحقل هذا ناقص، فبالتالي قواعد Firestore بتمنعهم يشوفوا طلاب شعبتهم (بدون أي خطأ ظاهر،
  // بس القائمة بتطلع فاضية). نعيد مزامنته تلقائيًا مرة وحدة كل ما صاحب المنصة يفتح لوحته، حتى ما يحتاج
  // أي إجراء يدوي ولا ننتظر إجراء تاني (متل تسجيل دخول الطالب) يصلحه بالصدفة.
  useEffect(() => {
    if (syncedPermissions || session?.role !== 'owner' || subjects.length === 0) return
    setSyncedPermissions(true)
    const pairs = new Map()
    subjects.forEach((s) => {
      if (s.teacherUid && s.sectionId) pairs.set(`${s.teacherUid}_${s.sectionId}`, { teacherUid: s.teacherUid, sectionId: s.sectionId })
    })
    Promise.all(
      [...pairs.values()].map(({ teacherUid, sectionId }) =>
        updateDoc(doc(db, 'users', teacherUid), { taughtSectionIds: arrayUnion(sectionId) }).catch(() => {})
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, session, syncedPermissions])

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
    // نسجّل الشعبة على وثيقة المعلّم حتى تقدر قواعد Firestore تتحقق إنو المعلّم فعلاً
    // مرتبط بهاي الشعبة قبل ما تسمحله يقرا/يكتب بيانات طلابها (marks/progress/users...)
    if (teacherUid) {
      await updateDoc(doc(db, 'users', teacherUid), { taughtSectionIds: arrayUnion(sectionId) })
    }
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

  // "حذف" مادة = أرشفة، مش حذف فعلي. بتختفي من كل الواجهات فورًا (لأنها بتطلع من قائمة subjects
  // النشطة) بس درجات/حضور/تقدّم الطلاب المرتبطة فيها بتضل محفوظة، وممكن ترجّعها أي وقت.
  async function archiveSubject(subjectId) {
    await updateDoc(doc(db, 'subjects', subjectId), { archived: true })
  }
  async function restoreSubject(subjectId) {
    await updateDoc(doc(db, 'subjects', subjectId), { archived: false })
  }

  return (
    <SchoolStructureContext.Provider
     value={{
        grades, sections, subjects, archivedSubjects,
        addGrade, addSection, addSubject,
        getSectionsForGrade, getSubjectsForSection,
        addLessonToSubject, updateSubjectLesson, updateSubjectCategories,
        archiveSubject, restoreSubject,
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