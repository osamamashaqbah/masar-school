import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useQuizStats } from '../../context/QuizStatsContext'
import { useProgress } from '../../context/ProgressContext'

export default function InstructorAnalyticsPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getCourseAggregateStats, getStudentStats } = useQuizStats()
  const { getStudentProgress } = useProgress()

  const [students, setStudents] = useState([])
  const [studentsError, setStudentsError] = useState('')
  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const myTaughtSectionIds = [...new Set(mySubjects.map((s) => s.sectionId))]
  // Firestore بيرفض أي list query كامل (مش بس يفلتر) إذا القواعد ما قدرت تثبت إنه كل نتيجة محتملة
  // مسموحة — فلازم نقيّد الاستعلام بنفس الشعب يلي القاعدة فعليًا بتسمح فيها (بدل ما نجيب كل الطلاب
  // ونفلترهم بالكود، يلي كان يفشل بالكامل حتى لو المعلّم بيدرّس بعض الشعب).
  const sectionIdsKey = myTaughtSectionIds.join(',')

  useEffect(() => {
    if (myTaughtSectionIds.length === 0) { setStudents([]); return }
    setStudentsError('')
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('sectionId', 'in', myTaughtSectionIds.slice(0, 30))
    )
    const unsub = onSnapshot(
      q,
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => setStudentsError(`ما قدرنا نجيب لستة الطلاب (${err.code}). جرب تسجّل خروج ودخول من جديد، وإذا استمرت المشكلة تواصل مع إدارة المدرسة.`)
    )
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey])

  return (
    <div>
      <div className="eyebrow">تحليلات موادك</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>دفتر الدرجات</h2>

      {studentsError && <p className="auth-error">{studentsError}</p>}
      {mySubjects.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد.</p>
      ) : (
        <div className="analytics-list">
          {mySubjects.map((s) => {
            const sectionStudents = students.filter((st) => st.sectionId === s.sectionId)
            const { attempts, correct } = getCourseAggregateStats(s.id)
            const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null

            return (
              <div className="analytics-row" key={s.id}>
                <div className="analytics-title">{s.name}</div>
                <div className="analytics-stats-grid">
                  <div className="analytics-stat"><i className="ti ti-target-arrow" /><span>{attempts} محاولة إجابة</span></div>
                </div>
                {accuracy !== null && (
                  <div className="analytics-accuracy">
                    <div className="analytics-accuracy-label"><span>نسبة الدقة العامة</span><span>{accuracy}%</span></div>
                    <div className="analytics-bar-track"><div className="analytics-bar-fill" style={{ width: `${accuracy}%` }} /></div>
                  </div>
                )}

                {sectionStudents.length === 0 ? (
                  <p className="analytics-empty">ما في طلاب بهاي الشعبة بعد.</p>
                ) : (
                  <div className="gradebook-table" style={{ marginTop: '12px' }}>
                    <div className="gradebook-header"><span>الطالب</span><span>التقدم</span><span>دقة الاختبارات</span></div>
                    {sectionStudents.map((st) => {
                      const done = getStudentProgress(st.id, s.id)
                      const pct = Math.round((done / (s.lessons.length || 1)) * 100)
                      const stStats = getStudentStats(st.id, s.id)
                      const stAcc = stStats.attempts > 0 ? Math.round((stStats.correct / stStats.attempts) * 100) : null
                      return (
                        <div className="gradebook-row" key={st.id}>
                          <span className="gradebook-student"><i className="ti ti-user" /> {st.name}</span>
                          <span>{pct}% ({done}/{s.lessons.length})</span>
                          <span>{stAcc !== null ? `${stAcc}% (${stStats.attempts})` : 'لا يوجد'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}