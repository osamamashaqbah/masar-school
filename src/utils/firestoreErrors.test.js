import { describe, it, expect } from 'vitest'
import { firestoreErrorMessage } from './firestoreErrors'

describe('firestoreErrorMessage', () => {
  it('maps known Firestore error codes to Arabic messages', () => {
    expect(firestoreErrorMessage({ code: 'permission-denied' })).toBe('ما عندك صلاحية تنفّذ هالعملية.')
    expect(firestoreErrorMessage({ code: 'unavailable' })).toContain('الاتصال')
  })

  it('never leaks the raw technical code/message to the user', () => {
    const msg = firestoreErrorMessage({ code: 'permission-denied', message: 'FirebaseError: [code=permission-denied] Missing permissions' })
    expect(msg).not.toMatch(/FirebaseError|code=/)
  })

  it('falls back to the default message for unknown/unset codes', () => {
    expect(firestoreErrorMessage({ code: 'some-unmapped-code' })).toBe('صار خطأ غير متوقع. حاول مرة ثانية.')
    expect(firestoreErrorMessage(undefined)).toBe('صار خطأ غير متوقع. حاول مرة ثانية.')
    expect(firestoreErrorMessage(null)).toBe('صار خطأ غير متوقع. حاول مرة ثانية.')
  })

  it('accepts a custom fallback for flow-specific messaging', () => {
    expect(firestoreErrorMessage({ code: 'unknown' }, 'رسالة مخصصة')).toBe('رسالة مخصصة')
  })
})
