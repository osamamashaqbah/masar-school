import { describe, it, expect } from 'vitest'
import {
  categoriesFor,
  DEFAULT_GRADE_CATEGORIES,
  markDocId,
  aggregateMark,
  computeSubjectTotal,
  computeStudentAverage,
} from './gradeCategories'

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

// regression: homework grades must not overwrite each other for the same student+subject
describe('markDocId', () => {
  it('gives each homework assignment its own doc id (same student+subject+category)', () => {
    const hw1 = markDocId('student-A', 'math', 'homework', 'hw-1')
    const hw2 = markDocId('student-A', 'math', 'homework', 'hw-2')
    expect(hw1).not.toBe(hw2)
  })

  it('re-grading the same homework reuses its own doc id (no duplicates)', () => {
    const first = markDocId('student-A', 'math', 'homework', 'hw-1')
    const again = markDocId('student-A', 'math', 'homework', 'hw-1')
    expect(first).toBe(again)
  })

  it('different students never collide on the same homework', () => {
    const a = markDocId('student-A', 'math', 'homework', 'hw-1')
    const b = markDocId('student-B', 'math', 'homework', 'hw-1')
    expect(a).not.toBe(b)
  })

  it('different subjects never collide for the same student+homework id', () => {
    const math = markDocId('student-A', 'math', 'homework', 'hw-1')
    const science = markDocId('student-A', 'science', 'homework', 'hw-1')
    expect(math).not.toBe(science)
  })

  it('manual (non-homework) categories keep the legacy stable doc id', () => {
    expect(markDocId('student-A', 'math', 'exam1')).toBe('student-A_math_exam1')
    expect(markDocId('student-A', 'math', 'exam1', null)).toBe('student-A_math_exam1')
  })
})

describe('aggregateMark', () => {
  it('sums independent homework grades instead of only keeping the latest one', () => {
    const marks = [
      { categoryId: 'homework', homeworkId: 'hw-1', score: 80, maxScore: 100 },
      { categoryId: 'homework', homeworkId: 'hw-2', score: 90, maxScore: 100 },
    ]
    expect(aggregateMark(marks, 'homework')).toEqual({ score: 170, maxScore: 200 })
  })

  it('updating one homework grade does not affect a sibling homework grade', () => {
    const marks = [
      { categoryId: 'homework', homeworkId: 'hw-1', score: 85, maxScore: 100 }, // hw-1 updated 80 -> 85
      { categoryId: 'homework', homeworkId: 'hw-2', score: 90, maxScore: 100 }, // hw-2 untouched
    ]
    expect(aggregateMark(marks, 'homework')).toEqual({ score: 175, maxScore: 200 })
  })

  it('handles a grade of 0', () => {
    const marks = [{ categoryId: 'homework', homeworkId: 'hw-1', score: 0, maxScore: 100 }]
    expect(aggregateMark(marks, 'homework')).toEqual({ score: 0, maxScore: 100 })
  })

  it('single-record categories (exam1/exam2/final) behave exactly as before', () => {
    const marks = [{ categoryId: 'exam1', score: 45, maxScore: 50 }]
    expect(aggregateMark(marks, 'exam1')).toEqual({ score: 45, maxScore: 50 })
  })

  it('returns null when no mark exists for the category yet', () => {
    expect(aggregateMark([], 'homework')).toBeNull()
  })

  it('ignores legacy/incomplete records missing score or maxScore', () => {
    const marks = [{ categoryId: 'homework', homeworkId: 'hw-1' }]
    expect(aggregateMark(marks, 'homework')).toBeNull()
  })

  it('only aggregates marks matching the requested category, ignoring other subjects/categories mixed in', () => {
    const marks = [
      { categoryId: 'homework', homeworkId: 'hw-1', score: 80, maxScore: 100 },
      { categoryId: 'exam1', score: 40, maxScore: 50 },
    ]
    expect(aggregateMark(marks, 'homework')).toEqual({ score: 80, maxScore: 100 })
    expect(aggregateMark(marks, 'exam1')).toEqual({ score: 40, maxScore: 50 })
  })
})

describe('direct subject scores', () => {
  const categories = [
    { id: 'month1', label: 'الشهر الأول', auto: false },
    { id: 'month2', label: 'الشهر الثاني', auto: false },
    { id: 'final', label: 'النهائي', auto: false },
    { id: 'participation', label: 'المشاركة', auto: false },
  ]

  function getMark(marks) {
    return (studentUid, subjectId, categoryId) => marks.find(
      (mark) => mark.studentUid === studentUid && mark.subjectId === subjectId && mark.categoryId === categoryId,
    ) || null
  }

  it('sums direct marks with their entered maxima to produce a subject score out of 100', () => {
    const subject = { id: 'arabic', gradeCategories: categories }
    const marks = [
      { studentUid: 'student', subjectId: 'arabic', categoryId: 'month1', score: 17, maxScore: 20 },
      { studentUid: 'student', subjectId: 'arabic', categoryId: 'month2', score: 14, maxScore: 20 },
      { studentUid: 'student', subjectId: 'arabic', categoryId: 'final', score: 42, maxScore: 50 },
      { studentUid: 'student', subjectId: 'arabic', categoryId: 'participation', score: 8, maxScore: 10 },
    ]

    expect(computeSubjectTotal(subject, 'student', getMark(marks), () => ({ attempts: 0, correct: 0 }))).toEqual({
      totalScore: 81,
      totalMax: 100,
    })
  })

  it('averages the actual number of subjects instead of assuming a fixed count', () => {
    const subjects = ['arabic', 'math', 'science'].map((id) => ({ id, gradeCategories: categories }))
    const marks = subjects.flatMap((subject, index) => [
      { studentUid: 'student', subjectId: subject.id, categoryId: 'month1', score: 20 - index, maxScore: 20 },
      { studentUid: 'student', subjectId: subject.id, categoryId: 'month2', score: 20, maxScore: 20 },
      { studentUid: 'student', subjectId: subject.id, categoryId: 'final', score: 50 - index, maxScore: 50 },
      { studentUid: 'student', subjectId: subject.id, categoryId: 'participation', score: 10, maxScore: 10 },
    ])

    expect(computeStudentAverage(subjects, 'student', getMark(marks), () => ({ attempts: 0, correct: 0 }))).toBe(98)
  })
})
