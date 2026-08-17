import { describe, expect, it } from 'vitest'
import { replaceTimetableSlot } from './timetable'

describe('replaceTimetableSlot', () => {
  it('keeps rapid edits to different slots independent', () => {
    const first = replaceTimetableSlot([], 0, 1, 'math')
    const second = replaceTimetableSlot(first, 0, 2, 'arabic')

    expect(second).toEqual([
      { day: 0, period: 1, subjectId: 'math' },
      { day: 0, period: 2, subjectId: 'arabic' },
    ])
  })

  it('replaces or removes only the selected slot', () => {
    const slots = [
      { day: 0, period: 1, subjectId: 'math' },
      { day: 0, period: 2, subjectId: 'arabic' },
    ]

    expect(replaceTimetableSlot(slots, 0, 1, 'science')).toEqual([
      { day: 0, period: 2, subjectId: 'arabic' },
      { day: 0, period: 1, subjectId: 'science' },
    ])
    expect(replaceTimetableSlot(slots, 0, 1, null)).toEqual([
      { day: 0, period: 2, subjectId: 'arabic' },
    ])
  })
})
