import { describe, it, expect } from 'vitest'
import { evaluateEarlyWarning, rankTop, DEFAULT_THRESHOLDS } from './earlyWarningRules'

describe('evaluateEarlyWarning', () => {
  it('flags attendance when unexcused exceeds the default max', () => {
    const { attendanceAlert } = evaluateEarlyWarning({ unexcusedCount: 16, excusedCount: 0, average: 90, subjectTotals: [] })
    expect(attendanceAlert).toBe(true)
  })

  it('flags attendance when excused exceeds the default max', () => {
    const { attendanceAlert } = evaluateEarlyWarning({ unexcusedCount: 0, excusedCount: 6, average: 90, subjectTotals: [] })
    expect(attendanceAlert).toBe(true)
  })

  it('does not flag attendance right at the threshold', () => {
    const { attendanceAlert } = evaluateEarlyWarning({ unexcusedCount: 15, excusedCount: 5, average: 90, subjectTotals: [] })
    expect(attendanceAlert).toBe(false)
  })

  it('flags overall average below the default min', () => {
    const { averageAlert } = evaluateEarlyWarning({ unexcusedCount: 0, excusedCount: 0, average: 59, subjectTotals: [] })
    expect(averageAlert).toBe(true)
  })

  it('does not flag a null average (no marks entered yet)', () => {
    const { averageAlert } = evaluateEarlyWarning({ unexcusedCount: 0, excusedCount: 0, average: null, subjectTotals: [] })
    expect(averageAlert).toBe(false)
  })

  it('flags a subject only once core exams are entered and total is below the fail line', () => {
    const subjectTotals = [
      { subjectId: 'a', coreExamsEntered: true, totalScore: 49, totalMax: 100 },
      { subjectId: 'b', coreExamsEntered: false, totalScore: 10, totalMax: 100 },
    ]
    const { subjectAlerts } = evaluateEarlyWarning({ unexcusedCount: 0, excusedCount: 0, average: 90, subjectTotals })
    expect(subjectAlerts.map((s) => s.subjectId)).toEqual(['a'])
  })

  it('respects custom thresholds when given', () => {
    const custom = { ...DEFAULT_THRESHOLDS, averageMin: 70 }
    const { averageAlert } = evaluateEarlyWarning({ unexcusedCount: 0, excusedCount: 0, average: 65, subjectTotals: [] }, custom)
    expect(averageAlert).toBe(true)
  })
})

describe('rankTop', () => {
  it('sorts descending and slices to n', () => {
    const entries = [{ average: 70 }, { average: 95 }, { average: 80 }]
    expect(rankTop(entries, 2).map((e) => e.average)).toEqual([95, 80])
  })

  it('excludes null/undefined averages', () => {
    const entries = [{ average: null }, { average: 88 }, { average: undefined }]
    expect(rankTop(entries, 10).map((e) => e.average)).toEqual([88])
  })
})
