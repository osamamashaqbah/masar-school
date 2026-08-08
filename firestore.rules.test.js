import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, addDoc, query, where } from 'firebase/firestore'

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
      await setDoc(doc(ctx.firestore(), 'honorBoards', 'schoolA_section_sec1'), {
        schoolId: 'schoolA', top: [{ studentUid: 'studentA', studentName: 'St', average: 95 }], updatedAt: Date.now(),
      })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'honorBoards', 'schoolA_section_sec1')))
  })

  it('a user from another school cannot read a honor board', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'honorBoards', 'schoolA_section_sec1'), {
        schoolId: 'schoolA', top: [], updatedAt: Date.now(),
      })
    })

    const adminBCtx = testEnv.authenticatedContext('adminB')
    await assertFails(getDoc(doc(adminBCtx.firestore(), 'honorBoards', 'schoolA_section_sec1')))
  })

  it('an instructor cannot write a honor board (admin-only)', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'honorBoards', 'schoolA_section_sec1'), {
        schoolId: 'schoolA', top: [], updatedAt: Date.now(),
      })
    )
  })

  // Bug 1 (تصادم لوحات الشرف بين المدارس): قبل الإصلاح كانت كل المدارس تكتب على
  // نفس المعرّف العالمي school_top_students، فآخر مدرسة تعيد الحساب تمحي نتائج البقية.
  it('school B cannot overwrite school A\'s top-students board, even with school B\'s own schoolId in the data', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'honorBoards', 'schoolA_top_students'), {
        schoolId: 'schoolA', top: [{ studentUid: 'studentA', studentName: 'St A', average: 96 }], updatedAt: Date.now(),
      })
    })

    const adminBCtx = testEnv.authenticatedContext('adminB')
    await assertFails(
      setDoc(doc(adminBCtx.firestore(), 'honorBoards', 'schoolA_top_students'), {
        schoolId: 'schoolB', top: [{ studentUid: 'studentB', studentName: 'St B', average: 94 }], updatedAt: Date.now(),
      })
    )
  })

  it('an admin cannot create a honor board whose id is not prefixed with their own schoolId', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(
      setDoc(doc(adminACtx.firestore(), 'honorBoards', 'schoolB_top_students'), {
        schoolId: 'schoolA', top: [], updatedAt: Date.now(),
      })
    )
  })

  it('school A and school B keep independent top-students boards after both recompute', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminACtx.firestore(), 'honorBoards', 'schoolA_top_students'), {
        schoolId: 'schoolA', top: [{ studentUid: 'studentA', studentName: 'St A', average: 96 }], updatedAt: Date.now(),
      })
    )
    const adminBCtx = testEnv.authenticatedContext('adminB')
    await assertSucceeds(
      setDoc(doc(adminBCtx.firestore(), 'honorBoards', 'schoolB_top_students'), {
        schoolId: 'schoolB', top: [{ studentUid: 'studentB', studentName: 'St B', average: 94 }], updatedAt: Date.now(),
      })
    )

    let aDoc
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      aDoc = await getDoc(doc(ctx.firestore(), 'honorBoards', 'schoolA_top_students'))
    })
    expect(aDoc.data().top[0].studentUid).toBe('studentA')
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

