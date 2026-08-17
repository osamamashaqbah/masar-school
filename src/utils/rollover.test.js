import { describe, expect, it } from 'vitest'
import { buildRolloverKey, normalizeSectionName, rolloverSectionDocId } from './rollover'

describe('rollover idempotency key', () => {
  it('normalizes equivalent names to the same stable key', () => {
    const input = {
      schoolId: 'schoolA', currentAcademicYear: '2025-2026', newYear: '2026-2027',
      sourceSectionId: 'sec1', newGradeId: 'grade2',
    }
    const first = buildRolloverKey({ ...input, name: '  شعبة أ  ' })
    const second = buildRolloverKey({ ...input, name: 'شعبة   أ' })

    expect(normalizeSectionName('  شعبة   أ ')).toBe('شعبة أ')
    expect(first).toBe(second)
    expect(rolloverSectionDocId(first)).toBe(rolloverSectionDocId(second))
  })

  it('keeps different source sections independent', () => {
    const base = {
      schoolId: 'schoolA', currentAcademicYear: '2025-2026', newYear: '2026-2027',
      newGradeId: 'grade2', name: 'شعبة أ',
    }

    expect(buildRolloverKey({ ...base, sourceSectionId: 'sec1' })).not.toBe(
      buildRolloverKey({ ...base, sourceSectionId: 'sec2' }),
    )
  })
})
