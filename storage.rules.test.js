import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

let testEnv
let fileCounter = 0

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'masar-school-demo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => testEnv.cleanup())

beforeEach(async () => {
  await testEnv.clearFirestore()
  fileCounter += 1
})

async function seedUser(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), data)
  })
}

function imageRef(uid = 'adminA') {
  return ref(testEnv.authenticatedContext(uid).storage(), `schools/schoolA/branding/logo-${fileCounter}.png`)
}

describe('branding Storage rules', () => {
  it('allows a same-school admin to upload and read an image', async () => {
    await seedUser('adminA', { role: 'admin', schoolId: 'schoolA', status: 'active' })
    const file = imageRef()
    await assertSucceeds(uploadBytes(file, new Uint8Array([1, 2, 3]), { contentType: 'image/png' }))
    await assertSucceeds(getBytes(file))
  })

  it('allows a platform admin and denies a different school admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformAdmins', 'ownerA'), { name: 'Owner' })
      await setDoc(doc(ctx.firestore(), 'users', 'adminB'), { role: 'admin', schoolId: 'schoolB', status: 'active' })
    })
    await assertSucceeds(uploadBytes(imageRef('ownerA'), new Uint8Array([1]), { contentType: 'image/png' }))
    await assertFails(uploadBytes(imageRef('adminB'), new Uint8Array([1]), { contentType: 'image/png' }))
  })

  it('denies students and instructors, non-images, oversized files, and deletes', async () => {
    await seedUser('studentA', { role: 'student', schoolId: 'schoolA', status: 'active' })
    await seedUser('teacherA', { role: 'instructor', schoolId: 'schoolA', status: 'active' })
    await seedUser('adminA', { role: 'admin', schoolId: 'schoolA', status: 'active' })
    await assertFails(uploadBytes(imageRef('studentA'), new Uint8Array([1]), { contentType: 'image/png' }))
    await assertFails(uploadBytes(imageRef('teacherA'), new Uint8Array([1]), { contentType: 'image/png' }))
    await assertFails(uploadBytes(imageRef(), new Uint8Array([1]), { contentType: 'text/plain' }))
    await assertFails(uploadBytes(imageRef(), new Uint8Array(3 * 1024 * 1024), { contentType: 'image/png' }))
    const file = imageRef()
    await assertSucceeds(uploadBytes(file, new Uint8Array([1]), { contentType: 'image/png' }))
    await assertFails(deleteObject(file))
  })
})