describe('feedback (الملاحظات والمتابعة)', () => {
  async function seedFeedbackFixture(schoolId, suffix) {
    await seedSchoolWithAdmin(schoolId, `admin${suffix}`)
    await seedUser(schoolId, `teacher${suffix}`, { name: 'T', role: 'instructor', email: `t${suffix}@x.com`, taughtSectionIds: [`sec${suffix}`] })
    await seedUser(schoolId, `student${suffix}`, { name: 'St', role: 'student', email: `s${suffix}@x.com`, sectionId: `sec${suffix}`, parentUids: [`parent${suffix}`] })
    await seedUser(schoolId, `parent${suffix}`, { name: 'P', role: 'parent', email: `p${suffix}@x.com`, childUids: [`student${suffix}`] })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', `subj${suffix}`), {
        name: 'رياضيات', schoolId, sectionId: `sec${suffix}`, teacherUid: `teacher${suffix}`, teacherName: 'T', lessons: [],
      })
    })
  }

  function baseCase(overrides) {
    return {
      schoolId: 'schoolA', academicYear: '2025-2026', kind: 'observation', category: 'academic',
      title: 'عنوان', body: 'تفاصيل الملاحظة', requiresResponse: true, importance: 'normal',
      status: 'open', escalatedToAdmin: false, ...overrides,
    }
  }

  it('a parent can send feedback to their child\'s subject teacher', async () => {
    await seedFeedbackFixture('schoolA', 'A')

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertSucceeds(
      addDoc(collection(parentCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'parent_to_teacher', recipientRole: 'instructor', recipientUid: 'teacherA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'parentA', createdByRole: 'parent', participantUids: ['parentA', 'teacherA'], readBy: ['parentA'],
      }))
    )
  })

  it('a parent cannot send feedback naming a child that is not theirs', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    await seedUser('schoolA', 'otherStudent', { name: 'St2', role: 'student', email: 'o@x.com', sectionId: 'secA' })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(
      addDoc(collection(parentCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'parent_to_teacher', recipientRole: 'instructor', recipientUid: 'teacherA',
        studentUid: 'otherStudent', subjectId: 'subjA',
        createdByUid: 'parentA', createdByRole: 'parent', participantUids: ['parentA', 'teacherA'], readBy: ['parentA'],
      }))
    )
  })

  it('a "complaint" about a teacher cannot be routed directly to the teacher (must go to admin)', async () => {
    await seedFeedbackFixture('schoolA', 'A')

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(
      addDoc(collection(parentCtx.firestore(), 'feedbackCases'), baseCase({
        kind: 'complaint', route: 'parent_to_teacher', recipientRole: 'instructor', recipientUid: 'teacherA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'parentA', createdByRole: 'parent', participantUids: ['parentA', 'teacherA'], readBy: ['parentA'],
      }))
    )
  })

  it('a parent can send a general feedback case to the admin (no specific recipient)', async () => {
    await seedFeedbackFixture('schoolA', 'A')

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertSucceeds(
      addDoc(collection(parentCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'parent_to_admin', recipientRole: 'admin', recipientUid: null, studentUid: null, subjectId: null,
        createdByUid: 'parentA', createdByRole: 'parent', participantUids: ['parentA'], readBy: ['parentA'],
      }))
    )
  })

  it('an instructor can send feedback to the parent of a student they teach', async () => {
    await seedFeedbackFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(
      addDoc(collection(teacherCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
    )
  })

  it('an instructor cannot send feedback about a student they do not teach', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    await seedUser('schoolA', 'otherTeacher', { name: 'T2', role: 'instructor', email: 'ot@x.com' })

    const teacherCtx = testEnv.authenticatedContext('otherTeacher')
    await assertFails(
      addDoc(collection(teacherCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'otherTeacher', createdByRole: 'instructor', participantUids: ['otherTeacher', 'parentA'], readBy: ['otherTeacher'],
      }))
    )
  })

  it('an instructor cannot send feedback to a parent in another school', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    await seedFeedbackFixture('schoolB', 'B')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      addDoc(collection(teacherCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentB',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentB'], readBy: ['teacherA'],
      }))
    )
  })

  it('the admin can send feedback to a parent in their own school', async () => {
    await seedFeedbackFixture('schoolA', 'A')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'feedbackCases'), baseCase({
        route: 'admin_to_parent', recipientRole: 'parent', recipientUid: 'parentA', studentUid: 'studentA', subjectId: null,
        createdByUid: 'adminA', createdByRole: 'admin', participantUids: ['adminA', 'parentA'], readBy: ['adminA'],
      }))
    )
  })

  it('a third party who is not a participant cannot read a private teacher<->parent case', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    await seedUser('schoolA', 'strangerA', { name: 'S', role: 'parent', email: 'str@x.com', childUids: [] })
    let feedbackId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
      feedbackId = ref.id
    })

    const strangerCtx = testEnv.authenticatedContext('strangerA')
    await assertFails(getDoc(doc(strangerCtx.firestore(), 'feedbackCases', feedbackId)))
  })

  it('the admin cannot read a private teacher<->parent case unless it is escalated', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    let feedbackId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
      feedbackId = ref.id
    })

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertFails(getDoc(doc(adminCtx.firestore(), 'feedbackCases', feedbackId)))
  })

  it('a participant cannot tamper with participantUids or content while updating status', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    let feedbackId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
      feedbackId = ref.id
    })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(
      setDoc(doc(parentCtx.firestore(), 'feedbackCases', feedbackId), { title: 'استولى على العنوان' }, { merge: true })
    )
    await assertSucceeds(
      setDoc(doc(parentCtx.firestore(), 'feedbackCases', feedbackId), { status: 'resolved', resolvedAt: Date.now() }, { merge: true })
    )
  })

  it('an internal admin note is not readable by the case participants', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    let feedbackId, internalReplyId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const caseRef = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'parent_to_admin', recipientRole: 'admin', recipientUid: null, studentUid: 'studentA', subjectId: null,
        createdByUid: 'parentA', createdByRole: 'parent', participantUids: ['parentA'], readBy: ['parentA'],
      }))
      feedbackId = caseRef.id
      const replyRef = await addDoc(collection(ctx.firestore(), 'feedbackReplies'), {
        feedbackId, schoolId: 'schoolA', authorUid: 'adminA', authorRole: 'admin', body: 'ملاحظة داخلية', visibility: 'admin_internal', createdAt: Date.now(),
      })
      internalReplyId = replyRef.id
    })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertFails(getDoc(doc(parentCtx.firestore(), 'feedbackReplies', internalReplyId)))

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'feedbackReplies', internalReplyId)))
  })

  it('listing replies by feedbackId works for a participant but not for a stranger', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    await seedUser('schoolA', 'strangerA', { name: 'S', role: 'parent', email: 'str@x.com', childUids: [] })
    let feedbackId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const caseRef = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
      feedbackId = caseRef.id
      await addDoc(collection(ctx.firestore(), 'feedbackReplies'), {
        feedbackId, schoolId: 'schoolA', authorUid: 'teacherA', authorRole: 'instructor', body: 'رد', visibility: 'participants', createdAt: Date.now(),
      })
    })

    const parentCtx = testEnv.authenticatedContext('parentA')
    const parentQuery = query(
      collection(parentCtx.firestore(), 'feedbackReplies'),
      where('feedbackId', '==', feedbackId), where('schoolId', '==', 'schoolA'), where('visibility', '==', 'participants')
    )
    await assertSucceeds(getDocs(parentQuery))

    const strangerCtx = testEnv.authenticatedContext('strangerA')
    const strangerQuery = query(
      collection(strangerCtx.firestore(), 'feedbackReplies'),
      where('feedbackId', '==', feedbackId), where('schoolId', '==', 'schoolA'), where('visibility', '==', 'participants')
    )
    await assertFails(getDocs(strangerQuery))
  })

  it('a participant can reply on their own case', async () => {
    await seedFeedbackFixture('schoolA', 'A')
    let feedbackId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'feedbackCases'), baseCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid: 'parentA',
        studentUid: 'studentA', subjectId: 'subjA',
        createdByUid: 'teacherA', createdByRole: 'instructor', participantUids: ['teacherA', 'parentA'], readBy: ['teacherA'],
      }))
      feedbackId = ref.id
    })

    const parentCtx = testEnv.authenticatedContext('parentA')
    await assertSucceeds(
      addDoc(collection(parentCtx.firestore(), 'feedbackReplies'), {
        feedbackId, schoolId: 'schoolA', authorUid: 'parentA', authorRole: 'parent', body: 'شكراً', visibility: 'participants', createdAt: Date.now(),
      })
    )
  })
})

