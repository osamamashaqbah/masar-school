import { useState, useEffect } from 'react'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'

import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { useHomework } from '../context/HomeworkContext'
import { categoriesFor, computeSubjectTotal } from '../utils/gradeCategories'
import AttendanceReport from '../components/AttendanceReport'
import ReportCardPrint from '../components/ReportCardPrint'

export default function StudentGradesPage() {
  const { session } = useSession()
  const { subjects, schoolName, branding } = useSchoolStructure()
  const { getMark, formatMark } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { getAbsenceDatesFor } = useAttendance()
  const { getProcrastinationPattern } = useHomework()
  const [printing, setPrinting] = useState(false)
  const [bilingualPrint, setBilingualPrint] = useState(false)

  const procrastination = getProcrastinationPattern(session.uid)

  const mySubjects = subjects.filter((s) => s.sectionId === session.sectionId)
  const absenceDates = getAbsenceDatesFor(session.uid)

  useEffect(() => {
    function onAfterPrint() { setPrinting(false) }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  function handlePrint() {
    setPrinting(true)
    requestAnimationFrame(() => window.print())
  }

  const printRows = mySubjects.map((s) => {
    const { totalScore, totalMax } = computeSubjectTotal(s, session.uid, getMark, getStudentStats)
    return { name: s.name, totalScore, totalMax }
  })

  return (
    <div>
      <div className="topbar grades-topbar">
        <div>
          <div className="eyebrow">درجاتي</div>
          <h2 className="page-title" style={{ marginBottom: '16px' }}>درجاتك بكل مادة</h2>
        </div>
        <div className="grades-actions">
          <label className="grades-print-option">
            <input type="checkbox" checked={bilingualPrint} onChange={(e) => setBilingualPrint(e.target.checked)} /> ثنائي اللغة
          </label>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            <i className="ti ti-printer" /> طباعة كشف العلامات
          </button>
        </div>
      </div>

      {printing && (
        <ReportCardPrint
          schoolName={schoolName}
          studentName={session.name}
          rows={printRows}
          absentDays={absenceDates.length}
          generatedAt={new Date().toLocaleDateString('ar-EG')}
          bilingual={bilingualPrint}
          branding={branding}
        />
      )}

      {procrastination.isPattern && (
        <div className="panel" style={{ marginBottom: '18px', maxWidth: '520px', borderColor: 'var(--sunset)' }}>
          <p style={{ margin: 0, fontSize: '13px' }}>
            <i className="ti ti-clock-hour-9" /> لاحظنا إنك بتسلّم أغلب واجباتك قريب جداً من الموعد النهائي
            ({procrastination.lastMinuteCount} من {procrastination.total}). جرب تبلّش أبكر شوي، بريحك أكتر 🌱
          </p>
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: '10px' }}>الحضور والغياب</div>
      <AttendanceReport absences={absenceDates} />

      <div className="grade-subject-grid">
        {mySubjects.map((s, si) => {
          const categories = categoriesFor(s)
          const { attempts, correct } = getStudentStats(session.uid, s.id)
          const { totalScore, totalMax } = computeSubjectTotal(s, session.uid, getMark, getStudentStats)
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
