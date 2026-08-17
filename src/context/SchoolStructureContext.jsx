import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot, arrayUnion, query, where, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { logAudit } from '../utils/audit'
import { rolloverSectionDocId } from '../utils/rollover'

const SchoolStructureContext = createContext(null)

export function SchoolStructureProvider({ children }) {
  const { session } = useSession()
  const [grades, setGrades] = useState([])
  const [sections, setSections] = useState([])
  const [allSubjects, setAllSubjects] = useState([])
  const [subjectsLoaded, setSubjectsLoaded] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [schoolName, setSchoolName] = useState('')
  const [currentAcademicYear, setCurrentAcademicYear] = useState(null)
  const [features, setFeatures] = useState({})
  const [ramadanSchedule, setRamadanSchedule] = useState({ enabled: false, shortDayHours: null })
  const [currency, setCurrency] = useState('JOD')
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [branding, setBranding] = useState(null)
  const [syncedPermissions, setSyncedPermissions] = useState(false)
  const [syncedParentLinks, setSyncedParentLinks] = useState(false)

  // المواد المؤرشفة (archived: true) بتنخبّى من كل مكان بالتطبيق تلقائيًا لأنه كل الصفحات
  // بتشتق قائمتها من "subjects" هون — بس بياناتها (درجات، حضور، تقدّم...) بتضل محفوظة بـ Firestore.
  const subjects = allSubjects.filter((s) => !s.archived)
  const archivedSubjects = allSubjects.filter((s) => s.archived)

  useEffect(() => {
    if (!session) { setAllSubjects([]); setSubjectsLoaded(false); return }
    setAllSubjects([])
    setSubjectsLoaded(false)
    const unsub1 = onSnapshot(query(collection(db, 'grades'), where('schoolId', '==', session.schoolId)), (s) => setGrades(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub2 = onSnapshot(query(collection(db, 'sections'), where('schoolId', '==', session.schoolId)), (s) => setSections(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    const unsub3 = onSnapshot(query(collection(db, 'subjects'), where('schoolId', '==', session.schoolId)), (s) => {
      setAllSubjects(s.docs.map((d) => ({ id: d.id, ...d.data(), lessons: d.data().lessons || [] })))
      setSubjectsLoaded(true)
    }, () => setSubjectsLoaded(true))
    return () => { unsub1(); unsub2(); unsub3() }
  }, [session])

  // اسم المدرسة + السنة الدراسية الحالية — لازم onSnapshot (مش قراءة وحدة) لأنه إجراء الترفيع
  // السنوي بيغيّر currentAcademicYear لحظيًا، وكل تبويب مفتوح لازم يتفاعل معه فورًا
  useEffect(() => {
    if (!session) {
      setSchoolName(''); setCurrentAcademicYear(null); setFeatures({})
      setRamadanSchedule({ enabled: false, shortDayHours: null }); setCurrency('JOD')
      return
    }
    const unsub = onSnapshot(doc(db, 'schools', session.schoolId), (snap) => {
      setSchoolName(snap.data()?.name || '')
      setCurrentAcademicYear(snap.data()?.currentAcademicYear || null)
      setFeatures(snap.data()?.features || {})
      setRamadanSchedule(snap.data()?.ramadanSchedule || { enabled: false, shortDayHours: null })
      setCurrency(snap.data()?.currency || 'JOD')
      setPaymentInfo(snap.data()?.paymentInfo || null)
      setBranding(snap.data()?.branding || null)
    })
    return () => unsub()
  }, [session])

  // بيانات كل المستخدمين — بس لإدارة المدرسة، مطلوبة للإصلاح الذاتي تحت (ربط أولياء الأمور بأبنائهم)
  useEffect(() => {
    if (session?.role !== 'admin') { setAllUsers([]); return }
    const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId))
    const unsub = onSnapshot(q, (s) => setAllUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  // إصلاح ذاتي: بعض معلمي المواد القديمة (أو يلي انربطوا بمادة قبل ما نضيف حقل taughtSectionIds)
  // ممكن يوصلهم الحقل هذا ناقص، فبالتالي قواعد Firestore بتمنعهم يشوفوا طلاب شعبتهم (بدون أي خطأ ظاهر،
  // بس القائمة بتطلع فاضية). نعيد مزامنته تلقائيًا مرة وحدة كل ما صاحب المنصة يفتح لوحته، حتى ما يحتاج
  // أي إجراء يدوي ولا ننتظر إجراء تاني (متل تسجيل دخول الطالب) يصلحه بالصدفة.
  useEffect(() => {
    if (syncedPermissions || session?.role !== 'admin' || subjects.length === 0) return
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

  // إصلاح ذاتي: حسابات أولياء الأمور يلي انربطت بأبنائها (childUids) قبل ما نضيف الربط العكسي
  // (parentUids على وثيقة الطالب، وهو يلي الإشعارات معتمدة عليه لتوصيل تنبيهات العلامات/الغياب
  // لولي الأمر). هاد كان معلّق بصفحة إدارة المستخدمين بس، فما كان ينفّذ إلا لو صاحب المنصة يفتحها
  // بالذات — نقلناه هون حتى ينفّذ تلقائيًا بأول صفحة يفتحها صاحب المنصة، أي صفحة كانت.
  useEffect(() => {
    if (syncedParentLinks || session?.role !== 'admin' || allUsers.length === 0) return
    setSyncedParentLinks(true)
    const parents = allUsers.filter((u) => u.role === 'parent' && u.childUids?.length > 0)
    Promise.all(
      parents.flatMap((p) =>
        p.childUids.map((childUid) => {
          const child = allUsers.find((u) => u.id === childUid)
          if (child?.parentUids?.includes(p.id)) return Promise.resolve()
          return updateDoc(doc(db, 'users', childUid), { parentUids: arrayUnion(p.id) }).catch(() => {})
        })
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, session, syncedParentLinks])

  async function addGrade(name) {
    const ref = await addDoc(collection(db, 'grades'), { name, schoolId: session.schoolId })
    return ref.id
  }

  async function addSection(gradeId, name, { idempotencyKey } = {}) {
    const data = { gradeId, name, schoolId: session.schoolId }
    if (!idempotencyKey) {
      const ref = await addDoc(collection(db, 'sections'), data)
      return ref.id
    }

    // A rollover can fail after creating its target sections. Reusing a deterministic
    // document makes a retry resume the same operation instead of creating duplicates.
    const sectionRef = doc(db, 'sections', rolloverSectionDocId(idempotencyKey))
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(sectionRef)
      if (snap.exists()) {
        const existing = snap.data()
        if (existing.schoolId !== session.schoolId || existing.gradeId !== gradeId || existing.name !== name || existing.rolloverKey !== idempotencyKey) {
          throw new Error('rollover-section-conflict')
        }
        return
      }
      transaction.set(sectionRef, { ...data, rolloverKey: idempotencyKey })
    })
    return sectionRef.id
  }

  async function addSubject({ sectionId, name, teacherUid, teacherName }) {
    await addDoc(collection(db, 'subjects'), {
      sectionId, name, teacherUid: teacherUid || null, teacherName, lessons: [],
      schoolId: session.schoolId, academicYear: currentAcademicYear,
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
    logAudit(session.schoolId, session.uid, session.name, 'archive_subject', 'subject', subjectId)
  }
  async function restoreSubject(subjectId) {
    await updateDoc(doc(db, 'subjects', subjectId), { archived: false })
    logAudit(session.schoolId, session.uid, session.name, 'restore_subject', 'subject', subjectId)
  }

  // فيتشر فلاغز — تفعيل/تعطيل ميزات بمدرسة معيّنة بدون أي كود إضافي (بديل عن فرع git لكل مدرسة)
  async function setFeature(key, enabled) {
    await updateDoc(doc(db, 'schools', session.schoolId), { [`features.${key}`]: enabled })
    logAudit(session.schoolId, session.uid, session.name, 'set_feature', 'school', session.schoolId, `${key}=${enabled}`)
  }

  // جاهزية الخليج — دوام رمضان المختصر (تفعيل + عدد ساعات)، والعملة (تحضيرًا للفوترة لاحقًا)
  async function updateRamadanSchedule(enabled, shortDayHours) {
    await updateDoc(doc(db, 'schools', session.schoolId), { ramadanSchedule: { enabled, shortDayHours: shortDayHours || null } })
    logAudit(session.schoolId, session.uid, session.name, 'set_ramadan_schedule', 'school', session.schoolId, `enabled=${enabled}, hours=${shortDayHours}`)
  }
  async function updateCurrency(code) {
    await updateDoc(doc(db, 'schools', session.schoolId), { currency: code })
    logAudit(session.schoolId, session.uid, session.name, 'set_currency', 'school', session.schoolId, code)
  }
  async function updatePaymentInfo(info) {
    await updateDoc(doc(db, 'schools', session.schoolId), { paymentInfo: info })
    logAudit(session.schoolId, session.uid, session.name, 'set_payment_info', 'school', session.schoolId, JSON.stringify(info))
  }
  async function updateBranding(info) {
    await updateDoc(doc(db, 'schools', session.schoolId), { branding: info })
    logAudit(session.schoolId, session.uid, session.name, 'set_branding', 'school', session.schoolId, JSON.stringify(info))
  }

  return (
    <SchoolStructureContext.Provider
     value={{
        grades, sections, subjects, subjectsLoaded, archivedSubjects, allUsers, schoolName, currentAcademicYear, features,
        ramadanSchedule, currency, paymentInfo, branding,
        addGrade, addSection, addSubject,
        getSectionsForGrade, getSubjectsForSection,
        addLessonToSubject, updateSubjectLesson, updateSubjectCategories,
        archiveSubject, restoreSubject, setFeature, updateRamadanSchedule, updateCurrency, updatePaymentInfo, updateBranding,
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
