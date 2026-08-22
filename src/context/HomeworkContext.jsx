import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, onSnapshot, doc, setDoc, updateDoc, arrayUnion, increment, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { computeProcrastinationPattern } from '../utils/procrastination'
import { chunkArray } from '../utils/chunk'
import { safeHttpUrl } from '../utils/parseMaterialUrl'

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
      const chunks = chunkArray(session.childUids)
      const rowsByChunk = chunks.map(() => [])
      const unsubs = chunks.map((chunk, index) => {
        const q = query(collection(db, 'submissions'), where('studentUid', 'in', chunk))
        return onSnapshot(q, (s) => {
          rowsByChunk[index] = s.docs.map((d) => d.data())
          setSubmissionsForPattern(rowsByChunk.flat())
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
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
        map[d.data().homeworkId] = { id: d.id, ...d.data() }
      })
      setSubmissions(map)
    })
    return () => unsubscribe()
  }, [session])

  function getHomeworkForCourse(courseId) {
    return homework.filter((h) => h.courseId === courseId && (!h.academicYear || h.academicYear === currentAcademicYear))
  }

  async function addHomework({ courseId, title, description, materialUrl, deadline, rubric }) {
    await addDoc(collection(db, 'homework'), {
      courseId,
      title,
      description,
      materialUrl: materialUrl || null,
      rubric: rubric || null,
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
    if (!safeHttpUrl(url)) throw new Error('رابط الإجابة غير صالح')
    const docId = `${session.uid}_${homeworkId}`
    await setDoc(doc(db, 'submissions', docId), {
      studentUid: session.uid,
      homeworkId,
      url,
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      submittedAt: serverTimestamp(),
      status: 'submitted',
      attemptCount: 1,
      teacherComment: null,
      gradedAt: null,
      timeline: [{ atMs: Date.now(), kind: 'submitted', by: 'student' }],
    })
  }

  // الطالب بيقدر يعيد التسليم بس لما المعلّم يرجّعها له صراحة (status == 'returned') —
  // مفروضة كمان على مستوى قواعد Firestore، هون تكرار دفاعي بالواجهة
  async function resubmitHomework(homeworkId, url) {
    if (!safeHttpUrl(url)) throw new Error('رابط الإجابة غير صالح')
    const docId = `${session.uid}_${homeworkId}`
    await updateDoc(doc(db, 'submissions', docId), {
      url,
      submittedAt: serverTimestamp(),
      status: 'resubmitted',
      attemptCount: increment(1),
      timeline: arrayUnion({ atMs: Date.now(), kind: 'resubmitted', by: 'student' }),
    })
  }

  // إجراء المعلّم: يرجّع الواجب للطالب مع ملاحظة بدل ما يصحّحه — بيفتح باب إعادة التسليم
  async function returnHomework(submissionId, comment) {
    await updateDoc(doc(db, 'submissions', submissionId), {
      status: 'returned',
      teacherComment: comment.trim(),
      timeline: arrayUnion({ atMs: Date.now(), kind: 'returned', by: 'instructor', note: comment.trim() }),
    })
  }

  // يُستدعى مع setMarkValue (MarksContext) بعد ما المعلّم يحفظ الدرجة — يقفل دورة الحالة
  async function markSubmissionGraded(submissionId) {
    await updateDoc(doc(db, 'submissions', submissionId), {
      status: 'graded',
      gradedAt: serverTimestamp(),
      timeline: arrayUnion({ atMs: Date.now(), kind: 'graded', by: 'instructor' }),
    })
  }

  // واجبات الطالب يلي إلها موعد نهائي قريب وما انسلّمت بعد — مرتبة الأقرب أول، مع مستوى إلحاح
  function getUpcomingDeadlines(subjectIds, studentUid = session?.uid) {
    const now = Date.now()
    const submittedIds = studentUid === session?.uid
      ? new Set(Object.keys(submissions))
      : new Set(submissionsForPattern.filter((submission) => submission.studentUid === studentUid).map((submission) => submission.homeworkId))
    return homework
      .filter((h) => subjectIds.includes(h.courseId) && (!h.academicYear || h.academicYear === currentAcademicYear))
      .filter((h) => !submittedIds.has(h.id))
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
    <HomeworkContext.Provider value={{
      homework, getHomeworkForCourse, addHomework, getSubmission, submitHomework,
      resubmitHomework, returnHomework, markSubmissionGraded,
      getProcrastinationPattern, getUpcomingDeadlines,
    }}>
      {children}
    </HomeworkContext.Provider>
  )
}

export function useHomework() {
  const ctx = useContext(HomeworkContext)
  if (!ctx) throw new Error('useHomework must be used inside HomeworkProvider')
  return ctx
}
