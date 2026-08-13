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
  const { subjects } = useSchoolStructure()
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
  const adminTasks = [
    ...(students.length === 0 ? [{
      id: 'first-student', icon: 'ti-user-plus', title: 'أضف أول طالب للمدرسة', meta: 'لا توجد حسابات طلاب بعد', badge: 'ابدأ هنا', tone: 'urgent', to: '/app/admin',
    }] : []),
    ...(subjects.length === 0 ? [{
      id: 'first-subject', icon: 'ti-books', title: 'أضف مواد وشعب المدرسة', meta: 'أنشئ هيكلًا دراسيًا لتبدأ المتابعة', badge: 'إعداد', tone: 'soon', to: '/app/school-structure',
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
            <span className="tag" style={{ background: roleColor(u.role) + '22', color: roleColor(u.role) }}>
              {roleLabel(u.role)}
            </span>
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