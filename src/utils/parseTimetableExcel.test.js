import { describe, expect, it } from 'vitest'
import { mapTimetableHeaders } from './parseTimetableExcel'

describe('mapTimetableHeaders', () => {
  it('does not map a blank column to Sunday', () => {
    expect(mapTimetableHeaders(['الحصة', '', 'الأحد', 'الاثنين'])).toEqual([null, null, 0, 1])
  })
})
