import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useHomework } from '../context/HomeworkContext'
import { useNotifications } from '../context/NotificationContext'
import TaskCenter from '../components/TaskCenter'

export default function InstructorPage() {
  const { session } = useSession()
  const { subjects, sections, grades } = useSchoolStructure()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const { homework } = useHomework()
  const { notifications, unreadCount } = useNotifications()
  const myHomework = homework.filter((item) => mySubjects.some((subject) => subject.id === item.courseId))
  const instructorTasks = [
    ...myHomework.slice(0, 2).map((item) => ({
      id: `homework-${item.id}`,
      icon: 'ti-clipboard-list',
      title: `تابع واجب: ${item.title}`,
      meta: mySubjects.find((subject) => subject.id === item.courseId)?.name || 'واجب منشور',
      badge: 'متابعة',
      tone: 'soon',
      to: '/app/instructor/grade-homework',
    })),
    ...notifications.filter((notification) => !notification.read).slice(0, 2).map((notification) => ({
      id: `notification-${notification.id}`,
      icon: notification.type === 'warning' ? 'ti-alert-triangle' : 'ti-bell',
      title: notification.message,
      meta: 'إشعار جديد',
      badge: 'جديد',
      tone: notification.type === 'warning' ? 'urgent' : '',
      to: '/app/announcements',
    })),
  ]

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

      <TaskCenter
        title="مركز مهام المعلّم"
        subtitle={unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء ومهام تدريسية للمتابعة.` : 'ابدأ من الإجراء الأقرب لعملك اليومي.'}
        tasks={instructorTasks}
        actions={[
          { icon: 'ti-plus', label: 'إضافة درس', to: '/app/instructor/lessons' },
          { icon: 'ti-checkbox', label: 'تصحيح الواجبات', to: '/app/instructor/grade-homework' },
          { icon: 'ti-calendar-check', label: 'تسجيل الحضور', to: '/app/instructor/attendance' },
          { icon: 'ti-certificate', label: 'الدرجات', to: '/app/instructor/manual-grades' },
        ]}
        emptyText="لا توجد مهام عاجلة. يمكنك البدء بإضافة درس أو مراجعة تقدم شعبك."
      />

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
