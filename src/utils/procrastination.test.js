import { describe, it, expect } from 'vitest'
import { computeProcrastinationPattern } from './procrastination'

const day = 24 * 60 * 60 * 1000
const hour = 60 * 60 * 1000

describe('computeProcrastinationPattern', () => {
  it('does not flag with fewer than the minimum sample size', () => {
    const pairs = [{ deadline: day * 2, submittedAt: day * 2 - hour }, { deadline: day * 3, submittedAt: day * 3 - hour }]
    expect(computeProcrastinationPattern(pairs).isPattern).toBe(false)
  })

  it('flags a consistent last-minute pattern', () => {
    const pairs = [
      { deadline: day, submittedAt: day - hour },
      { deadline: day * 2, submittedAt: day * 2 - hour * 1.5 },
      { deadline: day * 3, submittedAt: day * 3 - hour * 0.5 },
      { deadline: day * 4, submittedAt: day * 4 - hour },
    ]
    const result = computeProcrastinationPattern(pairs)
    expect(result.isPattern).toBe(true)
    expect(result.lastMinuteCount).toBe(4)
  })

  it('does not flag a student who submits early', () => {
    const pairs = [
      { deadline: day, submittedAt: day - day * 2 },
      { deadline: day * 2, submittedAt: day * 2 - day * 2 },
      { deadline: day * 3, submittedAt: day * 3 - day * 2 },
    ]
    expect(computeProcrastinationPattern(pairs).isPattern).toBe(false)
  })

  it('ignores entries missing a deadline or submission time', () => {
    const pairs = [
      { deadline: day, submittedAt: day - hour },
      { deadline: null, submittedAt: day - hour },
      { deadline: day * 2, submittedAt: null },
    ]
    expect(computeProcrastinationPattern(pairs).total).toBe(1)
  })
})
