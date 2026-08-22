import { describe, expect, it } from 'vitest'
import { canAccessRoute, roleHome } from './routePolicy'

describe('route policy', () => {
  it('allows an admin route only to admins', () => {
    expect(canAccessRoute('/app/admin/insights', 'admin')).toBe(true)
    expect(canAccessRoute('/app/admin/insights', 'instructor')).toBe(false)
  })

  it('enforces feature flags on deep links', () => {
    expect(canAccessRoute('/app/exams', 'student', { examCenter: false })).toBe(false)
    expect(canAccessRoute('/app/exams', 'student', { examCenter: true })).toBe(true)
    expect(canAccessRoute('/app/feedback', 'parent', { feedback: false })).toBe(false)
    expect(canAccessRoute('/app/feedback', 'parent', { feedback: true })).toBe(true)
  })

  it('keeps parent homework access while denying student-only pages', () => {
    expect(canAccessRoute('/app/homework/math', 'parent')).toBe(true)
    expect(canAccessRoute('/app/grades', 'parent')).toBe(false)
  })

  it('denies unknown app routes and provides a role home', () => {
    expect(canAccessRoute('/app/not-a-route', 'student')).toBe(false)
    expect(roleHome('instructor')).toBe('/app/instructor')
    expect(roleHome('unknown')).toBe('/')
  })
})
