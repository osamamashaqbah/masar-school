import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'

const AttendanceContext = createContext(null)

export function AttendanceProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear } = useSchoolStructure()
  const [myAbsences, setMyAbsences] = useState([])
  const [childrenAbsences, setChildrenAbsences] = useState([])
  const [schoolAbsences, setSchoolAbsences] = useState([])
  const [schoolAbsencesError, setSchoolAbsencesError] = useState(null)

  useEffect(() => {
    if (!session || session.role !== 'student') { setMyAbsences([]); return }
    const q = query(collection(db, 'attendance'), where('studentUid', '==', session.uid))
    const unsub = onSnapshot(q, (s) => setMyAbsences(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'parent' || !session.childUids?.length) { setChildrenAbsences([]); return }
    const q = query(collection(db, 'attendance'), where('studentUid', 'in', session.childUids.slice(0, 10)))
    const unsub = onSnapshot(q, (s) => setChildrenAbsences(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [session])

  // للإدارة بس — مطلوب لحساب الإنذار المبكر (غياب) على مستوى المدرسة كلها.
  // getDocs مرة وحدة لا real-time (نفس منطق refreshAdminMarks بـ MarksContext) — حضور مدرسة
  // كاملة عبر السنين ممكن يوصل آلاف الوثائق، ما بستاهل استهلاك حصة القراءة اليومية عليه بشكل مستمر
  async function refreshSchoolAbsences() {
    if (!session || session.role !== 'admin') return []
    const q = query(collection(db, 'attendance'), where('schoolId', '==', session.schoolId))
    try {
      const snap = await getDocs(q)
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setSchoolAbsences(rows)
      setSchoolAbsencesError(null)
      return rows
    } catch (err) {
      // فشل القراءة لازم يبقى مميّز عن "صفر غيابات" — وإلا صار خطأ صلاحية/شبكة يبين متل ما في غياب أصلاً
      setSchoolAbsencesError(err)
      throw err
    }
  }

  useEffect(() => {
    if (!session || session.role !== 'admin') { setSchoolAbsences([]); setSchoolAbsencesError(null); return }
    refreshSchoolAbsences().catch(() => {}) // الخطأ محفوظ بـ schoolAbsencesError، هون بس منمنع unhandled rejection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // بيرجع {unexcused, excused} لطالب معيّن (بالسنة الحالية بس) — يشتغل بس لحساب الإدارة (schoolAbsences)
  function getAbsenceCounts(uid) {
    const rows = schoolAbsences.filter((a) => a.studentUid === uid && (!a.academicYear || a.academicYear === currentAcademicYear))
    return {
      unexcused: rows.filter((a) => !a.excused).length,
      excused: rows.filter((a) => a.excused).length,
    }
  }

  // بيرجع {studentUid, excused} لكل طالب غايب بهاي الشعبة بهاد التاريخ
  async function getAttendanceForDate(sectionId, date) {
    const q = query(
      collection(db, 'attendance'),
      where('teacherUid', '==', session.uid),
      where('date', '==', date),
      where('sectionId', '==', sectionId)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ studentUid: d.data().studentUid, excused: !!d.data().excused }))
  }

  async function setAbsent(studentUid, sectionId, date, excused = false) {
    const docId = `${studentUid}_${date}`
    await setDoc(doc(db, 'attendance', docId), {
      studentUid,
      sectionId,
      date,
      excused,
      teacherUid: session.uid,
      schoolId: session.schoolId,
      academicYear: currentAcademicYear,
      createdAt: Date.now(),
    })

    // إشعار الطالب وأهله بالغياب — أفضل جهد، ما لازم يوقف حفظ الحضور لو فشل لأي سبب.
    try {
      const studentSnap = await getDoc(doc(db, 'users', studentUid))
      if (studentSnap.exists()) {
        const student = studentSnap.data()
        const excuseText = excused ? 'بعذر' : 'بدون عذر'
        await sendNotification(studentUid, `تسجّل غياب عليك (${excuseText}) بتاريخ ${date}.`, 'attendance', session.schoolId)
        if (!student.parentUids || student.parentUids.length === 0) {
          console.warn(`[إشعارات] الطالب ${student.name} (${studentUid}) ما إله parentUids — ما رح يوصل إشعار لولي أمره.`)
        }
        for (const parentUid of student.parentUids || []) {
          await sendNotification(parentUid, `غاب/ت ${student.name} (${excuseText}) بتاريخ ${date}.`, 'attendance', session.schoolId)
        }
      } else {
        console.warn('[إشعارات] ما لقينا وثيقة الطالب', studentUid)
      }
    } catch (err) {
      // ما منوقف عملية تسجيل الحضور بسبب فشل الإشعار، بس نسجّل الخطأ حتى نقدر نشخّصه
      console.error('[إشعارات] فشل إرسال إشعار الغياب:', err)
    }
  }

  // تعديل حالة العذر لغياب مسجّل أصلاً، بدون إعادة إرسال إشعار غياب جديد
  async function updateExcused(studentUid, date, excused) {
    const docId = `${studentUid}_${date}`
    await setDoc(doc(db, 'attendance', docId), { excused }, { merge: true })
  }

  async function setPresent(studentUid, date) {
    const docId = `${studentUid}_${date}`
    await deleteDoc(doc(db, 'attendance', docId))
  }

  // بيرجع [{date, excused}, ...] الأحدث أول
  function getAbsenceDatesFor(uid) {
    const pool = session?.role === 'student' ? myAbsences : childrenAbsences
    return pool
      .filter((a) => a.studentUid === uid && (!a.academicYear || a.academicYear === currentAcademicYear))
      .map((a) => ({ date: a.date, excused: !!a.excused }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  return (
    <AttendanceContext.Provider value={{ getAttendanceForDate, setAbsent, setPresent, updateExcused, getAbsenceDatesFor, getAbsenceCounts, schoolAbsences, schoolAbsencesError, refreshSchoolAbsences }}>
      {children}
    </AttendanceContext.Provider>
  )
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext)
  if (!ctx) throw new Error('useAttendance must be used inside AttendanceProvider')
  return ctx
}
