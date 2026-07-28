import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useSession } from '../context/SessionContext'
import { useProgress } from '../context/ProgressContext'
import { useHomework } from '../context/HomeworkContext'
import HonorBoard from '../components/HonorBoard'

function urgencyLabel(h) {
  if (h.hoursLeft < 0) return { text: 'فات الموعد', color: 'var(--sunset)' }
  if (h.urgency === 'urgent') return { text: `باقي ${Math.max(1, Math.round(h.hoursLeft))} ساعة`, color: 'var(--sunset)' }
  if (h.urgency === 'soon') return { text: `باقي ${Math.round(h.hoursLeft / 24)} يوم`, color: 'var(--gold, #b8860b)' }
  return { text: `باقي ${Math.round(h.hoursLeft / 24)} يوم`, color: 'var(--ink-soft)' }
}

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

  const { getUpcomingDeadlines } = useHomework()
  const mySubjects = subjects.filter((s) => s.sectionId === session.sectionId)
  const upcoming = getUpcomingDeadlines(mySubjects.map((s) => s.id))

  const [sectionBoard, setSectionBoard] = useState(null)
  const [topStudents, setTopStudents] = useState(null)
  const [topSections, setTopSections] = useState(null)

  useEffect(() => {
    if (!session.sectionId) { setSectionBoard(null); return }
    const unsub = onSnapshot(doc(db, 'honorBoards', `section_${session.sectionId}`), (snap) => setSectionBoard(snap.data() || null))
    return () => unsub()
  }, [session.sectionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'honorBoards', 'school_top_students'), (snap) => setTopStudents(snap.data() || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'honorBoards', 'school_top_sections'), (snap) => setTopSections(snap.data() || null))
    return () => unsub()
  }, [])

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحتي</div>
          <h2 className="page-title">مسارك الدراسي</h2>
        </div>
        <div className="role-badge"><i className="ti ti-user" /> طالب</div>
      </div>

      {upcoming.length > 0 && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px' }}><i className="ti ti-calendar-due" /> واجبات قريبة</div>
          {upcoming.map((h) => {
            const subject = mySubjects.find((s) => s.id === h.courseId)
            const label = urgencyLabel(h)
            return (
              <div key={h.id} className="account-panel-row" style={{ justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }} onClick={() => navigate(`/app/homework-detail/${h.id}`)}>
                <span style={{ fontSize: '13px' }}>{h.title} <span style={{ color: 'var(--ink-faint)' }}>· {subject?.name}</span></span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: label.color }}>{label.text}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="honor-board-grid">
        <HonorBoard
          title="لوحة شرف الشعبة"
          icon="ti-star"
          entries={sectionBoard?.top}
          nameKey="studentName"
          idKey="studentUid"
          meId={session.uid}
        />
        <HonorBoard
          title="أفضل 10 طلاب بالمدرسة"
          icon="ti-trophy"
          entries={topStudents?.top}
          nameKey="studentName"
          subKey="sectionName"
          idKey="studentUid"
          meId={session.uid}
        />
        <HonorBoard
          title="أفضل 5 شعب بالمدرسة"
          icon="ti-users-group"
          entries={topSections?.top}
          nameKey="sectionName"
          subKey="gradeName"
          idKey="sectionId"
          meId={session.sectionId}
        />
      </div>

      {mySubjects.length === 0 ? (
        <div className="quiz-card" style={{ maxWidth: '480px' }}>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
            ما في مواد مضافة لشعبتك بعد. تواصل مع إدارة المدرسة.
          </p>
        </div>
      ) : (
        <div className="course-grid">
          {mySubjects.map((s, i) => {
            const done = progress[s.id] || 0
            const total = s.lessons.length || 1
            const pct = Math.round((done / total) * 100)
            const { circumference, offset } = ringSvg(pct)

            return (
              <div
                className="course-card-flat card-hover-lift animate-stagger"
                key={s.id}
                style={{ animationDelay: `${i * 45}ms` }}
                onClick={() => navigate(`/app/subject/${s.id}`)}
              >
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