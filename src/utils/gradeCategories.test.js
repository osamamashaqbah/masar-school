import { describe, it, expect } from 'vitest'
import { categoriesFor, DEFAULT_GRADE_CATEGORIES } from './gradeCategories'

describe('categoriesFor', () => {
  it('returns the subject\'s own categories when present', () => {
    const custom = [{ id: 'x', label: 'X', weight: 100, auto: false }]
    expect(categoriesFor({ gradeCategories: custom })).toBe(custom)
  })

  it('falls back to defaults when subject has no categories', () => {
    expect(categoriesFor({ gradeCategories: [] })).toBe(DEFAULT_GRADE_CATEGORIES)
    expect(categoriesFor({})).toBe(DEFAULT_GRADE_CATEGORIES)
    expect(categoriesFor(null)).toBe(DEFAULT_GRADE_CATEGORIES)
  })

  it('default categories sum to 100 weight', () => {
    const total = DEFAULT_GRADE_CATEGORIES.reduce((sum, c) => sum + c.weight, 0)
    expect(total).toBe(100)
  })
})
