import { describe, it, expect } from 'vitest'
import { parseStudentsList } from './parseStudentsFile'

describe('parseStudentsList', () => {
  it('splits lines and trims whitespace', () => {
    expect(parseStudentsList('أحمد\n سالم \nليلى')).toEqual(['أحمد', 'سالم', 'ليلى'])
  })

  it('drops empty lines', () => {
    expect(parseStudentsList('أحمد\n\n\nسالم\n')).toEqual(['أحمد', 'سالم'])
  })

  it('handles CRLF line endings', () => {
    expect(parseStudentsList('أحمد\r\nسالم')).toEqual(['أحمد', 'سالم'])
  })

  it('returns an empty array for blank input', () => {
    expect(parseStudentsList('   \n  \n')).toEqual([])
  })
})
