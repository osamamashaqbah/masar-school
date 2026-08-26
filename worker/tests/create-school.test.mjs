import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CreateSchoolError,
  generateTemporaryPassword,
  isRecentAuth,
  normalizeCreateSchoolInput,
  provisionSchool,
} from '../src/createSchool.ts'
import { firestoreCommit } from '../src/firestore.ts'

const input = {
  requestId: '11111111-1111-4111-8111-111111111111',
  schoolName: 'مدرسة النور',
  adminName: 'مدير النور',
  adminEmail: 'ADMIN@EXAMPLE.COM',
}

function makeDeps(overrides = {}) {
  const now = new Date('2026-08-26T10:00:00.000Z')
  const calls = { createUser: 0, deleteUser: 0, updatePassword: 0, commit: 0, deleteRequest: 0 }
  let marker = null
  const deps = {
    now: () => now,
    generateTemporaryPassword: () => 'Aa1!temporary-password',
    getRequest: async () => marker,
    reserveRequest: async (next) => {
      marker = { ...next, updateTime: '2026-08-26T10:00:00.001Z' }
      return marker
    },
    deleteRequest: async () => { calls.deleteRequest += 1; marker = null },
    getDoc: async () => null,
    lookupUserByEmail: async () => null,
    createUser: async () => { calls.createUser += 1; return { localId: 'admin-uid', email: input.adminEmail.toLowerCase() } },
    deleteUser: async () => { calls.deleteUser += 1 },
    updateUserPassword: async () => { calls.updatePassword += 1 },
    patchDoc: async () => {},
    commit: async (writes) => {
      calls.commit += 1
      calls.lastWrites = writes
      marker = { ...writes[0].data, updateTime: '2026-08-26T10:00:00.002Z' }
    },
    calls,
    lastWrites: [],
  }
  return { ...deps, ...overrides }
}

test('normalizes and validates school provisioning input', () => {
  assert.equal(normalizeCreateSchoolInput({ ...input, adminEmail: ' ADMIN@EXAMPLE.COM ' }).input.adminEmail, 'admin@example.com')
  assert.equal(normalizeCreateSchoolInput({ ...input, schoolName: '' }).error !== undefined, true)
  assert.equal(normalizeCreateSchoolInput({ ...input, adminName: '' }).error !== undefined, true)
  assert.equal(normalizeCreateSchoolInput({ ...input, adminEmail: 'not-an-email' }).error !== undefined, true)
  assert.equal(normalizeCreateSchoolInput({ ...input, requestId: 'not-a-uuid' }).error !== undefined, true)
})

test('generates a strong temporary password without persistence concerns', () => {
  const password = generateTemporaryPassword()
  assert.equal(password.length >= 16, true)
  assert.match(password, /[A-Z]/)
  assert.match(password, /[a-z]/)
  assert.match(password, /\d/)
  assert.match(password, /[^A-Za-z\d]/)
})

test('requires a recent Firebase authentication time', () => {
  assert.equal(isRecentAuth(1_000, 1_500), true)
  assert.equal(isRecentAuth(899, 1_500), false)
  assert.equal(isRecentAuth(undefined, 1_500), false)
})

test('encodes Firestore timestamps and create preconditions for atomic commits', async () => {
  const originalFetch = globalThis.fetch
  let url
  let payload
  globalThis.fetch = async (_url, options) => {
    url = _url
    payload = JSON.parse(options.body)
    return new Response(JSON.stringify({ writeResults: [{ updateTime: '2026-08-26T10:00:00.001Z' }] }), { status: 200 })
  }
  try {
    await firestoreCommit('token', 'project', [{
      path: 'schools/school-1',
      data: { createdAt: new Date('2026-08-26T10:00:00.000Z') },
      precondition: { exists: false },
    }])
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(url, 'https://firestore.googleapis.com/v1/projects/project/databases/(default)/documents:commit')
  assert.equal(payload.writes[0].update.fields.createdAt.timestampValue, '2026-08-26T10:00:00.000Z')
  assert.deepEqual(payload.writes[0].currentDocument, { exists: false })
})

test('creates all tenant records in one commit and keeps password out of writes', async () => {
  const deps = makeDeps()
  const result = await provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة')
  assert.equal(result.schoolId, `school-${input.requestId}`)
  assert.equal(deps.calls.createUser, 1)
  assert.equal(deps.calls.commit, 1)
  assert.equal(deps.calls.lastWrites.some((write) => JSON.stringify(write.data).includes('temporary-password')), false)
  const statsWrite = deps.calls.lastWrites.find((write) => write.path === `platformStats/school-${input.requestId}`)
  assert.equal(statsWrite.data.studentCount, 0)
  assert.equal(statsWrite.data.instructorCount, 0)
  assert.equal(statsWrite.data.parentCount, 0)
  delete deps.calls.lastWrites
  assert.deepEqual(deps.calls, { createUser: 1, deleteUser: 0, updatePassword: 0, commit: 1, deleteRequest: 0 })
})

test('rolls Auth back when the atomic Firestore commit fails', async () => {
  const deps = makeDeps({ commit: async () => { throw new Error('Firestore unavailable') } })
  await assert.rejects(
    provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة'),
    (error) => error instanceof CreateSchoolError && error.code === 'provisioning_failed',
  )
  assert.equal(deps.calls.deleteUser, 1)
  assert.equal(deps.calls.deleteRequest, 1)
})

test('surfaces a critical error when Auth rollback also fails', async () => {
  const deps = makeDeps({
    commit: async () => { throw new Error('Firestore unavailable') },
    deleteUser: async () => { throw new Error('Auth unavailable') },
  })
  await assert.rejects(
    provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة'),
    (error) => error instanceof CreateSchoolError && error.code === 'provisioning_rollback_failed',
  )
})

test('does not write Firestore when Auth creation fails', async () => {
  const deps = makeDeps({ createUser: async () => { throw new Error('WEAK_PASSWORD') } })
  await assert.rejects(
    provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة'),
    (error) => error instanceof CreateSchoolError && error.code === 'auth_error',
  )
  assert.equal(deps.calls.commit, 0)
  assert.equal(deps.calls.deleteRequest, 1)
})

test('replaying a completed request reuses the tenant and only resets credentials', async () => {
  const deps = makeDeps({ getDoc: async () => ({ role: 'admin', mustChangePassword: true }) })
  const first = await provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة')
  const second = await provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة')
  assert.equal(first.schoolId, second.schoolId)
  assert.equal(deps.calls.createUser, 1)
  assert.equal(deps.calls.commit, 1)
  assert.equal(deps.calls.updatePassword, 1)
})

test('rejects a request id reused with different data', async () => {
  const deps = makeDeps()
  await provisionSchool({ ...input, adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة')
  await assert.rejects(
    provisionSchool({ ...input, schoolName: 'مدرسة مختلفة', adminEmail: input.adminEmail.toLowerCase() }, deps, 'owner-uid', 'صاحب المنصة'),
    (error) => error instanceof CreateSchoolError && error.code === 'idempotency_conflict',
  )
})
