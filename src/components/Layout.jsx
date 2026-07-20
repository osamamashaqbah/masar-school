import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useNotifications } from '../context/NotificationContext'
import { getAvatar } from '../utils/avatars'

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'owner') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}
function notifIcon(type) {
  const map = {
    success: 'ti-circle-check', error: 'ti-circle-x', request: 'ti-user-circle', info: 'ti-info-circle',
    grade: 'ti-certificate', attendance: 'ti-calendar-event', warning: 'ti-alert-triangle', homework: 'ti-clipboard-list',
  }
  return map[type] || 'ti-bell'
}
function timeAgo(ts) {
  if (!ts?.toDate) return ''
  const s = Math.floor((Date.now() - ts.toDate().getTime()) / 1000)
  if (s < 60) return 'الآن'
  const m = Math.floor(s / 60); if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.floor(m / 60); if (h < 24) return `قبل ${h} ساعة`
  const d = Math.floor(h / 24); if (d < 7) return `قبل ${d} يوم`
  return ts.toDate().toLocaleDateString('ar-EG', { dateStyle: 'short' })
}

const instructorLinks = [
  { to: '/app/instructor', icon: 'ti-layout-grid', label: 'نظرة عامة' },
  { to: '/app/instructor/lessons', icon: 'ti-plus', label: 'إضافة دروس' },
  { to: '/app/instructor/materials', icon: 'ti-paperclip', label: 'مرفقات إضافية' },
  { to: '/app/instructor/homework', icon: 'ti-clipboard-list', label: 'الواجبات' },
  { to: '/app/instructor/notes', icon: 'ti-notes', label: 'ملاحظات الدروس' },
  { to: '/app/instructor/analytics', icon: 'ti-chart-bar', label: 'دفتر الدرجات' },
  { to: '/app/instructor/questions', icon: 'ti-message-question', label: 'أسئلة الطلاب' },
  { to: '/app/instructor/grade-homework', icon: 'ti-checkbox', label: 'تقييم الواجبات' },
  { to: '/app/instructor/manual-grades', icon: 'ti-certificate', label: 'الدرجات اليدوية' },
  { to: '/app/instructor/attendance', icon: 'ti-calendar-check', label: 'الحضور والغياب' },
]

