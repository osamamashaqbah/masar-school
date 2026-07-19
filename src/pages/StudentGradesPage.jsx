import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'

import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { categoriesFor } from '../utils/gradeCategories'
import AttendanceReport from '../components/AttendanceReport'

export default function StudentGradesPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getMark, formatMark } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { getAbsenceDatesFor } = useAttendance()

  const mySubjects = subjects.filter((s) => s.sectionId === session.sectionId)
  const absenceDates = getAbsenceDatesFor(session.uid)

  return (
    <div>
      <div className="eyebrow">درجاتي</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>درجاتك بكل مادة</h2>

      <div className="eyebrow" style={{ marginBottom: '10px' }}>الحضور والغياب</div>
      <AttendanceReport absences={absenceDates} />

      <div className="grade-subject-grid">
        {mySubjects.map((s, si) => {
          const categories = categoriesFor(s)
          const { attempts, correct } = getStudentStats(session.uid, s.id)

          // مجموع بسيط: نجمع كل درجة انحطت مع أعلى درجة إلها، وبس. بدون أوزان أو نسب.
          let totalScore = 0
          let totalMax = 0
          categories.forEach((cat) => {
            if (cat.id === 'quiz') {
              if (attempts > 0) { totalScore += correct; totalMax += attempts }
              return
            }
            const mark = getMark(session.uid, s.id, cat.id)
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
                  <div className="grade-subject-sub">{categories.length} بنود تقييم</div>
                </div>
                <div className="grade-ring">
                  <svg width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r={r} fill="none" stroke="var(--paper-deep)" strokeWidth="6" />
                    {pct !== null && (
                      <circle
                        cx="36" cy="36" r={r} fill="none" stroke="url(#grade-ring-gradient)" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 1s var(--ease-smooth)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                      />
                    )}
                    <defs>
                      <linearGradient id="grade-ring-gradient" x1="0" y1="0" x2="1" y2="1">
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
                    : formatMark(getMark(session.uid, s.id, cat.id))

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
    </div>
  )
}