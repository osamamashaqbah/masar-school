import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useNotifications } from '../context/NotificationContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useConnectionStatus } from '../utils/useConnectionStatus'
import { getAvatar } from '../utils/avatars'
import { isRamadan } from '../utils/hijriDate'
import ConsentGate from './ConsentGate'

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'admin') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}
function mobileLabel(link) {
  const labels = {
    '/app/admin': 'الإدارة',
    '/app/school-structure': 'الهيكل',
    '/app/timetable': 'الجدول',
    '/app/instructor': 'المعلّم',
    '/app/parent-dashboard': 'أبنائي',
    '/app/dashboard': 'لوحتي',
    '/app/grades': 'درجاتي',
    '/app/messages': 'الرسائل',
    '/app/announcements': 'الإعلانات',
  }
  return labels[link.to] || link.label
}
function notifIcon(type) {
  const map = {
    success: 'ti-circle-check', error: 'ti-circle-x', request: 'ti-user-circle', info: 'ti-info-circle',
    grade: 'ti-certificate', attendance: 'ti-calendar-event', warning: 'ti-alert-triangle', homework: 'ti-clipboard-list',
    feedback: 'ti-message-report', schedule: 'ti-calendar-event',
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

const instructorLinkGroups = [
  {
    label: 'التدريس',
    links: [
      { to: '/app/instructor', icon: 'ti-layout-grid', label: 'نظرة عامة' },
      { to: '/app/instructor/lessons', icon: 'ti-plus', label: 'إضافة دروس' },
      { to: '/app/instructor/materials', icon: 'ti-paperclip', label: 'مرفقات إضافية' },
      { to: '/app/instructor/notes', icon: 'ti-notes', label: 'ملاحظات الدروس' },
    ],
  },
  {
    label: 'التقييم',
    links: [
      { to: '/app/instructor/homework', icon: 'ti-clipboard-list', label: 'الواجبات' },
      { to: '/app/instructor/grade-homework', icon: 'ti-checkbox', label: 'تقييم الواجبات' },
      { to: '/app/instructor/manual-grades', icon: 'ti-certificate', label: 'الدرجات اليدوية' },
      { to: '/app/instructor/analytics', icon: 'ti-chart-bar', label: 'دفتر الدرجات' },
    ],
  },
  {
    label: 'المتابعة',
    links: [
      { to: '/app/instructor/attendance', icon: 'ti-calendar-check', label: 'الحضور والغياب' },
      { to: '/app/instructor/questions', icon: 'ti-message-question', label: 'أسئلة الطلاب' },
    ],
  },
  {
    label: 'أدوات متقدمة',
    links: [
      { to: '/app/exams', icon: 'ti-clipboard-list', label: 'مركز الاختبارات' },
      { to: '/app/instructor/question-bank', icon: 'ti-database', label: 'بنك الأسئلة' },
    ],
  },
]


// روابط إدارية ثانوية — مجمّعة بقائمة منسدلة وحدة بدل ما تاخذ مكان لحالها بشريط التنقّل
function buildAdminToolLinks(features) {
  const links = []
  if (features.honorBoards !== false) links.push({ to: '/app/admin/insights', icon: 'ti-award', label: 'لوحات الشرف' })
  if (features.feedback === true) links.push({ to: '/app/admin/feedback', icon: 'ti-message-report', label: 'الملاحظات والمتابعة' })
  if (features.scheduleOps !== false) links.push({ to: '/app/admin/schedule', icon: 'ti-calendar-stats', label: 'التعارضات والتغطية' })
  links.push({ to: '/app/instructor/question-bank', icon: 'ti-database', label: 'بنك الأسئلة' })
  links.push({ to: '/app/admin/rollover', icon: 'ti-calendar-event', label: 'سنة دراسية جديدة' })
  links.push({ to: '/app/admin/audit-log', icon: 'ti-history', label: 'سجل التدقيق' })
  links.push({ to: '/app/admin/export', icon: 'ti-download', label: 'تصدير البيانات' })
  return links
}

export default function Layout() {
  const { session, logout, authLoading } = useSession()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const { features, ramadanSchedule, branding, schoolName } = useSchoolStructure()
  const { online, syncing } = useConnectionStatus()
  const showRamadanBanner = ramadanSchedule.enabled && isRamadan()
  const location = useLocation()

  const [notifOpen, setNotifOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const navRef = useRef(null)

  useEffect(() => {
    document.title = branding?.platformName || schoolName || 'مسار'
    if (branding?.logoUrl) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = branding.logoUrl
    }
  }, [branding, schoolName])

  // إغلاق أي قائمة منسدلة عند تغيير الصفحة
  useEffect(() => {
    setNotifOpen(false)
    setSheetOpen(false)
  }, [location.pathname])

  // إغلاق القوائم عند الضغط خارجها
  useEffect(() => {
    function onDocClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setNotifOpen(false)
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
  const adminToolLinks = session.role === 'admin' ? buildAdminToolLinks(features) : []
  function handleNotifClick(n) { if (!n.read) markAsRead(n.id) }

  const navClass = ({ isActive }) => 'nav-pill' + (isActive ? ' active' : '')

  const roleLinks = []
  if (features.announcements !== false) roleLinks.push({ to: '/app/announcements', icon: 'ti-speakerphone', label: 'الإعلانات' })
  if (session.role === 'parent') {
    roleLinks.push({ to: '/app/parent-dashboard', icon: 'ti-user-heart', label: 'متابعة أبنائي' })
    if (features.messaging !== false) roleLinks.push({ to: '/app/messages', icon: 'ti-message-circle', label: 'الرسائل' })
    if (features.feedback === true) roleLinks.push({ to: '/app/feedback', icon: 'ti-message-report', label: 'الملاحظات والمتابعة' })
  }
  if (session.role === 'instructor') {
    if (features.messaging !== false) roleLinks.push({ to: '/app/messages', icon: 'ti-message-circle', label: 'الرسائل' })
    if (features.feedback === true) roleLinks.push({ to: '/app/feedback', icon: 'ti-message-report', label: 'الملاحظات والمتابعة' })
  }
  if (session.role === 'student') {
    roleLinks.push({ to: '/app/dashboard', icon: 'ti-route', label: 'لوحتي' })
    roleLinks.push({ to: '/app/grades', icon: 'ti-certificate', label: 'درجاتي' })
    roleLinks.push({ to: '/app/timetable', icon: 'ti-calendar-week', label: 'جدولي' })
    if (features.examCenter !== false) roleLinks.push({ to: '/app/exams', icon: 'ti-clipboard-list', label: 'الاختبارات' })
  }
  if (session.role === 'parent') {
    roleLinks.push({ to: '/app/timetable', icon: 'ti-calendar-week', label: 'جدول أبنائي' })
    if (features.examCenter !== false) roleLinks.push({ to: '/app/exams', icon: 'ti-clipboard-list', label: 'الاختبارات' })
  }
  if (session.role === 'admin') {
    roleLinks.push({ to: '/app/admin', icon: 'ti-user-cog', label: 'إدارة المستخدمين' })
    roleLinks.push({ to: '/app/school-structure', icon: 'ti-building-community', label: 'هيكل المدرسة' })
    roleLinks.push({ to: '/app/timetable', icon: 'ti-calendar-week', label: 'جدول الحصص' })
    if (features.examCenter !== false) roleLinks.push({ to: '/app/exams', icon: 'ti-clipboard-list', label: 'مركز الاختبارات' })
  }

  const primaryTargets = {
    student: ['/app/dashboard', '/app/grades', '/app/timetable'],
    parent: ['/app/parent-dashboard', '/app/messages', '/app/timetable'],
    instructor: ['/app/instructor', '/app/messages', '/app/announcements'],
    admin: ['/app/admin', '/app/school-structure', '/app/timetable'],
  }[session.role] || []
  const instructorLinks = instructorLinkGroups.flatMap((group) => group.links)
  const mobileCandidates = [
    ...roleLinks,
    ...(session.role === 'instructor' ? instructorLinks : []),
    ...(session.role === 'admin' ? adminToolLinks : []),
    { to: '/app/settings', icon: 'ti-settings', label: 'الإعدادات' },
  ]
  const mobilePrimaryLinks = primaryTargets
    .map((to) => mobileCandidates.find((link) => link.to === to))
    .filter(Boolean)
  const mobileSecondaryLinks = mobileCandidates.filter((link, index) => (
    !primaryTargets.includes(link.to)
    && mobileCandidates.findIndex((candidate) => candidate.to === link.to) === index
  ))
  const mobileToolGroups = [{ label: 'كل الأدوات', links: mobileSecondaryLinks }]
  const mobileSheetTitle = session.role === 'admin' ? 'أدوات الإدارة' : session.role === 'instructor' ? 'أدوات المعلّم' : 'المزيد'
  const mobileSheetIcon = session.role === 'admin' ? 'ti-adjustments' : session.role === 'instructor' ? 'ti-chalkboard' : 'ti-dots'

  const notifPopover = notifOpen && (
    <div className="notif-popover">
      <div className="notif-popover-header">
        <span>الإشعارات</span>
        {unreadCount > 0 && <button className="mark-all-read-btn" onClick={markAllAsRead}>تحديد الكل كمقروء</button>}
      </div>
      <div className="notif-popover-list">
        {notifications.length === 0 ? <p className="notif-empty">ما في إشعارات بعد.</p> : (
          notifications.slice(0, 20).map((n) => (
            <button type="button" key={n.id} className={`notif-item-clean${!n.read ? ' unread' : ''}`} onClick={() => handleNotifClick(n)}>
              <i className={`ti ${notifIcon(n.type)} notif-item-icon ${n.type}`} />
              <div className="notif-item-body">
                <div className="notif-item-text">{n.message}</div>
                <div className="notif-time">{timeAgo(n.createdAt)}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">تخطي إلى المحتوى</a>
      <ConsentGate />
      {showRamadanBanner && (
        <div className="ramadan-banner">
          <i className="ti ti-moon-stars" /> رمضان كريم — دوام اليوم مختصر
          {ramadanSchedule.shortDayHours ? ` (${ramadanSchedule.shortDayHours} ساعات)` : ''}
        </div>
      )}
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
          <div className="brand-mark">
            {branding?.logoUrl ? <img src={branding.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <i className="ti ti-school" />}
          </div>
          <div className="brand-text">
            <div className="brand-name">{branding?.platformName || 'مسار'}</div>
            <div className="brand-tagline">منصة مدرسية</div>
          </div>
        </div>

        <nav className="topnav-links" aria-label="التنقل الرئيسي">
          <div className="topnav-links-scroll">
            {roleLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass} title={l.label}>
                <i className={`ti ${l.icon}`} /> <span>{l.label}</span>
              </NavLink>
            ))}
          </div>

          {session.role === 'instructor' && instructorLinkGroups.map((group) => (
            <div className="sidebar-link-group" key={group.label}>
              <div className="sidebar-link-group-label">{group.label}</div>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.to === '/app/instructor'} className={navClass} title={link.label}>
                  <i className={`ti ${link.icon}`} /> <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          {session.role === 'admin' && (
            <div className="sidebar-link-group">
              <div className="sidebar-link-group-label">أدوات الإدارة</div>
              {adminToolLinks.map((link) => (
                <NavLink key={link.to} to={link.to} className={navClass} title={link.label}>
                  <i className={`ti ${link.icon}`} /> <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          <NavLink to="/app/settings" className={navClass} title="الإعدادات">
            <i className="ti ti-settings" /> <span>الإعدادات</span>
          </NavLink>
        </nav>

        <div className="topnav-actions">
          {!online && (
            <span className="icon-btn" style={{ color: 'var(--berry)' }} title="غير متصل بالإنترنت — بتشتغل بالبيانات المحفوظة محليًا">
              <i className="ti ti-wifi-off" />
            </span>
          )}
          {online && syncing && (
            <span className="icon-btn" title="رجع النت — عم تنطبّر أي عملية كانت معلّقة">
              <i className="ti ti-refresh spin" />
            </span>
          )}
          <div className="nav-dropdown-wrap">
            <button
              className={`icon-btn notif-bell${unreadCount > 0 ? ' has-unread' : ''}`}
              onClick={() => setNotifOpen((o) => !o)}
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
              <span className="user-chip-role"><i className="ti ti-shield-check" /> {roleLabel(session.role)}</span>
            </div>
          </div>

          <button className="icon-btn logout-btn" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <i className="ti ti-logout" />
          </button>
        </div>
      </header>

      <main className="main" id="main-content" tabIndex="-1">
        <div key={location.pathname} className="page-transition"><Outlet /></div>
      </main>

      {/* شريط تنقّل سفلي للشاشات الصغيرة */}
      <nav className="bottomnav" aria-label="التنقل على الهاتف">
        {mobilePrimaryLinks.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => 'bottomnav-item' + (isActive ? ' active' : '')}>
            <i className={`ti ${l.icon}`} />
            <span>{mobileLabel(l)}</span>
          </NavLink>
        ))}

        <button
          className={`bottomnav-item${mobileSecondaryLinks.some((link) => location.pathname === link.to) ? ' active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label={mobileSheetTitle}
        >
          <i className={`ti ${mobileSheetIcon}`} />
          <span>المزيد</span>
        </button>
      </nav>

      {/* لوحة سفلية منزلقة بروابط المعلّم على الموبايل */}
      {sheetOpen && (
        <>
          <div className="sheet-overlay" onClick={() => setSheetOpen(false)} />
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title">
              <i className={`ti ${mobileSheetIcon}`} />
              {mobileSheetTitle}
            </div>
            <div className="sheet-groups">
              {mobileToolGroups.map((group) => (
                <div className="sheet-group" key={group.label}>
                  <div className="sheet-group-label">{group.label}</div>
                  <div className="sheet-grid">
                    {group.links.map((link, idx) => (
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
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