describe('schedule ops (توفر المعلمين / غياب / تغطية)', () => {
  async function seedScheduleFixture(schoolId, suffix) {
    await seedSchoolWithAdmin(schoolId, `admin${suffix}`)
    await seedUser(schoolId, `teacher${suffix}`, { name: 'T', role: 'instructor', email: `t${suffix}@x.com`, taughtSectionIds: [`sec${suffix}`] })
  }

  it('an admin can set their own school\'s teacher availability', async () => {
    await seedScheduleFixture('schoolA', 'A')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'teacherAvailability', 'teacherA'), {
        teacherUid: 'teacherA', schoolId: 'schoolA', unavailable: [{ day: 1, period: 3 }], updatedAt: Date.now(),
      })
    )
  })

  it('an instructor cannot set teacher availability', async () => {
    await seedScheduleFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      setDoc(doc(teacherCtx.firestore(), 'teacherAvailability', 'teacherA'), {
        teacherUid: 'teacherA', schoolId: 'schoolA', unavailable: [], updatedAt: Date.now(),
      })
    )
  })

  it('an admin cannot read another school\'s teacher availability', async () => {
    await seedScheduleFixture('schoolA', 'A')
    await seedScheduleFixture('schoolB', 'B')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'teacherAvailability', 'teacherB'), {
        teacherUid: 'teacherB', schoolId: 'schoolB', unavailable: [], updatedAt: Date.now(),
      })
    })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(getDoc(doc(adminACtx.firestore(), 'teacherAvailability', 'teacherB')))
  })

  it('an admin can report a teacher absence in their own school', async () => {
    await seedScheduleFixture('schoolA', 'A')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'teacherAbsences'), {
        schoolId: 'schoolA', teacherUid: 'teacherA', teacherName: 'T', date: '2026-08-10',
        periods: [1, 2], reason: 'مرض', status: 'open', createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(),
      })
    )
  })

  it('an instructor cannot report a teacher absence', async () => {
    await seedScheduleFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      addDoc(collection(teacherCtx.firestore(), 'teacherAbsences'), {
        schoolId: 'schoolA', teacherUid: 'teacherA', teacherName: 'T', date: '2026-08-10',
        periods: [1], reason: '', status: 'open', createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
    )
  })

  it('an admin can assign a substitute, and the log is immutable afterwards', async () => {
    await seedScheduleFixture('schoolA', 'A')
    await seedUser('schoolA', 'subA', { name: 'Sub', role: 'instructor', email: 'sub@x.com' })

    const adminCtx = testEnv.authenticatedContext('adminA')
    const ref = await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'substituteCoverage'), {
        schoolId: 'schoolA', absenceId: 'absA', date: '2026-08-10', day: 1, period: 2,
        sectionId: 'secA', sectionName: 'Sec', subjectId: 'subjA', subjectName: 'Math',
        originalTeacherUid: 'teacherA', originalTeacherName: 'T', substituteTeacherUid: 'subA', substituteTeacherName: 'Sub',
        createdByUid: 'adminA', createdAt: Date.now(),
      })
    )
    await assertFails(updateDoc(doc(adminCtx.firestore(), 'substituteCoverage', ref.id), { substituteTeacherUid: 'teacherA' }))
  })
})

