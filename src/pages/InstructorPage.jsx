import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'

export default function InstructorPage() {
  const { session } = useSession()
  const { subjects, sections, grades } = useSchoolStructure()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)

  function labelFor(subject) {
    const section = sections.find((sec) => sec.id === subject.sectionId)
    const grade = section ? grades.find((g) => g.id === section.gradeId) : null
    return grade && section ? `${grade.name} · ${section.name}` : ''
  }

  return (
    <div>
      <div className="eyebrow">لوحة المعلّم</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>شعبي</h2>

      {mySubjects.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد.</p>
      ) : (
        <div className="analytics-list">
          {mySubjects.map((s) => (
            <div className="analytics-row" key={s.id}>
              <div className="analytics-title">{s.name}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>{labelFor(s)} · {s.lessons.length} دروس</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}