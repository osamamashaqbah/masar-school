import { useState } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useNotifications } from '../context/NotificationContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'owner') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}
function notifIcon(type) {
  const map = { success: 'ti-circle-check', error: 'ti-circle-x', request: 'ti-user-circle', info: 'ti-info-circle' }
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

export default function Layout() {
  const { session, logout } = useSession()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const { subjects } = useSchoolStructure()
  const location = useLocation()

  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [instructorMenuOpen, setInstructorMenuOpen] = useState(location.pathname.startsWith('/app/instructor'))

  if (!session) return <Navigate to="/" replace />

  function closeMenu() { setMenuOpen(false) }
  function handleNotifClick(n) { if (!n.read) markAsRead(n.id) }

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

  return (
    <div className="app">
      <div className="mesh-bg" aria-hidden="true">
        <div className="aurora-ring" />
        <div className="mesh-blob" />
        <div className="mesh-blob" />
        <div className="mesh-blob" />
      </div>
      <button className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><i className="ti ti-menu-2" /></button>
      {menuOpen && <div className="sidebar-overlay" onClick={closeMenu} />}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand"><div className="brand-mark"><i className="ti ti-school" /></div><div className="brand-name">مسار</div></div>
          <button className="mobile-close-btn" onClick={closeMenu} aria-label="إغلاق"><i className="ti ti-x" /></button>
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`nav-item notif-bell-row${unreadCount > 0 ? ' has-unread' : ''}`} onClick={() => setNotifOpen((o) => !o)}>
            <i className="ti ti-bell" /> الإشعارات
            {unreadCount > 0 && <span className="pending-count-badge">{unreadCount}</span>}
          </button>
          {notifOpen && (
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
          )}
        </div>

       {session.role === 'parent' ? (
          <NavLink to="/app/parent-dashboard" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <i className="ti ti-user-heart" /> متابعة أبنائي
          </NavLink>
        ) : session.role === 'student' ? (
          <NavLink to="/app/dashboard" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <i className="ti ti-route" /> لوحتي
          </NavLink>
        ) : null}
        {session.role === 'student' && (
          <NavLink to="/app/grades" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <i className="ti ti-certificate" /> درجاتي
          </NavLink>
        )}

        {session.role === 'owner' && (
          <>
            <NavLink to="/app/admin" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <i className="ti ti-user-cog" /> إدارة المستخدمين
            </NavLink>
            <NavLink to="/app/school-structure" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <i className="ti ti-building-community" /> هيكل المدرسة
            </NavLink>
          </>
        )}

        {session.role === 'instructor' && (
          <>
            <button className="nav-item instructor-menu-toggle" onClick={() => setInstructorMenuOpen((o) => !o)}>
              <i className="ti ti-chalkboard" /> لوحة المعلّم
              <i className={`ti ti-chevron-down instructor-menu-chevron${instructorMenuOpen ? ' open' : ''}`} />
            </button>
            {instructorMenuOpen && (
              <div className="instructor-submenu">
                {instructorLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.to === '/app/instructor'} onClick={closeMenu} className={({ isActive }) => 'nav-item nav-subitem' + (isActive ? ' active' : '')}>
                    <i className={`ti ${link.icon}`} /> {link.label}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}

        <NavLink to="/app/settings" onClick={closeMenu} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <i className="ti ti-settings" /> الإعدادات
        </NavLink>

        <div className="sidebar-footer">
          <div className="avatar-mini">{session.name.trim().charAt(0) || '؟'}</div>
          <span>{session.name} · {roleLabel(session.role)}</span>
          <button className="logout-btn" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج"><i className="ti ti-logout" /></button>
        </div>
      </aside>

      <main className="main">
        <div key={location.pathname} className="page-transition"><Outlet /></div>
      </main>
    </div>
  )
}