export default function Layout() {
  const { session, logout, authLoading } = useSession()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const location = useLocation()

  const [notifOpen, setNotifOpen] = useState(false)
  const [instructorOpen, setInstructorOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const navRef = useRef(null)

  // إغلاق أي قائمة منسدلة عند تغيير الصفحة
  useEffect(() => {
    setNotifOpen(false)
    setInstructorOpen(false)
    setSheetOpen(false)
  }, [location.pathname])

  // إغلاق القوائم عند الضغط خارجها
  useEffect(() => {
    function onDocClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setNotifOpen(false)
        setInstructorOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocClick)
    return () => document.removeEventListener('pointerdown', onDocClick)
  }, [])

  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <i className="ti ti-loader-2 spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/" replace />

  const myAvatar = getAvatar(session.avatarId)
  const isInstructorPath = location.pathname.startsWith('/app/instructor')

  function handleNotifClick(n) { if (!n.read) markAsRead(n.id) }

  const navClass = ({ isActive }) => 'nav-pill' + (isActive ? ' active' : '')

  const roleLinks = []
  if (session.role === 'parent') roleLinks.push({ to: '/app/parent-dashboard', icon: 'ti-user-heart', label: 'متابعة أبنائي' })
  if (session.role === 'student') {
    roleLinks.push({ to: '/app/dashboard', icon: 'ti-route', label: 'لوحتي' })
    roleLinks.push({ to: '/app/grades', icon: 'ti-certificate', label: 'درجاتي' })
  }
  if (session.role === 'owner') {
    roleLinks.push({ to: '/app/admin', icon: 'ti-user-cog', label: 'إدارة المستخدمين' })
    roleLinks.push({ to: '/app/school-structure', icon: 'ti-building-community', label: 'هيكل المدرسة' })
  }

  const notifPopover = notifOpen && (
    <div className="notif-popover">
      <div className="notif-popover-header">
        <span>الإشعارات</span>
        {unreadCount > 0 && <button className="mark-all-read-btn" onClick={markAllAsRead}>تحديد الكل كمقروء</button>}
      </div>
      <div className="notif-popover-list">
        {notifications.length === 0 ? <p className="notif-empty">ما في إشعارات بعد.</p> : (
          notifications.slice(0, 20).map((n) => (
            <div key={n.id} className={`notif-item-clean${!n.read ? ' unread' : ''}`} onClick={() => handleNotifClick(n)}>
              <i className={`ti ${notifIcon(n.type)} notif-item-icon ${n.type}`} />
              <div className="notif-item-body">
                <div className="notif-item-text">{n.message}</div>
                <div className="notif-time">{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="app">
      {/* الخلفية الحيّة: شفق دوّار + كرات ضوء + شبكة نقاط */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-aurora" />
        <div className="bg-orb orb-1" />
        <div className="bg-orb orb-2" />
        <div className="bg-orb orb-3" />
        <div className="bg-grid" />
      </div>

      <header className="topnav" ref={navRef}>
        <div className="brand">
          <div className="brand-mark"><i className="ti ti-school" /></div>
          <div className="brand-name">مسار</div>
        </div>

        <nav className="topnav-links">
          {roleLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              <i className={`ti ${l.icon}`} /> <span>{l.label}</span>
            </NavLink>
          ))}

          {session.role === 'instructor' && (
            <div className="nav-dropdown-wrap">
              <button
                className={`nav-pill dropdown-toggle${isInstructorPath ? ' active' : ''}${instructorOpen ? ' open' : ''}`}
                onClick={() => { setInstructorOpen((o) => !o); setNotifOpen(false) }}
              >
                <i className="ti ti-chalkboard" /> <span>لوحة المعلّم</span>
                <i className="ti ti-chevron-down dropdown-chevron" />
              </button>
              {instructorOpen && (
                <div className="nav-dropdown">
                  {instructorLinks.map((link, idx) => (
                    <NavLink
                      key={link.to} to={link.to} end={link.to === '/app/instructor'}
                      style={{ animationDelay: `${idx * 28}ms` }}
                      className={({ isActive }) => 'dropdown-item' + (isActive ? ' active' : '')}
                    >
                      <i className={`ti ${link.icon}`} /> {link.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          <NavLink to="/app/settings" className={navClass}>
            <i className="ti ti-settings" /> <span>الإعدادات</span>
          </NavLink>
        </nav>

        <div className="topnav-actions">
          <div className="nav-dropdown-wrap">
            <button
              className={`icon-btn notif-bell${unreadCount > 0 ? ' has-unread' : ''}`}
              onClick={() => { setNotifOpen((o) => !o); setInstructorOpen(false) }}
              aria-label="الإشعارات"
            >
              <i className="ti ti-bell" />
              {unreadCount > 0 && <span className="notif-dot">{unreadCount}</span>}
            </button>
            {notifPopover}
          </div>

          <div className="user-chip">
            <div className="avatar-mini" style={myAvatar ? { background: myAvatar.bg } : undefined}>
              {myAvatar ? myAvatar.emoji : (session.name.trim().charAt(0) || '؟')}
            </div>
            <div className="user-chip-text">
              <span className="user-chip-name">{session.name}</span>
              <span className="user-chip-role">{roleLabel(session.role)}</span>
            </div>
          </div>

          <button className="icon-btn logout-btn" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <i className="ti ti-logout" />
          </button>
        </div>
      </header>

      <main className="main">
        <div key={location.pathname} className="page-transition"><Outlet /></div>
      </main>

      {/* شريط تنقّل سفلي للشاشات الصغيرة */}
      <nav className="bottomnav">
        {roleLinks.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => 'bottomnav-item' + (isActive ? ' active' : '')}>
            <i className={`ti ${l.icon}`} />
            <span>{l.label.split(' ')[0] === 'متابعة' ? 'أبنائي' : l.label.split(' ').slice(-1)[0]}</span>
          </NavLink>
        ))}

        {session.role === 'instructor' && (
          <button
            className={`bottomnav-item${isInstructorPath ? ' active' : ''}`}
            onClick={() => setSheetOpen(true)}
          >
            <i className="ti ti-chalkboard" />
            <span>المعلّم</span>
          </button>
        )}

        <NavLink to="/app/settings" className={({ isActive }) => 'bottomnav-item' + (isActive ? ' active' : '')}>
          <i className="ti ti-settings" />
          <span>الإعدادات</span>
        </NavLink>
      </nav>

      {/* لوحة سفلية منزلقة بروابط المعلّم على الموبايل */}
      {sheetOpen && (
        <>
          <div className="sheet-overlay" onClick={() => setSheetOpen(false)} />
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title"><i className="ti ti-chalkboard" /> لوحة المعلّم</div>
            <div className="sheet-grid">
              {instructorLinks.map((link, idx) => (
                <NavLink
                  key={link.to} to={link.to} end={link.to === '/app/instructor'}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  className={({ isActive }) => 'sheet-item' + (isActive ? ' active' : '')}
                >
                  <i className={`ti ${link.icon}`} />
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
