import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore'

// اختبارات قواعد Firestore: الهدف الوحيد هنا هو إثبات عزل المدارس (tenants) عن بعضها فعليًا،
// مو بس إخفاءها بالواجهة. يحتاج Firestore emulator (Java) شغال محليًا:
// firebase emulators:exec --only firestore "npm run test:rules"

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'masar-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

async function seedSchoolWithAdmin(schoolId, adminUid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'schools', schoolId), { name: schoolId, adminUid, createdAt: Date.now() })
    await setDoc(doc(db, 'users', adminUid), { name: 'Admin', role: 'admin', email: 'a@x.com', schoolId })
  })
}

async function seedUser(schoolId, uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), { schoolId, ...data })
  })
}

describe('tenant isolation', () => {
  it('an admin cannot read another school\'s student roster', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await seedUser('schoolB', 'studentB', { name: 'Student B', role: 'student', email: 'b@x.com' })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(getDoc(doc(adminACtx.firestore(), 'users', 'studentB')))
  })

  it('an admin can read their own school\'s users', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'Student A', role: 'student', email: 'a2@x.com' })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(getDoc(doc(adminACtx.firestore(), 'users', 'studentA')))
  })

  it('an admin cannot create a grade in another school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(addDoc(collection(adminACtx.firestore(), 'grades'), { name: 'الصف الأول', schoolId: 'schoolB' }))
  })

  it('an admin can create a grade in their own school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(addDoc(collection(adminACtx.firestore(), 'grades'), { name: 'الصف الأول', schoolId: 'schoolA' }))
  })

  it('a non-admin cannot self-promote to admin of an existing school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const attackerCtx = testEnv.authenticatedContext('attacker')
    await assertFails(
      setDoc(doc(attackerCtx.firestore(), 'users', 'attacker'), {
        name: 'Attacker', role: 'admin', email: 'e@x.com', schoolId: 'schoolA',
      })
    )
  })

  // ما في تسجيل ذاتي بالتطبيق — مدرسة جديدة بتنعمل بس عن طريق سكربت الإدارة (admin SDK)
  // يلي بيتخطى هاي القواعد أصلاً. من المتصفح، ولا حدا يقدر ينشئ مدرسة أو حساب admin.
  it('no client can create a school document directly', async () => {
    const anyoneCtx = testEnv.authenticatedContext('someone')
    await assertFails(
      addDoc(collection(anyoneCtx.firestore(), 'schools'), { name: 'مدرسة جديدة', adminUid: 'someone', createdAt: Date.now() })
    )
  })

  it('no client can create their own admin user doc, even for a real school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const attackerCtx = testEnv.authenticatedContext('attacker')
    await assertFails(
      setDoc(doc(attackerCtx.firestore(), 'users', 'attacker'), {
        name: 'Attacker', role: 'admin', email: 'e@x.com', schoolId: 'schoolA',
      })
    )
  })

  it('an existing admin can invite a non-admin user into their own school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminACtx.firestore(), 'users', 'newTeacher'), {
        name: 'معلّم جديد', role: 'instructor', email: 't@x.com', schoolId: 'schoolA',
      })
    )
  })

  it('an admin cannot invite a user into another school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(
      setDoc(doc(adminACtx.firestore(), 'users', 'newTeacher'), {
        name: 'معلّم جديد', role: 'instructor', email: 't@x.com', schoolId: 'schoolB',
      })
    )
  })
})
