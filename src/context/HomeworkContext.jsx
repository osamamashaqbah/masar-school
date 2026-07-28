import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, onSnapshot, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { computeProcrastinationPattern } from '../utils/procrastination'

const HomeworkContext = createContext(null)

export function HomeworkProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear } = useSchoolStructure()
  const [homework, setHomework] = useState([])
  const [submissions, setSubmissions] = useState({})
  const [submissionsForPattern, setSubmissionsForPattern] = useState([])

  // نسخة مسطّحة من التسليمات (لطالب لحاله، أو كل أبناء ولي الأمر) — لحساب نمط التسويف بس
  useEffect(() => {
    if (!session) { setSubmissionsForPattern([]); return }
    if (session.role === 'student') {
      const q = query(collection(db, 'submissions'), where('studentUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setSubmissionsForPattern(s.docs.map((d) => d.data())))
      return () => unsub()
    }
    if (session.role === 'parent' && session.childUids?.length > 0) {
      const q = query(collection(db, 'submissions'), where('studentUid', 'in', session.childUids.slice(0, 10)))
      const unsub = onSnapshot(q, (s) => setSubmissionsForPattern(s.docs.map((d) => d.data())))
      return () => unsub()
    }
    setSubmissionsForPattern([])
  }, [session])

  useEffect(() => {
    if (!session) {
      setHomework([])
      return
    }
    const q = query(collection(db, 'homework'), where('schoolId', '==', session.schoolId))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHomework(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  useEffect(() => {
    if (!session) {
      setSubmissions({})
      return
    }
    const q = query(collection(db, 'submissions'), where('studentUid', '==', session.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map = {}
      snapshot.docs.forEach((d) => {
        const data = d.data()
        map[data.homeworkId] = { url: data.url, submittedAt: data.submittedAt }
      })
      setSubmissions(map)
    })
    return () => unsubscribe()
  }, [session])

  function getHomeworkForCourse(courseId) {
    return homework.filter((h) => h.courseId === courseId && (!h.academicYear || h.academicYear === currentAcademicYear))
  }

  async function addHomework({ courseId, title, description, materialUrl, deadline }) {
    await addDoc(collection(db, 'homework'), {
      courseId,
      title,
      description,
      materialUrl: materialUrl || null,
      deadline: new Date(deadline),
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      createdAt: serverTimestamp(),
    })
  }

  function getSubmission(homeworkId) {
    return submissions[homeworkId] || null
  }

  async function submitHomework(homeworkId, url) {
    const docId = `${session.uid}_${homeworkId}`
    await setDoc(doc(db, 'submissions', docId), {
      studentUid: session.uid,
      homeworkId,
      url,
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      submittedAt: serverTimestamp(),
    })
  }

  // واجبات الطالب يلي إلها موعد نهائي قريب وما انسلّمت بعد — مرتبة الأقرب أول، مع مستوى إلحاح
  function getUpcomingDeadlines(subjectIds) {
    const now = Date.now()
    return homework
      .filter((h) => subjectIds.includes(h.courseId) && (!h.academicYear || h.academicYear === currentAcademicYear))
      .filter((h) => !getSubmission(h.id))
      .map((h) => {
        const deadlineMs = h.deadline?.toMillis?.() ?? new Date(h.deadline).getTime()
        const hoursLeft = (deadlineMs - now) / 3600000
        return { ...h, deadlineMs, hoursLeft, urgency: hoursLeft < 24 ? 'urgent' : hoursLeft < 72 ? 'soon' : 'normal' }
      })
      .filter((h) => h.hoursLeft > -24) // نتركها يوم إضافي بعد الموعد كتذكير "فات الوقت"، بعدها تختفي
      .sort((a, b) => a.deadlineMs - b.deadlineMs)
  }

  function getProcrastinationPattern(uid) {
    const pairs = submissionsForPattern
      .filter((s) => s.studentUid === uid)
      .map((s) => {
        const hw = homework.find((h) => h.id === s.homeworkId)
        return { deadline: hw?.deadline?.toMillis?.(), submittedAt: s.submittedAt?.toMillis?.() }
      })
    return computeProcrastinationPattern(pairs)
  }

  return (
    <HomeworkContext.Provider value={{ homework, getHomeworkForCourse, addHomework, getSubmission, submitHomework, getProcrastinationPattern, getUpcomingDeadlines }}>
      {children}
    </HomeworkContext.Provider>
  )
}

export function useHomework() {
  const ctx = useContext(HomeworkContext)
  if (!ctx) throw new Error('useHomework must be used inside HomeworkProvider')
  return ctx
}