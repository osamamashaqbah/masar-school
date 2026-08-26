import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useQuizStats } from '../../context/QuizStatsContext'
import { useProgress } from '../../context/ProgressContext'
import { chunkArray } from '../../utils/chunk'

export default function InstructorAnalyticsPage() {
  const { session } = useSession()
  const { subjects, currentAcademicYear } = useSchoolStructure()
  const { getCourseAggregateStats, getStudentStats } = useQuizStats()
  const { getStudentProgress } = useProgress()

  const [students, setStudents] = useState([])
  const [studentsError, setStudentsError] = useState('')
  const [warnings, setWarnings] = useState([])
  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const myTaughtSectionIds = [...new Set(mySubjects.map((s) => s.sectionId))]
  // Firestore بيرفض أي list query كامل (مش بس يفلتر) إذا القواعد ما قدرت تثبت إنه كل نتيجة محتملة
  // مسموحة — فلازم نقيّد الاستعلام بنفس الشعب يلي القاعدة فعليًا بتسمح فيها (بدل ما نجيب كل الطلاب
  // ونفلترهم بالكود، يلي كان يفشل بالكامل حتى لو المعلّم بيدرّس بعض الشعب).
  const sectionIdsKey = myTaughtSectionIds.join(',')

  useEffect(() => {
    if (myTaughtSectionIds.length === 0 || !currentAcademicYear) { setStudents([]); return }
    setStudentsError('')
    setStudents([])
    const unsubs = chunkArray(myTaughtSectionIds).map((sectionChunk) => {
      const q = query(
        collection(db, 'userDirectory'),
        where('schoolId', '==', session.schoolId),
        where('role', '==', 'student'),
        where('sectionId', 'in', sectionChunk)
      )
      return onSnapshot(
        q,
        (snap) => setStudents((current) => {
          const merged = new Map(current.map((student) => [student.id, student]))
          snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }))
          return [...merged.values()]
        }),
        (err) => setStudentsError(`ما قدرنا نجيب لستة الطلاب (${err.code}). جرب تسجّل خروج ودخول من جديد، وإذا استمرت المشكلة تواصل مع إدارة المدرسة.`)
      )
    })
    return () => unsubs.forEach((unsub) => unsub())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey, currentAcademicYear])

  useEffect(() => {
    if (myTaughtSectionIds.length === 0 || !currentAcademicYear) { setWarnings([]); return }
    const q = query(collection(db, 'earlyWarnings'), where('schoolId', '==', session.schoolId), where('instructorUids', 'array-contains', session.uid), where('academicYear', '==', currentAcademicYear))
    const unsub = onSnapshot(q, (snap) => setWarnings(snap.docs.map((d) => d.data())))
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey, currentAcademicYear])

  const flaggedStudents = warnings
    .filter((w) => w.attendanceAlert || w.subjectAlerts?.length > 0)
    .map((w) => ({ ...w, student: students.find((st) => st.id === w.studentUid) }))
    .filter((w) => w.student)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">تحليلات موادك</div>
          <h2 className="page-title">دفتر الدرجات</h2>
        </div>
        <div className="role-badge"><i className="ti ti-chart-bar" /> {mySubjects.length} مادة</div>
      </div>

      {studentsError && <p className="auth-error">{studentsError}</p>}

      {flaggedStudents.length > 0 && (
        <div className="panel card-hover-lift animate-stagger" style={{ marginBottom: '22px' }}>
          <div style={{ fontWeight: 800, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <i className="ti ti-alert-triangle" style={{ color: 'var(--berry)' }} /> طلاب بحاجة لمتابعة ({flaggedStudents.length})
          </div>
          {flaggedStudents.map(({ student, attendanceAlert, subjectAlerts, unexcusedCount, excusedCount }) => (
            <div key={student.id} className="analytics-row" style={{ marginBottom: '8px' }}>
              <div className="analytics-title">{student.name}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {attendanceAlert && <span><i className="ti ti-calendar-x" /> غياب: {unexcusedCount} بدون عذر، {excusedCount} بعذر</span>}
                {subjectAlerts?.filter((s) => mySubjects.some((m) => m.id === s.subjectId)).map((s) => (
                  <span key={s.subjectId}><i className="ti ti-alert-triangle" /> خطر رسوب بمادتك: {s.totalScore}/{s.totalMax}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mySubjects.length === 0 ? (
        <div className="quiz-card" style={{ maxWidth: '480px' }}>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>ما في مواد مسندة لك بعد.</p>
        </div>
      ) : (
        <div className="analytics-list">
          {mySubjects.map((s, si) => {
            const sectionStudents = students.filter((st) => st.sectionId === s.sectionId)
            const { attempts, correct } = getCourseAggregateStats(s.id)
            const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null

            return (
              <div className="analytics-row animate-stagger" key={s.id} style={{ animationDelay: `${si * 60}ms` }}>
                <div className="analytics-title">{s.name}</div>
                <div className="analytics-stats-grid">
                  <div className="analytics-stat"><i className="ti ti-target-arrow" /><span>{attempts} محاولة إجابة</span></div>
                  <div className="analytics-stat"><i className="ti ti-users" /><span>{sectionStudents.length} طالب</span></div>
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
