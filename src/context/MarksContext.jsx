import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { sendNotification } from '../utils/notify'
import { categoriesFor } from '../utils/gradeCategories'

const MarksContext = createContext(null)

export function MarksProvider({ children }) {
  const { session } = useSession()
  const [myMarks, setMyMarks] = useState([])
  const [allMarks, setAllMarks] = useState([])

  useEffect(() => {
    if (!session) { setMyMarks([]); return }
    if (session.role === 'student') {
      const q = query(collection(db, 'marks'), where('studentUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setMyMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
    setMyMarks([])
  }, [session])

  useEffect(() => {
    if (!session) { setAllMarks([]); return }

    if (session.role === 'owner') {
      const unsub = onSnapshot(collection(db, 'marks'), (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    if (session.role === 'instructor') {
      const q = query(collection(db, 'marks'), where('teacherUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    if (session.role === 'parent' && session.childUids?.length > 0) {
      const q = query(collection(db, 'marks'), where('studentUid', 'in', session.childUids.slice(0, 10)))
      const unsub = onSnapshot(q, (s) => setAllMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }

    setAllMarks([])
  }, [session])

  // score و maxScore أرقام. homeworkId اختياري (بينحط تلقائي لما العلامة جايه من تقييم واجب)
  // docId ثابت (studentUid_subjectId_categoryId) عشان ما تنعمل نسخ مكررة لما يعدّل المعلّم نفس الدرجة
  async function setMarkValue(subjectId, studentUid, categoryId, score, maxScore, homeworkId = null) {
    const docId = `${studentUid}_${subjectId}_${categoryId}`
    await setDoc(doc(db, 'marks', docId), {
      subjectId,
      studentUid,
      categoryId,
      score: Number(score),
      maxScore: Number(maxScore),
      homeworkId: homeworkId || null,
      source: homeworkId ? 'homework' : 'manual',
      teacherUid: session.uid,
      updatedAt: Date.now(),
    })

    // إشعار الطالب وأهله بالعلامة الجديدة — أفضل جهد، ما لازم يوقف حفظ العلامة لو فشل لأي سبب.
    try {
      const [studentSnap, subjectSnap] = await Promise.all([
        getDoc(doc(db, 'users', studentUid)),
        getDoc(doc(db, 'subjects', subjectId)),
      ])
      if (studentSnap.exists() && subjectSnap.exists()) {
        const student = studentSnap.data()
        const subject = { id: subjectId, ...subjectSnap.data() }
        const category = categoriesFor(subject).find((c) => c.id === categoryId)
        const label = category?.label || 'درجة'
        const scoreText = `${Number(score)}/${Number(maxScore)}`
        await sendNotification(studentUid, `انحطّت لك علامة جديدة بمادة ${subject.name} (${label}): ${scoreText}.`, 'grade')
        for (const parentUid of student.parentUids || []) {
          await sendNotification(parentUid, `حصل/ت ${student.name} على ${scoreText} بمادة ${subject.name} (${label}).`, 'grade')
        }
      }
    } catch {
      // ما منوقف عملية حفظ العلامة بسبب فشل الإشعار
    }
  }

  function getMarksForStudentSubject(uid, subjectId) {
    const pool = session?.role === 'student' ? myMarks : allMarks
    return pool.filter((m) => m.studentUid === uid && m.subjectId === subjectId)
  }

  // بيرجع {score, maxScore} أو null إذا ما انحطت علامة بعد (أو إذا كانت بيانات قديمة ناقصة)
  function getMark(uid, subjectId, categoryId) {
    const marks = getMarksForStudentSubject(uid, subjectId)
    const found = marks.find((m) => m.categoryId === categoryId)
    if (!found || typeof found.score !== 'number' || typeof found.maxScore !== 'number') return null
    return { score: found.score, maxScore: found.maxScore }
  }

  // نص جاهز للعرض متل "37/50"
  function formatMark(mark) {
    if (!mark) return null
    return `${mark.score}/${mark.maxScore}`
  }

  return (
    <MarksContext.Provider
      value={{ setMarkValue, getMarksForStudentSubject, getMark, formatMark }}
    >
      {children}
    </MarksContext.Provider>
  )
}

export function useMarks() {
  const ctx = useContext(MarksContext)
  if (!ctx) throw new Error('useMarks must be used inside MarksProvider')
  return ctx
}