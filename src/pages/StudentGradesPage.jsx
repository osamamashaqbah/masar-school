import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'

import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { categoriesFor } from '../utils/gradeCategories'

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

      <div className="panel" style={{ maxWidth: '620px', marginBottom: '20px' }}>
        <div className="analytics-title" style={{ marginBottom: '8px' }}>الحضور والغياب</div>
        {absenceDates.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>ما في غياب مسجّل عليك.</p>
        ) : (
          <>
            <p style={{ fontSize: '13px', marginBottom: '6px' }}>عدد أيام الغياب: <strong>{absenceDates.length}</strong></p>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>{absenceDates.join('، ')}</p>
          </>
        )}
      </div>

      <div className="analytics-list">
        {mySubjects.map((s) => {
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

          return (
            <div className="analytics-row" key={s.id}>
              <div className="analytics-title">{s.name}</div>
              {categories.map((cat) => {
                const displayValue = cat.id === 'quiz'
                  ? (attempts > 0 ? `${correct}/${attempts}` : null)
                  : formatMark(getMark(session.uid, s.id, cat.id))

                return (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span>{cat.label}</span>
                    <span style={{ fontWeight: 600 }}>{displayValue || 'لسا ما انحطت'}</span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0 0', fontWeight: 700 }}>
                <span>المجموع</span>
                <span>{totalScore}/{totalMax}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}