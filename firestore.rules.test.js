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

describe('messages/threads', () => {
  it('an instructor can open a thread with a parent in their own school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(
      setDoc(doc(teacherCtx.firestore(), 'threads', 'teacherA_parentA'), {
        participantUids: ['teacherA', 'parentA'], schoolId: 'schoolA',
      })
    )
  })

  it('an instructor cannot open a thread with a parent from another school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolB', 'parentB', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'threads', 'teacherA_parentB'), {
        participantUids: ['teacherA', 'parentB'], schoolId: 'schoolA',
      })
    )
  })

  it('two instructors cannot open a thread together (only instructor<->parent allowed)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T1', role: 'instructor', email: 't1@x.com' })
    await seedUser('schoolA', 'teacherA2', { name: 'T2', role: 'instructor', email: 't2@x.com' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'threads', 'teacherA_teacherA2'), {
        participantUids: ['teacherA', 'teacherA2'], schoolId: 'schoolA',
      })
    )
  })

  it('a third party cannot read a thread they are not part of', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })
    await seedUser('schoolA', 'stranger', { name: 'S', role: 'parent', email: 's@x.com', childUids: [] })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'threads', 'teacherA_parentA'), {
        participantUids: ['teacherA', 'parentA'], schoolId: 'schoolA',
      })
    })

    const strangerCtx = testEnv.authenticatedContext('stranger')
    await assertFails(getDoc(doc(strangerCtx.firestore(), 'threads', 'teacherA_parentA')))
  })

  it('a parent can send a message to their child\'s instructor', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertSucceeds(
      addDoc(collection(parentCtx.firestore(), 'messages'), {
        threadId: 'teacherA_parentA', senderUid: 'parentA', recipientUid: 'teacherA', text: 'مرحبا', schoolId: 'schoolA',
      })
    )
  })

  it('a user cannot send a message impersonating another sender', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(
      addDoc(collection(parentCtx.firestore(), 'messages'), {
        threadId: 'teacherA_parentA', senderUid: 'teacherA', recipientUid: 'parentA', text: 'مرحبا', schoolId: 'schoolA',
      })
    )
  })

  it('a student cannot message an instructor (only instructor<->parent allowed)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(
      addDoc(collection(studentCtx.firestore(), 'messages'), {
        threadId: 'teacherA_studentA', senderUid: 'studentA', recipientUid: 'teacherA', text: 'مرحبا', schoolId: 'schoolA',
      })
    )
  })
})

describe('earlyWarnings / honorBoards', () => {
  it('admin can write an early-warning doc for a student in their own school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'earlyWarnings', 'studentA'), {
        studentUid: 'studentA', schoolId: 'schoolA', sectionId: 'sec1', attendanceAlert: true, updatedAt: Date.now(),
      })
    )
  })

  it('admin cannot write an early-warning doc into another school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await seedUser('schoolB', 'studentB', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(
      setDoc(doc(adminACtx.firestore(), 'earlyWarnings', 'studentB'), {
        studentUid: 'studentB', schoolId: 'schoolB', sectionId: 'sec1', attendanceAlert: true, updatedAt: Date.now(),
      })
    )
  })

  it('an instructor cannot write an early-warning doc (admin-only)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'earlyWarnings', 'studentA'), {
        studentUid: 'studentA', schoolId: 'schoolA', sectionId: 'sec1', attendanceAlert: true, updatedAt: Date.now(),
      })
    )
  })

  it('a student can read their own early-warning doc', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'earlyWarnings', 'studentA'), {
        studentUid: 'studentA', schoolId: 'schoolA', sectionId: 'sec1', attendanceAlert: true, updatedAt: Date.now(),
      })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'earlyWarnings', 'studentA')))
  })

  it('a student cannot read another student\'s early-warning doc', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await seedUser('schoolA', 'studentB', { name: 'St2', role: 'student', email: 's2@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'earlyWarnings', 'studentB'), {
        studentUid: 'studentB', schoolId: 'schoolA', sectionId: 'sec1', attendanceAlert: true, updatedAt: Date.now(),
      })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(getDoc(doc(studentCtx.firestore(), 'earlyWarnings', 'studentB')))
  })

  it('any signed-in user in the same school can read a honor board', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'honorBoards', 'section_sec1'), {
        schoolId: 'schoolA', top: [{ studentUid: 'studentA', studentName: 'St', average: 95 }], updatedAt: Date.now(),
      })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'honorBoards', 'section_sec1')))
  })

  it('a user from another school cannot read a honor board', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'honorBoards', 'section_sec1'), {
        schoolId: 'schoolA', top: [], updatedAt: Date.now(),
      })
    })

    const adminBCtx = testEnv.authenticatedContext('adminB')
    await assertFails(getDoc(doc(adminBCtx.firestore(), 'honorBoards', 'section_sec1')))
  })

  it('an instructor cannot write a honor board (admin-only)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'honorBoards', 'section_sec1'), {
        schoolId: 'schoolA', top: [], updatedAt: Date.now(),
      })
    )
  })
})

