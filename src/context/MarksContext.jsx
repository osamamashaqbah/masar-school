import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'
import { logAudit } from '../utils/audit'
import { categoriesFor, markDocId, aggregateMark } from '../utils/gradeCategories'

const MarksContext = createContext(null)

export function MarksProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear } = useSchoolStructure()
  const [myMarks, setMyMarks] = useState([])
  const [allMarks, setAllMarks] = useState([])
  const [allMarksError, setAllMarksError] = useState(null)

  useEffect(() => {
    if (!session) { setMyMarks([]); return }
    if (session.role === 'student') {
      const q = query(collection(db, 'marks'), where('studentUid', '==', session.uid))
      const unsub = onSnapshot(q, (s) => setMyMarks(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      return () => unsub()
    }
    setMyMarks([])
  }, [session])

  // للإدارة: قراءة مرة وحدة (getDocs) لا real-time — علامات المدرسة كلها ممكن توصل آلاف الوثائق،
  // و real-time listener عليها هيك بيستهلك حصة القراءة اليومية بسرعة. refreshAdminMarks تحت
  // بتعيد الجلب عند الطلب (مثلاً قبل إعادة حساب لوحات الشرف بـ AdminInsightsPage)
  async function refreshAdminMarks() {
    if (!session || session.role !== 'admin') return []
    const q = query(collection(db, 'marks'), where('schoolId', '==', session.schoolId))
    try {
      const snap = await getDocs(q)
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setAllMarks(rows)
      setAllMarksError(null)
      return rows // بترجع الصفوف الطازة مباشرة — الاعتماد على allMarks state بعد await غير موثوق بنفس التشغيلة
    } catch (err) {
      // فشل القراءة لازم يبقى مميّز عن "صفر علامات" — وإلا صار خطأ صلاحية/شبكة يبين متل ما في علامات أصلاً
      setAllMarksError(err)
      throw err
    }
  }

  useEffect(() => {
    if (!session) { setAllMarks([]); setAllMarksError(null); return }

    if (session.role === 'admin') {
      refreshAdminMarks().catch(() => {}) // الخطأ محفوظ بـ allMarksError، هون بس منمنع unhandled rejection
      return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // score و maxScore أرقام. homeworkId اختياري (بينحط تلقائي لما العلامة جايه من تقييم واجب)
  async function setMarkValue(subjectId, studentUid, categoryId, score, maxScore, homeworkId = null) {
    const docId = markDocId(studentUid, subjectId, categoryId, homeworkId)
    await setDoc(doc(db, 'marks', docId), {
      subjectId,
      studentUid,
      categoryId,
      score: Number(score),
      maxScore: Number(maxScore),
      homeworkId: homeworkId || null,
      source: homeworkId ? 'homework' : 'manual',
      teacherUid: session.uid,
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      updatedAt: Date.now(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'set_mark', 'student', studentUid, `${subjectId}/${categoryId}: ${score}/${maxScore}`)

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
        await sendNotification(studentUid, `انحطّت لك علامة جديدة بمادة ${subject.name} (${label}): ${scoreText}.`, 'grade', session.schoolId)
        if (!student.parentUids || student.parentUids.length === 0) {
          console.warn(`[إشعارات] الطالب ${student.name} (${studentUid}) ما إله parentUids — ما رح يوصل إشعار لولي أمره.`)
        }
        for (const parentUid of student.parentUids || []) {
          await sendNotification(parentUid, `حصل/ت ${student.name} على ${scoreText} بمادة ${subject.name} (${label}).`, 'grade', session.schoolId)
        }
      } else {
        console.warn('[إشعارات] ما لقينا وثيقة الطالب أو المادة', { studentExists: studentSnap.exists(), subjectExists: subjectSnap.exists() })
      }
    } catch (err) {
      // ما منوقف عملية حفظ العلامة بسبب فشل الإشعار، بس نسجّل الخطأ حتى نقدر نشخّصه
      console.error('[إشعارات] فشل إرسال إشعار العلامة:', err)
    }
  }

  function getMarksForStudentSubject(uid, subjectId) {
    const pool = session?.role === 'student' ? myMarks : allMarks
    return pool.filter((m) => m.studentUid === uid && m.subjectId === subjectId
      && (!m.academicYear || m.academicYear === currentAcademicYear))
  }

  // بيرجع {score, maxScore} أو null إذا ما انحطت علامة بعد (أو إذا كانت بيانات قديمة ناقصة).
  // فئة زي "الواجبات" ممكن يكون إلها أكتر من سجل (وحدة لكل واجب) — aggregateMark بيجمعهم كلهم
  // عشان مجموع الفئة يعكس كل الواجبات المقيَّمة، مو بس آخر وحدة.
  function getMark(uid, subjectId, categoryId) {
    return aggregateMark(getMarksForStudentSubject(uid, subjectId), categoryId)
  }

  // نص جاهز للعرض متل "37/50"
  function formatMark(mark) {
    if (!mark) return null
    return `${mark.score}/${mark.maxScore}`
  }

  return (
    <MarksContext.Provider
      value={{ setMarkValue, getMarksForStudentSubject, getMark, formatMark, allMarks, allMarksError, refreshAdminMarks }}
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