import { useEffect, useState } from 'react'
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { useExcuseRequests } from '../context/ExcuseRequestContext'
import { useHomework } from '../context/HomeworkContext'
import { categoriesFor, computeSubjectTotal } from '../utils/gradeCategories'
import AttendanceReport from '../components/AttendanceReport'
import ReportCardPrint from '../components/ReportCardPrint'
import TaskCenter from '../components/TaskCenter'
import { useNotifications } from '../context/NotificationContext'

function excuseStatusLabel(status) {
  if (status === 'approved') return { text: 'تمت الموافقة', className: 'excused' }
  if (status === 'rejected') return { text: 'مرفوض', className: 'unexcused' }
  return { text: 'بانتظار المعلّم', className: '' }
}

function ExcuseRequestForm({ child }) {
  const { myRequests, submitRequest } = useExcuseRequests()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const childRequests = myRequests.filter((r) => r.studentUid === child.id).sort((a, b) => (a.date < b.date ? 1 : -1))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date || !reason.trim() || !child.sectionId) return
    setSending(true)
    try {
      await submitRequest(child.id, child.name, child.sectionId, date, reason)
      setDate('')
      setReason('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="panel" style={{ marginBottom: '18px' }}>
      <div className="ask-card-title"><i className="ti ti-calendar-off" /> طلب عذر مسبق لغياب معروف</div>
      <form style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }} onSubmit={handleSubmit}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={{ flex: '1', minWidth: '150px' }} />
        <input type="text" placeholder="سبب الغياب" value={reason} onChange={(e) => setReason(e.target.value)} required style={{ flex: '2', minWidth: '180px' }} />
        <button type="submit" className="btn btn-accent" disabled={sending} style={{ width: 'auto' }}>إرسال</button>
      </form>
      {childRequests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {childRequests.slice(0, 5).map((r) => {
            const badge = excuseStatusLabel(r.status)
            return (
              <div key={r.id} style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span>{r.date} — {r.reason}</span>
                <span className={`excuse-toggle-btn active ${badge.className}`} style={{ padding: '2px 8px', fontSize: '10.5px' }}>{badge.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ParentDashboardPage() {
  const { session } = useSession()
  const { subjects, schoolName, currency, paymentInfo, branding } = useSchoolStructure()
  const { getStudentProgress } = useProgress()
  const { getMark, formatMark } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { getAbsenceDatesFor } = useAttendance()
  const { getProcrastinationPattern } = useHomework()
  const { myRequests } = useExcuseRequests()
  const { notifications, unreadCount } = useNotifications()

  const [children, setChildren] = useState([])
  const [printChildId, setPrintChildId] = useState(null)
  const [bilingualPrint, setBilingualPrint] = useState(false)

  useEffect(() => {
    function onAfterPrint() { setPrintChildId(null) }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  function handlePrint(childId) {
    setPrintChildId(childId)
    requestAnimationFrame(() => window.print())
  }

  useEffect(() => {
    if (!session?.childUids || session.childUids.length === 0) return
    const q = query(collection(db, 'users'), where(documentId(), 'in', session.childUids.slice(0, 10)))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChildren(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  const parentTasks = [
    ...myRequests.filter((request) => request.status === 'pending').slice(0, 2).map((request) => ({
      id: `excuse-${request.id}`,
      icon: 'ti-calendar-off',
      title: `طلب عذر بانتظار المتابعة: ${request.studentName || 'أحد الأبناء'}`,
      meta: request.date || 'طلب جديد',
      badge: 'قيد المراجعة',
      tone: 'soon',
      to: '/app/parent-dashboard',
    })),
    ...children.filter((child) => getAbsenceDatesFor(child.id).length > 0).slice(0, 2).map((child) => ({
      id: `attendance-${child.id}`,
      icon: 'ti-calendar-x',
      title: `${child.name} لديه سجل غياب يحتاج مراجعة`,
      meta: `${getAbsenceDatesFor(child.id).length} يوم غياب مسجل`,
      badge: 'متابعة',
      tone: 'urgent',
      to: '/app/parent-dashboard',
    })),
    ...notifications.filter((notification) => !notification.read).slice(0, 2).map((notification) => ({
      id: `notification-${notification.id}`,
      icon: 'ti-bell',
      title: notification.message,
      meta: 'إشعار جديد',
      badge: 'جديد',
      to: '/app/announcements',
    })),
  ]

  if (!session.childUids || session.childUids.length === 0) {
    return (
      <div>
        <div className="eyebrow">لوحة ولي الأمر</div>
        <h2 className="page-title">ما في أبناء مرتبطين بحسابك بعد</h2>
        <p style={{ color: 'var(--ink-soft)' }}>تواصل مع إدارة المدرسة لربط حسابك بأبنائك.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">لوحة ولي الأمر</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>متابعة أبنائك</h2>

      <TaskCenter
        title="مركز مهام ولي الأمر"
        subtitle={unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء وتحديثات لأبنائك.` : 'تابع الغياب والطلبات والنتائج من مكان واحد.'}
        tasks={parentTasks}
        actions={[
          { icon: 'ti-users', label: 'ملفات الأبناء', to: '/app/parent-dashboard' },
          { icon: 'ti-message-circle', label: 'الرسائل', to: '/app/messages' },
          { icon: 'ti-calendar-week', label: 'الجدول', to: '/app/timetable' },
        ]}
        emptyText="لا توجد طلبات أو تنبيهات عاجلة الآن."
      />

      {paymentInfo && (paymentInfo.bankName || paymentInfo.iban || paymentInfo.cliqAlias || paymentInfo.notes) && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px' }}><i className="ti ti-building-bank" /> بيانات دفع الرسوم ({currency})</div>
          {paymentInfo.bankName && <p style={{ margin: '4px 0', fontSize: '13px' }}>البنك: {paymentInfo.bankName}</p>}
          {paymentInfo.iban && <p style={{ margin: '4px 0', fontSize: '13px' }}>رقم الحساب/الآيبان: {paymentInfo.iban}</p>}
          {paymentInfo.cliqAlias && <p style={{ margin: '4px 0', fontSize: '13px' }}>CliQ: {paymentInfo.cliqAlias}</p>}
          {paymentInfo.notes && <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--ink-soft)' }}>{paymentInfo.notes}</p>}
        </div>
      )}

      {children.map((child) => {
        const childSubjects = subjects.filter((s) => s.sectionId === child.sectionId)
        const absenceDates = getAbsenceDatesFor(child.id)
        const procrastination = getProcrastinationPattern(child.id)

        const printRows = childSubjects.map((s) => {
          const { totalScore, totalMax } = computeSubjectTotal(s, child.id, getMark, getStudentStats)
          return { name: s.name, totalScore, totalMax }
        })

        return (
          <div key={child.id} className="child-report-block">
            <div className="child-report-head" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="child-report-avatar"><i className="ti ti-user" /></div>
                <div>
                  <div className="child-report-name">{child.name}</div>
                  <div className="child-report-sub">{childSubjects.length} مادة</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                  <input type="checkbox" checked={bilingualPrint} onChange={(e) => setBilingualPrint(e.target.checked)} /> ثنائي اللغة
                </label>
                <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => handlePrint(child.id)}>
                  <i className="ti ti-printer" /> طباعة كشف العلامات
                </button>
              </div>
            </div>

            {printChildId === child.id && (
              <ReportCardPrint
                schoolName={schoolName}
                studentName={child.name}
                rows={printRows}
                absentDays={absenceDates.length}
                generatedAt={new Date().toLocaleDateString('ar-EG')}
                bilingual={bilingualPrint}
                branding={branding}
              />
            )}

            {procrastination.isPattern && (
              <div className="panel" style={{ marginBottom: '18px', borderColor: 'var(--sunset)' }}>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  <i className="ti ti-clock-hour-9" /> {child.name} بتسلّم أغلب الواجبات قريب جداً من الموعد النهائي
                  ({procrastination.lastMinuteCount} من {procrastination.total}) — تشجيعه يبلّش أبكر ممكن يخفف الضغط عليه.
                </p>
              </div>
            )}

            <ExcuseRequestForm child={child} />

            <AttendanceReport absences={absenceDates} />

            {childSubjects.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: '13.5px' }}>ابنك/ابنتك ما إلها مواد مضافة بعد.</p>
            ) : (
              <div className="grade-subject-grid">
                {childSubjects.map((s, si) => {
                  const done = getStudentProgress(child.id, s.id)
                  const progressPct = Math.round((done / (s.lessons.length || 1)) * 100)

                  const categories = categoriesFor(s)
                  const { attempts, correct } = getStudentStats(child.id, s.id)
                  const { totalScore, totalMax } = computeSubjectTotal(s, child.id, getMark, getStudentStats)
                  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null
                  const r = 30
                  const circumference = 2 * Math.PI * r
                  const offset = pct === null ? circumference : circumference - (pct / 100) * circumference

                  return (
                    <div className="grade-subject-card card-hover-lift animate-stagger" key={s.id} style={{ animationDelay: `${si * 60}ms` }}>
                      <div className="grade-subject-head">
                        <div>
                          <div className="grade-subject-name">{s.name}</div>
                          <div className="grade-subject-sub">التقدم بالدروس: {progressPct}% ({done}/{s.lessons.length})</div>
                        </div>
                        <div className="grade-ring">
                          <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r={r} fill="none" stroke="var(--paper-deep)" strokeWidth="6" />
                            {pct !== null && (
                              <circle
                                cx="36" cy="36" r={r} fill="none" stroke="url(#parent-grade-ring-gradient)" strokeWidth="6" strokeLinecap="round"
                                strokeDasharray={circumference} strokeDashoffset={offset}
                                style={{ transition: 'stroke-dashoffset 1s var(--ease-smooth)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                              />
                            )}
                            <defs>
                              <linearGradient id="parent-grade-ring-gradient" x1="0" y1="0" x2="1" y2="1">
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
                            : formatMark(getMark(child.id, s.id, cat.id))
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
            )}
          </div>
        )
      })}
    </div>
  )
}