describe('academicYear write gate', () => {
  async function seedSchoolWithYear(schoolId, adminUid, year) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'schools', schoolId), { name: schoolId, adminUid, currentAcademicYear: year, createdAt: Date.now() })
      await setDoc(doc(db, 'users', adminUid), { name: 'Admin', role: 'admin', email: 'a@x.com', schoolId })
    })
  }

  it('a student cannot write quizStats for a year other than the school\'s currentAcademicYear', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(
      setDoc(doc(studentCtx.firestore(), 'quizStats', 'studentA_subj1_2024-2025'), {
        uid: 'studentA', subjectId: 'subj1', schoolId: 'schoolA', academicYear: '2024-2025', attempts: 1, correct: 1,
      })
    )
  })

  it('a student can write quizStats matching the school\'s currentAcademicYear', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(
      setDoc(doc(studentCtx.firestore(), 'quizStats', 'studentA_subj1_2025-2026'), {
        uid: 'studentA', subjectId: 'subj1', schoolId: 'schoolA', academicYear: '2025-2026', attempts: 1, correct: 1,
      })
    )
  })

  it('an admin can update currentAcademicYear on their own school (rollover)', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'schools', 'schoolA'), { currentAcademicYear: '2026-2027' }, { merge: true })
    )
  })

  it('an admin cannot change any other field on the schools doc', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'schools', 'schoolA'), { name: 'اسم جديد' }, { merge: true })
    )
  })

  it('an admin can toggle a feature flag on their own school', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'schools', 'schoolA'), { features: { messaging: false } }, { merge: true })
    )
  })
})

describe('announcements / excuseRequests / auditLog', () => {
  it('any signed-in user in the same school can read an announcement', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'announcements', 'ann1'), {
        title: 'ت', body: 'ن', schoolId: 'schoolA', authorUid: 'adminA', readBy: [], createdAt: Date.now(),
      })
    })
    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'announcements', 'ann1')))
  })

  it('an instructor cannot post an announcement (admin-only)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      addDoc(collection(teacherCtx.firestore(), 'announcements'), {
        title: 'ت', body: 'ن', schoolId: 'schoolA', authorUid: 'teacherA', createdAt: Date.now(),
      })
    )
  })

  it('a parent can submit an excuse request for their own child', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: ['studentA'] })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertSucceeds(
      addDoc(collection(parentCtx.firestore(), 'excuseRequests'), {
        studentUid: 'studentA', sectionId: 'sec1', date: '2026-01-01', reason: 'سفر',
        status: 'pending', requestedByUid: 'parentA', schoolId: 'schoolA',
      })
    )
  })

  it('a parent cannot submit an excuse request for a student who is not their child', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentB', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await seedUser('schoolA', 'parentA', { name: 'P', role: 'parent', email: 'p@x.com', childUids: [] })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(
      addDoc(collection(parentCtx.firestore(), 'excuseRequests'), {
        studentUid: 'studentB', sectionId: 'sec1', date: '2026-01-01', reason: 'سفر',
        status: 'pending', requestedByUid: 'parentA', schoolId: 'schoolA',
      })
    )
  })

  it('a user can write their own auditLog entry', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'auditLog'), {
        schoolId: 'schoolA', actorUid: 'adminA', action: 'create_user', targetType: 'student', createdAt: Date.now(),
      })
    )
  })

  it('only an admin can read the auditLog', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLog', 'log1'), {
        schoolId: 'schoolA', actorUid: 'adminA', action: 'create_user', targetType: 'student', createdAt: Date.now(),
      })
    })
    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'auditLog', 'log1')))
  })
})

describe('platformAdmins / platformStats (super-admin)', () => {
  async function seedPlatformAdmin(uid) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformAdmins', uid), { name: 'Owner', addedAt: Date.now(), addedBy: 'script' })
    })
  }

  it('nobody can create their own platformAdmins doc from the client', async () => {
    const attackerCtx = testEnv.authenticatedContext('attacker')
    await assertFails(
      setDoc(doc(attackerCtx.firestore(), 'platformAdmins', 'attacker'), { name: 'Me', addedAt: Date.now(), addedBy: 'attacker' })
    )
  })

  it('a regular user cannot read another user\'s platformAdmins doc', async () => {
    await seedPlatformAdmin('ownerA')
    const attackerCtx = testEnv.authenticatedContext('attacker')
    await assertFails(getDoc(doc(attackerCtx.firestore(), 'platformAdmins', 'ownerA')))
  })

  it('a platform admin can read any school\'s users (support access)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })
    await seedPlatformAdmin('ownerA')

    const ownerCtx = testEnv.authenticatedContext('ownerA')
    await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'users', 'studentA')))
  })

  it('a school admin can write their own platformStats (aggregate only)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'platformStats', 'schoolA'), {
        schoolName: 'schoolA', studentCount: 10, instructorCount: 2, parentCount: 8, updatedAt: Date.now(),
      })
    )
  })

  it('a school admin cannot write another school\'s platformStats', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(
      setDoc(doc(adminACtx.firestore(), 'platformStats', 'schoolB'), {
        schoolName: 'schoolB', studentCount: 1, instructorCount: 1, parentCount: 1, updatedAt: Date.now(),
      })
    )
  })

  it('a platform admin can read platformStats for any school, a regular user cannot', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedPlatformAdmin('ownerA')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformStats', 'schoolA'), {
        schoolName: 'schoolA', studentCount: 1, instructorCount: 1, parentCount: 1, updatedAt: Date.now(),
      })
    })
    await seedSchoolWithAdmin('schoolB', 'adminB')

    const ownerCtx = testEnv.authenticatedContext('ownerA')
    await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'platformStats', 'schoolA')))

    const adminBCtx = testEnv.authenticatedContext('adminB')
    await assertFails(getDoc(doc(adminBCtx.firestore(), 'platformStats', 'schoolA')))
  })
})