describe('studentInterventions (خطط تدخل الطلاب)', () => {
  async function seedInterventionFixture(schoolId, suffix) {
    await seedSchoolWithAdmin(schoolId, `admin${suffix}`)
    await seedUser(schoolId, `teacher${suffix}`, { name: 'T', role: 'instructor', email: `t${suffix}@x.com` })
    await seedUser(schoolId, `student${suffix}`, { name: 'St', role: 'student', email: `s${suffix}@x.com`, sectionId: `sec${suffix}` })
  }

  it('an admin can create an intervention plan for a student in their own school', async () => {
    await seedInterventionFixture('schoolA', 'A')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'studentInterventions'), {
        schoolId: 'schoolA', studentUid: 'studentA', studentName: 'St', riskLevel: 'high', reason: 'غياب متكرر',
        assignedToUid: 'teacherA', assignedToName: 'T', action: '', followUpDate: null, status: 'open',
        timeline: [], createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
    )
  })

  it('an instructor cannot read a student\'s intervention plans', async () => {
    await seedInterventionFixture('schoolA', 'A')
    let interventionId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'studentInterventions'), {
        schoolId: 'schoolA', studentUid: 'studentA', studentName: 'St', riskLevel: 'high', reason: 'غياب متكرر',
        assignedToUid: 'teacherA', assignedToName: 'T', action: '', followUpDate: null, status: 'open',
        timeline: [], createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
      interventionId = ref.id
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'studentInterventions', interventionId)))
  })

  it('an admin cannot read another school\'s intervention plans', async () => {
    await seedInterventionFixture('schoolA', 'A')
    await seedInterventionFixture('schoolB', 'B')
    let interventionId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'studentInterventions'), {
        schoolId: 'schoolB', studentUid: 'studentB', studentName: 'St', riskLevel: 'high', reason: 'غياب متكرر',
        assignedToUid: null, assignedToName: null, action: '', followUpDate: null, status: 'open',
        timeline: [], createdByUid: 'adminB', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
      interventionId = ref.id
    })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(getDoc(doc(adminACtx.firestore(), 'studentInterventions', interventionId)))
  })
})

