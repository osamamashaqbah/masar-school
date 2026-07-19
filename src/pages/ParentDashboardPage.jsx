import { useEffect, useState } from 'react'
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { categoriesFor } from '../utils/gradeCategories'

export default function ParentDashboardPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getStudentProgress } = useProgress()
  const { getMark, formatMark } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { getAbsenceDatesFor } = useAttendance()

  const [children, setChildren] = useState([])

  useEffect(() => {
    if (!session?.childUids || session.childUids.length === 0) return
    const q = query(collection(db, 'users'), where(documentId(), 'in', session.childUids.slice(0, 10)))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChildren(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  if (!session.childUids || session.childUids.length === 0) {
    return (
      <div>
        <div className="eyebrow">لوحة ولي الأمر</div>
        <h2 className="page-title">ما في أبناء مرتبطين بحسابك بعد</h2>
        <p style={{ color: 'var(--ink-soft)' }}>تواصل مع إدارة المدرسة لربط حسابك بأبنائك.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">لوحة ولي الأمر</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>متابعة أبنائك</h2>

      {children.map((child) => {
        const childSubjects = subjects.filter((s) => s.sectionId === child.sectionId)
        const absenceDates = getAbsenceDatesFor(child.id)

        return (
          <div key={child.id} className="child-report-block">
            <div className="child-report-head">
              <div className="child-report-avatar"><i className="ti ti-user" /></div>
              <div>
                <div className="child-report-name">{child.name}</div>
                <div className="child-report-sub">{childSubjects.length} مادة</div>
              </div>
            </div>

            <div className="attendance-summary-card">
              <div className="attendance-summary-icon"><i className="ti ti-calendar-event" /></div>
              <div style={{ flex: 1 }}>
                <div className="attendance-summary-title">الحضور والغياب</div>
                {absenceDates.length === 0 ? (
                  <p className="attendance-summary-empty">ما في غياب مسجّل — حضور كامل حتى الآن.</p>
                ) : (
                  <div className="attendance-date-chips">
                    {absenceDates.map((d) => <span key={d} className="attendance-date-chip">{d}</span>)}
                  </div>
                )}
              </div>
              {absenceDates.length > 0 && <div className="attendance-summary-count">{absenceDates.length}</div>}
            </div>

            {childSubjects.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: '13.5px' }}>ابنك/ابنتك ما إلها مواد مضافة بعد.</p>
            ) : (
              <div className="grade-subject-grid">
                {childSubjects.map((s, si) => {
                  const done = getStudentProgress(child.id, s.id)
                  const progressPct = Math.round((done / (s.lessons.length || 1)) * 100)

                  const categories = categoriesFor(s)
                  const { attempts, correct } = getStudentStats(child.id, s.id)

                  let totalScore = 0
                  let totalMax = 0
                  categories.forEach((cat) => {
                    if (cat.id === 'quiz') {
                      if (attempts > 0) { totalScore += correct; totalMax += attempts }
                      return
                    }
                    const mark = getMark(child.id, s.id, cat.id)
                    if (mark) { totalScore += mark.score; totalMax += mark.maxScore }
                  })

                  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null
                  const r = 30
                  const circumference = 2 * Math.PI * r
                  const offset = pct === null ? circumference : circumference - (pct / 100) * circumference

                  return (
                    <div className="grade-subject-card card-hover-lift animate-stagger" key={s.id} style={{ animationDelay: `${si * 60}ms` }}>
                      <div className="grade-subject-head">
                        <div>
                          <div className="grade-subject-name">{s.name}</div>
                          <div className="grade-subject-sub">التقدم بالدروس: {progressPct}% ({done}/{s.lessons.length})</div>
                        </div>
                        <div className="grade-ring">
                          <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r={r} fill="none" stroke="var(--paper-deep)" strokeWidth="6" />
                            {pct !== null && (
                              <circle
                                cx="36" cy="36" r={r} fill="none" stroke="url(#parent-grade-ring-gradient)" strokeWidth="6" strokeLinecap="round"
                                strokeDasharray={circumference} strokeDashoffset={offset}
                                style={{ transition: 'stroke-dashoffset 1s var(--ease-smooth)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                              />
                            )}
                            <defs>
                              <linearGradient id="parent-grade-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="var(--accent)" />
                                <stop offset="100%" stopColor="var(--accent-2)" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="grade-ring-label">{pct !== null ? `${pct}%` : '—'}</div>
                        </div>
                      </div>

                      <div className="grade-stat-grid">
                        {categories.map((cat) => {
                          const displayValue = cat.id === 'quiz'
                            ? (attempts > 0 ? `${correct}/${attempts}` : null)
                            : formatMark(getMark(child.id, s.id, cat.id))
                          return (
                            <div className="grade-stat-tile" key={cat.id}>
                              <div className="grade-stat-label">{cat.label}</div>
                              <div className={`grade-stat-value${!displayValue ? ' empty' : ''}`}>{displayValue || 'لسا'}</div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="grade-subject-total">
                        <span>المجموع الكلي</span>
                        <span className="text-gradient">{totalScore}/{totalMax}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}