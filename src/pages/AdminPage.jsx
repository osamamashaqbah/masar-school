import { useState, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useNotifications } from '../context/NotificationContext'
import TaskCenter from '../components/TaskCenter'

export default function AdminPage() {
  const { session } = useSession()
  const { subjects, grades, sections, currentAcademicYear } = useSchoolStructure()
  const { notifications, unreadCount } = useNotifications()

  const [users, setUsers] = useState([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [selectedChildren, setSelectedChildren] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountActionUid, setAccountActionUid] = useState(null)
  const [temporaryCredential, setTemporaryCredential] = useState(null)

  useEffect(() => {
    if (session?.role !== 'admin') return
    const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  if (session?.role !== 'admin') return <Navigate to="/app/dashboard" replace />

  const instructorCount = users.filter((u) => u.role === 'instructor').length
  const studentCount = users.filter((u) => u.role === 'student').length
  const parentCount = users.filter((u) => u.role === 'parent').length
  const students = users.filter((u) => u.role === 'student')
  const studentsWithoutSection = students.filter((u) => !u.sectionId)
  const subjectsWithoutTeacher = subjects.filter((s) => !s.teacherUid)
  const instructorsWithoutSubjects = users.filter((u) => u.role === 'instructor' && !subjects.some((s) => s.teacherUid === u.id))
  const adminTasks = [
    ...(!currentAcademicYear ? [{
      id: 'academic-year', icon: 'ti-calendar-event', title: 'حدّد السنة الدراسية الحالية', meta: 'السجلات الجديدة تحتاج سنة نشطة', badge: 'إعداد', tone: 'urgent', to: '/app/settings',
    }] : []),
    ...(grades.length === 0 ? [{
      id: 'first-grade', icon: 'ti-school', title: 'أنشئ الصفوف والشعب', meta: 'ابدأ بالهيكل الدراسي قبل استيراد الطلاب', badge: 'إعداد', tone: 'urgent', to: '/app/school-structure',
    }] : []),
    ...(students.length === 0 ? [{
      id: 'first-student', icon: 'ti-user-plus', title: 'أضف أول طالب للمدرسة', meta: 'لا توجد حسابات طلاب بعد', badge: 'ابدأ هنا', tone: 'urgent', to: '/app/admin',
    }] : []),
    ...(sections.length === 0 && grades.length > 0 ? [{
      id: 'first-section', icon: 'ti-layout-grid', title: 'أضف أول شعبة', meta: 'اربط الطلاب والمعلمين بشعب واضحة', badge: 'إعداد', tone: 'soon', to: '/app/school-structure',
    }] : []),
    ...(subjects.length === 0 && sections.length > 0 ? [{
      id: 'first-subject', icon: 'ti-books', title: 'أضف مواد للشعب', meta: 'أنشئ مواد حتى يبدأ التدريس والتقييم', badge: 'إعداد', tone: 'soon', to: '/app/school-structure',
    }] : []),
    ...(studentsWithoutSection.length > 0 ? [{
      id: 'unassigned-students', icon: 'ti-user-search', title: `${studentsWithoutSection.length} طالب بلا شعبة`, meta: 'اربطهم قبل تسجيل الحضور والدرجات', badge: 'يحتاج متابعة', tone: 'urgent', to: '/app/school-structure',
    }] : []),
    ...(subjectsWithoutTeacher.length > 0 ? [{
      id: 'unassigned-subjects', icon: 'ti-chalkboard-off', title: `${subjectsWithoutTeacher.length} مادة بلا معلم`, meta: 'لن يستطيع أحد إدارتها أو تقييم طلابها', badge: 'يحتاج متابعة', tone: 'soon', to: '/app/school-structure',
    }] : []),
    ...(instructorsWithoutSubjects.length > 0 ? [{
      id: 'idle-instructors', icon: 'ti-chalkboard', title: `${instructorsWithoutSubjects.length} معلم بلا مادة`, meta: 'راجع توزيع الحصص والمواد', badge: 'توزيع', tone: 'soon', to: '/app/school-structure',
    }] : []),
    ...(!import.meta.env.VITE_ADMIN_OPS_WORKER_URL ? [{
      id: 'worker-config', icon: 'ti-alert-triangle', title: 'اربط خدمة إنشاء الحسابات', meta: 'إضافة المستخدمين ستفشل بدون Worker مضبوط', badge: 'تشغيل', tone: 'urgent', to: '/app/settings',
    }] : []),
    ...notifications.filter((notification) => !notification.read).slice(0, 3).map((notification) => ({
      id: `notification-${notification.id}`,
      icon: notification.type === 'warning' ? 'ti-alert-triangle' : 'ti-bell',
      title: notification.message,
      meta: 'إشعار جديد',
      badge: 'جديد',
      tone: notification.type === 'warning' ? 'urgent' : '',
      to: '/app/announcements',
    })),
  ]

  function toggleChild(uid) {
    setSelectedChildren((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      // إنشاء الحساب صار عبر Worker موثوق (worker/) بدل المتصفح مباشرة — بيتحقق من هوية
      // المدير، وبيتراجع تلقائيًا لو فشلت كتابة الملف الشخصي بعد نجاح إنشاء حساب Auth
      // (Bug 2.1، MASAR_CRITICAL_BUGS_DETAILED_AR.md). راجع worker/README.md للنشر.
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_ADMIN_OPS_WORKER_URL}/create-school-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          childUids: role === 'parent' ? selectedChildren : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(translateWorkerError(data))
        return
      }

      const roleLabel = role === 'instructor' ? 'المعلّم' : role === 'parent' ? 'ولي الأمر' : 'الطالب'
      setSuccess(`تم إنشاء حساب ${roleLabel} بنجاح.`)
      setName('')
      setEmail('')
      setPassword('')
      setRole('student')
      setSelectedChildren([])
    } catch (err) {
      console.error('[إنشاء حساب] خطأ غير متوقع:', err)
      setError('صار خطأ غير متوقع. تأكد من اتصالك بالإنترنت وحاول مرة ثانية.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAccountAction(user, action) {
    if (action === 'deactivate' && !window.confirm(`تعطيل حساب ${user.name}؟ لن يستطيع الدخول حتى تفعّله من جديد.`)) return
    setError('')
    setSuccess('')
    setTemporaryCredential(null)
    setAccountActionUid(user.id)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_ADMIN_OPS_WORKER_URL}/update-school-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: user.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(translateWorkerError(data))
        return
      }
      if (action === 'reset-password') {
        setTemporaryCredential({ email: user.email, password: data.temporaryPassword })
        setSuccess('تم إصدار كلمة سر مؤقتة. سلّمها للمستخدم بأمان وسيُطلب منه تغييرها عند الدخول.')
      } else {
        setSuccess(action === 'deactivate' ? 'تم تعطيل الحساب.' : 'تم تفعيل الحساب.')
      }
    } catch (err) {
      console.error('[إدارة الحساب] خطأ غير متوقع:', err)
      setError('صار خطأ غير متوقع. تأكد من اتصالك بالإنترنت وحاول مرة ثانية.')
    } finally {
      setAccountActionUid(null)
    }
  }

  const readinessSteps = [
    { label: 'السنة الدراسية', done: Boolean(currentAcademicYear) },
    { label: 'الصفوف والشعب', done: grades.length > 0 && sections.length > 0 },
    { label: 'الطلاب', done: students.length > 0 },
    { label: 'ربط الطلاب بالشعب', done: students.length > 0 && studentsWithoutSection.length === 0 },
    { label: 'المواد والمعلمون', done: subjects.length > 0 && subjectsWithoutTeacher.length === 0 },
    { label: 'خدمة الحسابات', done: Boolean(import.meta.env.VITE_ADMIN_OPS_WORKER_URL) },
  ]
  const readyCount = readinessSteps.filter((step) => step.done).length
  const readinessPercent = Math.round((readyCount / readinessSteps.length) * 100)

  return (
    <div>
      <div className="eyebrow">لوحة إدارة المدرسة</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>نظرة عامة على المدرسة</h2>

      <TaskCenter
        title="مركز مهام الإدارة"
        subtitle={unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء وعمليات تشغيلية تحتاج متابعة.` : 'ابدأ من الإجراء الذي يجهّز مدرستك للعمل اليومي.'}
        tasks={adminTasks}
        actions={[
          { icon: 'ti-user-plus', label: 'إضافة مستخدم', to: '/app/admin' },
          { icon: 'ti-building-community', label: 'هيكل المدرسة', to: '/app/school-structure' },
          { icon: 'ti-calendar-week', label: 'الجدول', to: '/app/timetable' },
          { icon: 'ti-calendar-stats', label: 'التغطية', to: '/app/admin/schedule' },
        ]}
        emptyText="لا توجد مهام عاجلة. راجع المؤشرات أو أنشئ حسابًا جديدًا عند الحاجة."
      />

      <div className="panel" style={{ marginTop: '16px' }} aria-label="مؤشر جاهزية المدرسة">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '4px' }}>مؤشر التفعيل</div>
            <strong>{readyCount} من {readinessSteps.length} خطوات مكتملة</strong>
          </div>
          <strong style={{ color: readinessPercent === 100 ? 'var(--pine)' : 'var(--sunset)' }}>{readinessPercent}%</strong>
        </div>
        <div
          role="progressbar"
          aria-valuenow={readinessPercent}
          aria-valuemin="0"
          aria-valuemax="100"
          style={{ height: '8px', margin: '12px 0', borderRadius: '99px', background: 'var(--paper-deep)', overflow: 'hidden' }}
        >
          <div style={{ width: `${readinessPercent}%`, height: '100%', background: readinessPercent === 100 ? 'var(--pine)' : 'var(--sunset)', transition: 'width 180ms ease' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '12px', color: 'var(--ink-soft)' }}>
          {readinessSteps.map((step) => <span key={step.label}><i className={`ti ${step.done ? 'ti-circle-check' : 'ti-circle-x'}`} /> {step.label}</span>)}
        </div>
      </div>

      <div className="owner-stats-grid">
        <div className="owner-stat-card">
          <i className="ti ti-books" />
          <div className="owner-stat-value">{subjects.length}</div>
          <div className="owner-stat-label">مادة</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-chalkboard" />
          <div className="owner-stat-value">{instructorCount}</div>
          <div className="owner-stat-label">معلّم</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-users" />
          <div className="owner-stat-value">{studentCount}</div>
          <div className="owner-stat-label">طالب</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-user-heart" />
          <div className="owner-stat-value">{parentCount}</div>
          <div className="owner-stat-label">ولي أمر</div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: '32px' }}>إدارة المستخدمين</div>
      <h2 className="page-title" style={{ marginBottom: '20px', fontSize: '20px' }}>
        أنشئ حساب معلّم، طالب، أو ولي أمر
      </h2>

      <form className="panel" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="admin-name">الاسم</label>
          <input id="admin-name" type="text" placeholder="اسم المستخدم الكامل" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="admin-email">البريد الإلكتروني</label>
          <input id="admin-email" type="email" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="admin-password">كلمة السر</label>
          <input id="admin-password" type="password" placeholder="6 أحرف على الأقل" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>

        <div className="field">
          <label htmlFor="admin-role">الدور</label>
          <select id="admin-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">طالب</option>
            <option value="instructor">معلّم</option>
            <option value="parent">ولي أمر</option>
          </select>
        </div>

        {role === 'parent' && (
          <div className="field">
            <label>اختار أبناءه (طالب أو أكثر)</label>
            {students.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>ما في طلاب مسجّلين بعد. أضف طالب أول.</p>
            ) : (
              <div className="children-checklist">
                {students.map((s) => (
                  <label key={s.id} className="child-check-row">
                    <input type="checkbox" checked={selectedChildren.includes(s.id)} onChange={() => toggleChild(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}
        {success && (
          <p style={{ color: 'var(--pine)', fontSize: '13px', margin: '0 0 14px' }}>
            <i className="ti ti-check" /> {success}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-user-plus" /> إنشاء الحساب</>)}
        </button>
      </form>

      {temporaryCredential && (
        <div className="panel" style={{ maxWidth: '520px', marginTop: '16px', borderColor: 'var(--sunset)' }}>
          <strong><i className="ti ti-key" /> بيانات مؤقتة — تظهر الآن فقط</strong>
          <p style={{ margin: '8px 0 0', fontSize: '13px' }}>البريد: {temporaryCredential.email}</p>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>كلمة السر: <code>{temporaryCredential.password}</code></p>
          <button type="button" className="btn" style={{ marginTop: '8px', width: 'auto' }} onClick={() => setTemporaryCredential(null)}>
            <i className="ti ti-eye-off" /> أخفيها
          </button>
        </div>
      )}

      <div className="eyebrow" style={{ marginTop: '32px' }}>كل المستخدمين</div>
      <h2 className="page-title" style={{ marginBottom: '16px', fontSize: '20px' }}>قائمة الحسابات المسجّلة</h2>

      <div className="users-list">
        {users.map((u) => (
          <div className="users-row" key={u.id}>
            <div className="avatar-mini" style={{ background: roleColor(u.role) }}>
              {u.name?.trim().charAt(0) || '؟'}
            </div>
            <div className="users-info">
              <div className="users-name">{u.name}</div>
              <div className="users-email">{u.email}</div>
              {u.role === 'parent' && u.childUids?.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>
                  الأبناء: {u.childUids.map((cid) => users.find((x) => x.id === cid)?.name || '؟').join('، ')}
                </div>
              )}
              {u.role === 'student' && (
                <div style={{ fontSize: '11px', marginTop: '2px', color: u.parentUids?.length > 0 ? 'var(--ink-faint)' : 'var(--berry)' }}>
                  {u.parentUids?.length > 0
                    ? `ولي الأمر: ${u.parentUids.map((pid) => users.find((x) => x.id === pid)?.name || '؟').join('، ')}`
                    : 'ما في ولي أمر مرتبط — ما رح توصله إشعارات'}
                  {' · '}
                  <Link to={`/app/admin/students/${u.id}`}>عرض الملف</Link>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="tag" style={{ background: roleColor(u.role) + '22', color: roleColor(u.role) }}>
                {roleLabel(u.role)}
              </span>
              {u.role !== 'admin' && (
                <>
                  <span className="tag" style={{ background: (u.status === 'inactive' ? 'var(--berry)' : 'var(--pine)') + '22', color: u.status === 'inactive' ? 'var(--berry)' : 'var(--pine)' }}>
                    {u.status === 'inactive' ? 'معطّل' : 'نشط'}
                  </span>
                  <button type="button" className="btn" style={{ width: 'auto', padding: '5px 8px', fontSize: '11px' }} disabled={accountActionUid === u.id} onClick={() => handleAccountAction(u, u.status === 'inactive' ? 'activate' : 'deactivate')}>
                    {accountActionUid === u.id ? <i className="ti ti-loader-2 spin" /> : <i className={`ti ${u.status === 'inactive' ? 'ti-user-check' : 'ti-user-off'}`} />}
                    {u.status === 'inactive' ? 'تفعيل' : 'تعطيل'}
                  </button>
                  {u.status !== 'inactive' && (
                    <button type="button" className="btn" style={{ width: 'auto', padding: '5px 8px', fontSize: '11px' }} disabled={accountActionUid === u.id} onClick={() => handleAccountAction(u, 'reset-password')}>
                      <i className="ti ti-key" /> إعادة كلمة السر
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'admin') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}

function roleColor(role) {
  if (role === 'instructor') return 'var(--pine)'
  if (role === 'admin') return 'var(--sunset)'
  if (role === 'parent') return 'var(--sky)'
  return 'var(--berry)'
}

function translateWorkerError(data) {
  if (data?.error === 'auth_error') {
    const msg = data.message || ''
    if (msg.startsWith('EMAIL_EXISTS')) return 'هاد البريد مسجّل من قبل.'
    if (msg.startsWith('INVALID_EMAIL')) return 'صيغة البريد الإلكتروني مو صحيحة.'
    if (msg.startsWith('WEAK_PASSWORD')) return 'كلمة السر لازم تكون 6 أحرف على الأقل.'
    return 'صار خطأ بإنشاء الحساب. جرب مرة ثانية.'
  }
  if (data?.error === 'invalid_input') return data.message || 'بيانات غير صالحة.'
  if (data?.error === 'permission_denied') return 'ما عندك صلاحية تنشئ حسابات لهاي المدرسة.'
  if (data?.error === 'unauthenticated') return 'انتهت الجلسة، سجّل دخول من جديد.'
  return 'صار خطأ غير متوقع. جرب مرة ثانية.'
}
