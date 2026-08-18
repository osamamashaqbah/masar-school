import { describe, expect, it } from 'vitest'
import { parseStudentRows } from './parseStudentsExcel'

describe('parseStudentRows', () => {
  it('rejects rows missing a required student structure field', () => {
    expect(() => parseStudentRows([{ الاسم: 'أحمد', الصف: '', الشعبة: 'أ' }])).toThrow('صفوف ناقصة: 2')
  })

  it('returns normalized valid rows', () => {
    expect(parseStudentRows([{ الاسم: ' أحمد ', الصف: 'السابع', الشعبة: 'أ' }])).toEqual([{
      name: 'أحمد', gradeName: 'السابع', sectionName: 'أ', parentPhone: '', parentName: '',
    }])
  })
})
