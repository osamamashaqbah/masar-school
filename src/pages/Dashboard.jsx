import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useSession } from '../context/SessionContext'
import { useProgress } from '../context/ProgressContext'
import { useHomework } from '../context/HomeworkContext'
import HonorBoard from '../components/HonorBoard'
import TaskCenter from '../components/TaskCenter'
import { useNotifications } from '../context/NotificationContext'

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
  const { notifications, unreadCount } = useNotifications()
  const mySubjects = subjects.filter((s) => s.sectionId === session.sectionId)
  const upcoming = getUpcomingDeadlines(mySubjects.map((s) => s.id))
  const dashboardTasks = [
    ...upcoming.map((h) => {
      const subject = mySubjects.find((s) => s.id === h.courseId)
      const label = urgencyLabel(h)
      return {
        id: `homework-${h.id}`,
        icon: 'ti-clipboard-list',
        title: h.title,
        meta: subject?.name || 'واجب قريب',
        badge: label.text,
        tone: h.urgency === 'urgent' || h.hoursLeft < 0 ? 'urgent' : h.urgency === 'soon' ? 'soon' : '',
        to: `/app/homework-detail/${h.id}`,
      }
    }),
    ...notifications.filter((n) => !n.read).slice(0, 2).map((n) => ({
      id: `notification-${n.id}`,
      icon: n.type === 'warning' ? 'ti-alert-triangle' : 'ti-bell',
      title: n.message,
      meta: 'إشعار جديد',
      badge: 'جديد',
      tone: n.type === 'warning' ? 'urgent' : '',
      to: '/app/announcements',
    })),
  ]

  const [sectionBoard, setSectionBoard] = useState(null)
  const [topStudents, setTopStudents] = useState(null)
  const [topSections, setTopSections] = useState(null)

  useEffect(() => {
    if (!session.sectionId) { setSectionBoard(null); return }
    const unsub = onSnapshot(
      doc(db, 'honorBoards', `${session.schoolId}_section_${session.sectionId}`),
      (snap) => setSectionBoard(snap.data() || null),
      (err) => { console.error('[لوحة الشرف] فشل تحميل لوحة الشعبة:', err); setSectionBoard(null) }
    )
    return () => unsub()
  }, [session.schoolId, session.sectionId])

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'honorBoards', `${session.schoolId}_top_students`),
      (snap) => setTopStudents(snap.data() || null),
      (err) => { console.error('[لوحة الشرف] فشل تحميل لوحة أفضل الطلاب:', err); setTopStudents(null) }
    )
    return () => unsub()
  }, [session.schoolId])

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'honorBoards', `${session.schoolId}_top_sections`),
      (snap) => setTopSections(snap.data() || null),
      (err) => { console.error('[لوحة الشرف] فشل تحميل لوحة أفضل الشعب:', err); setTopSections(null) }
    )
    return () => unsub()
  }, [session.schoolId])

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحتي</div>
          <h2 className="page-title">مسارك الدراسي</h2>
        </div>
        <div className="role-badge"><i className="ti ti-user" /> طالب</div>
      </div>

      <TaskCenter
        title="مركز مهام الطالب"
        subtitle={unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء ومهام تحتاج متابعة.` : 'تابع واجباتك وموادك من مكان واحد.'}
        tasks={dashboardTasks}
        actions={[
          { icon: 'ti-calendar-week', label: 'جدولي', to: '/app/timetable' },
          { icon: 'ti-certificate', label: 'درجاتي', to: '/app/grades' },
          { icon: 'ti-clipboard-list', label: 'اختباراتي', to: '/app/exams' },
        ]}
        emptyText="لا توجد واجبات قريبة أو تنبيهات جديدة. استمر بهذا الإيقاع."
      />

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
              <button
                type="button"
                className="course-card-flat card-hover-lift animate-stagger"
                key={s.id}
                style={{ animationDelay: `${i * 45}ms` }}
                onClick={() => navigate(`/app/subject/${s.id}`)}
                aria-label={`فتح مادة ${s.name}`}
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
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