describe('homework submission status machine (submitted -> returned -> resubmitted -> graded)', () => {
  async function seedSubmissionFixture(schoolId, suffix) {
    await seedSchoolWithAdmin(schoolId, `admin${suffix}`)
    await seedUser(schoolId, `teacher${suffix}`, { name: 'T', role: 'instructor', email: `t${suffix}@x.com` })
    await seedUser(schoolId, `student${suffix}`, { name: 'St', role: 'student', email: `s${suffix}@x.com`, sectionId: `sec${suffix}` })
    let subId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'subjects', `subj${suffix}`), {
        name: 'رياضيات', schoolId, sectionId: `sec${suffix}`, teacherUid: `teacher${suffix}`, teacherName: 'T', lessons: [],
      })
      await setDoc(doc(db, 'homework', `hw${suffix}`), {
        courseId: `subj${suffix}`, title: 'واجب', description: '', materialUrl: null, rubric: null,
        deadline: Date.now() + 86400000, schoolId, academicYear: '2025-2026', createdAt: Date.now(),
      })
      const ref = doc(db, 'submissions', `student${suffix}_hw${suffix}`)
      await setDoc(ref, {
        studentUid: `student${suffix}`, homeworkId: `hw${suffix}`, url: 'https://drive.example/a', schoolId,
        academicYear: '2025-2026', submittedAt: Date.now(), status: 'submitted', attemptCount: 1,
        teacherComment: null, gradedAt: null, timeline: [{ atMs: Date.now(), kind: 'submitted', by: 'student' }],
      })
      subId = ref.id
    })
    return subId
  }

  it('the subject teacher can return a submission with a comment', async () => {
    const subId = await seedSubmissionFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(
      updateDoc(doc(teacherCtx.firestore(), 'submissions', subId), {
        status: 'returned', teacherComment: 'راجع سؤال 3', timeline: [{ atMs: Date.now(), kind: 'returned', by: 'instructor', note: 'راجع سؤال 3' }],
      })
    )
  })

  it('the teacher cannot rewrite the submission url while returning it', async () => {
    const subId = await seedSubmissionFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      updateDoc(doc(teacherCtx.firestore(), 'submissions', subId), {
        status: 'returned', teacherComment: 'x', url: 'https://drive.example/tampered',
      })
    )
  })

  it('a student cannot resubmit before the teacher has returned it', async () => {
    const subId = await seedSubmissionFixture('schoolA', 'A')

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(
      updateDoc(doc(studentCtx.firestore(), 'submissions', subId), {
        url: 'https://drive.example/b', status: 'resubmitted', attemptCount: 2,
      })
    )
  })

  it('a student can resubmit once the teacher has returned it', async () => {
    const subId = await seedSubmissionFixture('schoolA', 'A')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'submissions', subId), { status: 'returned', teacherComment: 'راجع سؤال 3' })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(
      updateDoc(doc(studentCtx.firestore(), 'submissions', subId), {
        url: 'https://drive.example/b', submittedAt: Date.now(), status: 'resubmitted', attemptCount: 2,
      })
    )
  })

  it('another school\'s teacher cannot return or grade the submission', async () => {
    const subId = await seedSubmissionFixture('schoolA', 'A')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await seedUser('schoolB', 'teacherB', { name: 'T2', role: 'instructor', email: 't2@x.com' })

    const otherTeacherCtx = testEnv.authenticatedContext('teacherB')
    await assertFails(
      updateDoc(doc(otherTeacherCtx.firestore(), 'submissions', subId), { status: 'returned', teacherComment: 'x' })
    )
  })
})
