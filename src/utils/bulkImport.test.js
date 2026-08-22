import { describe, expect, it } from 'vitest'
import { isSuccessfulImportResult, mergeImportResults, retryableImportRowIndices } from './bulkImport'

describe('bulk import job helpers', () => {
  it('selects each failed source row once for retry', () => {
    expect(retryableImportRowIndices([
      { rowIndex: 2, role: 'student', status: 'ok' },
      { rowIndex: 2, role: 'parent', status: 'error' },
      { rowIndex: 4, role: 'student', status: 'error' },
      { rowIndex: 4, role: 'parent', status: 'error' },
    ])).toEqual([2, 4])
  })

  it('keeps credentials from the first attempt when a retry resumes an account', () => {
    const merged = mergeImportResults(
      [{ rowIndex: 1, role: 'student', status: 'ok', email: 'a@example.com', password: 'Student1234' }],
      [{ rowIndex: 1, role: 'student', status: 'resumed', email: 'a@example.com', password: null }]
    )
    expect(merged).toEqual([{
      rowIndex: 1, role: 'student', status: 'resumed', email: 'a@example.com', password: 'Student1234',
    }])
  })

  it('recognizes resumed and linked rows as successful', () => {
    expect(isSuccessfulImportResult({ status: 'resumed' })).toBe(true)
    expect(isSuccessfulImportResult({ status: 'linked' })).toBe(true)
    expect(isSuccessfulImportResult({ status: 'error' })).toBe(false)
  })
})
