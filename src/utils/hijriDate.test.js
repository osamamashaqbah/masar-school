import { describe, it, expect } from 'vitest'
import { toHijriString, isRamadan } from './hijriDate'

describe('hijriDate', () => {
  it('formats a Gregorian date as a Hijri string', () => {
    expect(toHijriString(new Date('2026-03-01'))).toContain('رمضان')
  })

  it('detects a date inside Ramadan', () => {
    expect(isRamadan(new Date('2026-03-01'))).toBe(true)
  })

  it('does not flag a date outside Ramadan', () => {
    expect(isRamadan(new Date('2026-07-25'))).toBe(false)
  })
})
