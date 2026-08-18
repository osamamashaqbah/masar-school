import { describe, expect, it } from 'vitest'
import { finalQuizScore } from './quiz'

describe('finalQuizScore', () => {
  it('includes a correct answer submitted immediately before the result screen', () => {
    expect(finalQuizScore(0, 0, 0)).toBe(1)
  })

  it('does not add an incorrect final answer', () => {
    expect(finalQuizScore(2, 1, 0)).toBe(2)
  })
})
