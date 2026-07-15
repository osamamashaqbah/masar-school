import { useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useSession } from '../context/SessionContext'
import { useProgress } from '../context/ProgressContext'

function ringSvg(pct) {
  const r = 22
  const c = 2 * Math.PI * r
  return { circumference: c, offset: c - (pct / 100) * c }
}

export default function Dashboard() {
  const { subjects } = useSchoolStructure()
  const { progress } = useProgress()
  const { session } = useSession()
  const navigate = useNavigate()

  const mySubjects = subjects.filter((s) => s.sectionId === session.sectionId)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحتي</div>
          <h2 className="page-title">مسارك الدراسي</h2>
        </div>
        <div className="role-badge"><i className="ti ti-user" /> طالب</div>
      </div>

      {mySubjects.length === 0 ? (
        <div className="quiz-card" style={{ maxWidth: '480px' }}>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
            ما في مواد مضافة لشعبتك بعد. تواصل مع إدارة المدرسة.
          </p>
        </div>
      ) : (
        <div className="course-grid">
          {mySubjects.map((s) => {
            const done = progress[s.id] || 0
            const total = s.lessons.length || 1
            const pct = Math.round((done / total) * 100)
            const { circumference, offset } = ringSvg(pct)

            return (
              <div className="course-card-flat animate-stagger" key={s.id} onClick={() => navigate(`/app/subject/${s.id}`)}>
                <div className="course-card-top">
                  <span className="tag tag-pine">مادة</span>
                  <div className="course-ring">
                    <svg width="44" height="44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--paper-deep)" strokeWidth="4" />
                      <circle
                        cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                      />
                    </svg>
                    <div className="course-ring-label-sm">{pct}%</div>
                  </div>
                </div>
                <div className="course-title">{s.name}</div>
                <div className="course-meta">{s.lessons.length} دروس · معلّم: {s.teacherName}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}