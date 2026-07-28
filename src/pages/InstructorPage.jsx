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
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحة المعلّم</div>
          <h2 className="page-title">شعبي</h2>
        </div>
        <div className="role-badge"><i className="ti ti-chalkboard" /> معلّم</div>
      </div>

      {mySubjects.length === 0 ? (
        <div className="quiz-card" style={{ maxWidth: '480px' }}>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>ما في مواد مسندة لك بعد. تواصل مع إدارة المدرسة.</p>
        </div>
      ) : (
        <div className="course-grid">
          {mySubjects.map((s, i) => (
            <div className="course-card-flat card-hover-lift animate-stagger" key={s.id} style={{ animationDelay: `${i * 45}ms` }}>
              <div className="course-card-top">
                <span className="course-card-icon"><i className="ti ti-book-2" /></span>
                <span className="tag tag-sky">{s.lessons.length} دروس</span>
              </div>
              <div className="course-title">{s.name}</div>
              <div className="course-meta"><i className="ti ti-users" /> {labelFor(s)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
