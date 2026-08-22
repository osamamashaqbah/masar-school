const ROLE_HOME = {
  admin: '/app/admin',
  instructor: '/app/instructor',
  parent: '/app/parent-dashboard',
  student: '/app/dashboard',
}

const ROUTE_POLICIES = [
  { prefix: '/app/settings', roles: ['admin', 'instructor', 'parent', 'student'] },
  { prefix: '/app/admin/feedback', roles: ['admin'], feature: 'feedback' },
  { prefix: '/app/admin/schedule', roles: ['admin'], feature: 'scheduleOps' },
  { prefix: '/app/admin/insights', roles: ['admin'], feature: 'honorBoards' },
  { prefix: '/app/admin', roles: ['admin'] },
  { prefix: '/app/school-structure', roles: ['admin'] },
  { prefix: '/app/instructor/question-bank', roles: ['admin', 'instructor'] },
  { prefix: '/app/instructor', roles: ['instructor'] },
  { prefix: '/app/parent-dashboard', roles: ['parent'] },
  { prefix: '/app/messages', roles: ['parent', 'instructor'], feature: 'messaging' },
  { prefix: '/app/feedback', roles: ['parent', 'instructor'], feature: 'feedback' },
  { prefix: '/app/announcements', roles: ['admin', 'instructor', 'parent', 'student'], feature: 'announcements' },
  { prefix: '/app/exams', roles: ['admin', 'instructor', 'parent', 'student'], feature: 'examCenter' },
  { prefix: '/app/timetable', roles: ['admin', 'instructor', 'parent', 'student'] },
  { prefix: '/app/homework-detail', roles: ['parent', 'student'] },
  { prefix: '/app/homework', roles: ['parent', 'student'] },
  { prefix: '/app/dashboard', roles: ['student'] },
  { prefix: '/app/grades', roles: ['student'] },
  { prefix: '/app/subject', roles: ['student'] },
  { prefix: '/app/lesson', roles: ['student'] },
  { prefix: '/app/quiz', roles: ['student'] },
]

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isFeatureEnabled(features, feature) {
  if (!feature) return true
  return feature === 'feedback' ? features?.[feature] === true : features?.[feature] !== false
}

export function roleHome(role) {
  return ROLE_HOME[role] || '/'
}

export function canAccessRoute(pathname, role, features = {}) {
  const policy = ROUTE_POLICIES.find(({ prefix }) => matchesPrefix(pathname, prefix))
  return Boolean(policy && policy.roles.includes(role) && isFeatureEnabled(features, policy.feature))
}
