import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { categoriesFor } from '../utils/gradeCategories'

export default function StudentGradesPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getMarkValue } = useMarks()
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
          const total = categories
            .filter((cat) => cat.id !== 'quiz')
            .reduce((sum, cat) => {
              const raw = getMarkValue(session.uid, s.id, cat.id)
              const num = Number(raw)
              return raw && !Number.isNaN(num) ? sum + num : sum
            }, 0)

          return (
            <div className="analytics-row" key={s.id}>
              <div className="analytics-title">{s.name}</div>
              {categories.map((cat) => {
                const value = cat.id === 'quiz'
                  ? (attempts > 0 ? `${correct}/${attempts}` : null)
                  : getMarkValue(session.uid, s.id, cat.id)

                return (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span>{cat.label}</span>
                    <span style={{ fontWeight: 600 }}>{value || 'لسا ما انحطت'}</span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0 0', fontWeight: 700 }}>
                <span>المجموع</span>
                <span>{total}/100</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}