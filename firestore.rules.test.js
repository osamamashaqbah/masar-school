import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, runTransaction } from 'firebase/firestore'

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

  it('an admin cannot promote an existing user to admin by editing the role', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertFails(updateDoc(doc(adminCtx.firestore(), 'users', 'teacherA'), { role: 'admin' }))
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

  it('an instructor cannot read students or parents from another school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@a.com' })
    await seedUser('schoolB', 'studentB', { name: 'Student B', role: 'student', email: 's@b.com' })
    await seedUser('schoolB', 'parentB', { name: 'Parent B', role: 'parent', email: 'p@b.com', childUids: ['studentB'] })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'users', 'studentB')))
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'users', 'parentB')))
  })
})

describe('marks and attendance tenant boundaries', () => {
  async function seedTeacherFixture() {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'schools', 'schoolA'), { currentAcademicYear: '2025-2026' }, { merge: true })
      await setDoc(doc(ctx.firestore(), 'subjects', 'subjA'), {
        schoolId: 'schoolA', sectionId: 'sec1', teacherUid: 'teacherA', name: 'رياضيات', lessons: [],
      })
    })
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@a.com', taughtSectionIds: ['sec1'] })
    await seedUser('schoolA', 'studentA', { name: 'Student A', role: 'student', email: 's@a.com', sectionId: 'sec1' })
    await seedUser('schoolA', 'studentOtherSection', { name: 'Student other section', role: 'student', email: 'other@a.com', sectionId: 'sec2' })
    await seedUser('schoolB', 'studentB', { name: 'Student B', role: 'student', email: 's@b.com', sectionId: 'sec1' })
  }

  it('a teacher cannot write marks or attendance for a same-section student from another school', async () => {
    await seedTeacherFixture()
    const teacherCtx = testEnv.authenticatedContext('teacherA')

    await assertFails(setDoc(doc(teacherCtx.firestore(), 'marks', 'cross-school-mark'), {
      subjectId: 'subjA', studentUid: 'studentB', categoryId: 'quiz', score: 8, maxScore: 10,
      teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
    }))
    await assertFails(setDoc(doc(teacherCtx.firestore(), 'attendance', 'cross-school-attendance'), {
      studentUid: 'studentB', sectionId: 'sec1', date: '2026-01-01', excused: false,
      teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
    }))
  })

  it('marks enforce numeric bounds while allowing a zero score', async () => {
    await seedTeacherFixture()
    const teacherCtx = testEnv.authenticatedContext('teacherA')
    const mark = (score, id) => setDoc(doc(teacherCtx.firestore(), 'marks', id), {
      subjectId: 'subjA', studentUid: 'studentA', categoryId: 'quiz', score, maxScore: 10,
      teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
    })

    await assertSucceeds(mark(0, 'zero-score'))
    await assertFails(mark(-1, 'negative-score'))
    await assertFails(mark(11, 'over-max-score'))
  })

  it('a teacher cannot record attendance outside their assigned sections', async () => {
    await seedTeacherFixture()
    const teacherCtx = testEnv.authenticatedContext('teacherA')

    await assertFails(setDoc(doc(teacherCtx.firestore(), 'attendance', 'other-section-attendance'), {
      studentUid: 'studentOtherSection', sectionId: 'sec2', date: '2026-01-01', excused: false,
      teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
    }))
  })

  it('any instructor who teaches the section can read and update its attendance record directly', async () => {
    await seedTeacherFixture()
    await seedUser('schoolA', 'teacherB', { name: 'T2', role: 'instructor', email: 't2@a.com', taughtSectionIds: ['sec1'] })
    await setDoc(doc(testEnv.authenticatedContext('teacherA').firestore(), 'attendance', 'studentA_2026-01-02'), {
      studentUid: 'studentA', sectionId: 'sec1', date: '2026-01-02', excused: false,
      teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
    })

    const teacherBCtx = testEnv.authenticatedContext('teacherB')
    await assertSucceeds(getDoc(doc(teacherBCtx.firestore(), 'attendance', 'studentA_2026-01-02')))
    await assertSucceeds(updateDoc(doc(teacherBCtx.firestore(), 'attendance', 'studentA_2026-01-02'), {
      excused: true, updatedByUid: 'teacherB',
    }))
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
        studentUid: 'studentA', schoolId: 'schoolA', sectionId: 'sec1', instructorUids: ['teacherA'], attendanceAlert: true, updatedAt: Date.now(),
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

  it('an instructor cannot read an early-warning doc for a section they do not teach', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com', taughtSectionIds: ['sec1'] })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'earlyWarnings', 'studentB'), {
        studentUid: 'studentB', schoolId: 'schoolA', sectionId: 'sec2', attendanceAlert: true, updatedAt: Date.now(),
      })
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'earlyWarnings', 'studentB')))
  })

  it('an instructor can query early warnings for their taught sections', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com', taughtSectionIds: ['sec1'], childUids: [] })
    await seedUser('schoolA', 'studentA', { name: 'S', role: 'student', email: 's@x.com', sectionId: 'sec1', parentUids: [] })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'earlyWarnings', 'studentA'), {
        studentUid: 'studentA', schoolId: 'schoolA', sectionId: 'sec1', instructorUids: ['teacherA'], attendanceAlert: true, updatedAt: Date.now(),
      })
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    const snap = await assertSucceeds(getDocs(query(
      collection(teacherCtx.firestore(), 'earlyWarnings'), where('instructorUids', 'array-contains', 'teacherA'),
      where('schoolId', '==', 'schoolA'),
    )))
    expect(snap.size).toBe(1)
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
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj1'), { schoolId: 'schoolA', sectionId: 'sec1', teacherUid: 'teacherA' })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(
      setDoc(doc(studentCtx.firestore(), 'quizStats', 'studentA_subj1_2025-2026'), {
        uid: 'studentA', subjectId: 'subj1', schoolId: 'schoolA', academicYear: '2025-2026', attempts: 1, correct: 1,
      })
    )
  })

  it('a student cannot write academic records for a subject outside their section', async () => {
    await seedSchoolWithYear('schoolA', 'adminA', '2025-2026')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'subjects', 'subj2'), { schoolId: 'schoolA', sectionId: 'sec2', teacherUid: 'teacherA' })
      await setDoc(doc(db, 'homework', 'hw2'), { courseId: 'subj2', schoolId: 'schoolA', academicYear: '2025-2026' })
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(setDoc(doc(studentCtx.firestore(), 'progress', 'studentA_subj2_2025-2026'), {
      uid: 'studentA', subjectId: 'subj2', completedLessons: 1, schoolId: 'schoolA', academicYear: '2025-2026',
    }))
    await assertFails(setDoc(doc(studentCtx.firestore(), 'quizStats', 'studentA_subj2_2025-2026'), {
      uid: 'studentA', subjectId: 'subj2', attempts: 1, correct: 1, schoolId: 'schoolA', academicYear: '2025-2026',
    }))
    await assertFails(addDoc(collection(studentCtx.firestore(), 'questions'), {
      studentUid: 'studentA', subjectId: 'subj2', text: 'سؤال', schoolId: 'schoolA', academicYear: '2025-2026',
    }))
    await assertFails(setDoc(doc(studentCtx.firestore(), 'submissions', 'studentA_hw2'), {
      studentUid: 'studentA', homeworkId: 'hw2', url: 'https://example.com/work', schoolId: 'schoolA', academicYear: '2025-2026',
      status: 'submitted', attemptCount: 1,
    }))
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

describe('instructor subject-scoped list queries', () => {
  it('rejects school-wide academic queries and allows a query scoped to the instructor subject', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'subjects', 'subjA'), { schoolId: 'schoolA', sectionId: 'sec1', teacherUid: 'teacherA' })
      await setDoc(doc(db, 'progress', 'pA'), { uid: 'studentA', subjectId: 'subjA', schoolId: 'schoolA', completedLessons: 1 })
      await setDoc(doc(db, 'quizStats', 'qA'), { uid: 'studentA', subjectId: 'subjA', schoolId: 'schoolA', attempts: 1, correct: 1 })
      await setDoc(doc(db, 'questions', 'askA'), { studentUid: 'studentA', subjectId: 'subjA', schoolId: 'schoolA', text: 'سؤال' })
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    for (const collectionId of ['progress', 'quizStats', 'questions']) {
      await assertFails(getDocs(query(collection(teacherCtx.firestore(), collectionId), where('schoolId', '==', 'schoolA'))))
      const snap = await assertSucceeds(getDocs(query(
        collection(teacherCtx.firestore(), collectionId), where('schoolId', '==', 'schoolA'), where('subjectId', 'in', ['subjA']),
      )))
      expect(snap.size).toBe(1)
    }
  })
})

describe('lesson notes access', () => {
  it('limits lesson notes to the subject teacher, its students, and school admins', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })
    await seedUser('schoolA', 'studentA', { name: 'Student A', role: 'student', email: 'sa@x.com', sectionId: 'sec1' })
    await seedUser('schoolA', 'studentB', { name: 'Student B', role: 'student', email: 'sb@x.com', sectionId: 'sec2' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'subjects', 'subjA'), { schoolId: 'schoolA', sectionId: 'sec1', teacherUid: 'teacherA' })
      await setDoc(doc(db, 'notes', 'subjA_0'), { courseId: 'subjA', lessonIndex: 0, text: 'راجعوا التمرين', instructorUid: 'teacherA', schoolId: 'schoolA' })
    })

    for (const uid of ['adminA', 'teacherA', 'studentA']) {
      const ctx = testEnv.authenticatedContext(uid)
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'notes', 'subjA_0')))
    }
    const outsiderCtx = testEnv.authenticatedContext('studentB')
    await assertFails(getDoc(doc(outsiderCtx.firestore(), 'notes', 'subjA_0')))
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
        status: 'pending', requestedByUid: 'parentA', schoolId: 'schoolA', instructorUids: [],
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
        status: 'pending', requestedByUid: 'parentA', schoolId: 'schoolA', instructorUids: [],
      })
    )
  })

  it('an instructor cannot read an excuse request from a section they do not teach', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com', taughtSectionIds: ['sec1'] })
    let requestId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'excuseRequests'), {
        studentUid: 'studentB', sectionId: 'sec2', date: '2026-01-01', reason: 'سفر',
        status: 'pending', requestedByUid: 'parentB', schoolId: 'schoolA', instructorUids: ['teacherB'],
      })
      requestId = ref.id
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'excuseRequests', requestId)))
  })

  it('a notification created for oneself still requires the normal notification schema', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com' })
    const studentCtx = testEnv.authenticatedContext('studentA')

    await assertSucceeds(addDoc(collection(studentCtx.firestore(), 'notifications'), {
      recipientUid: 'studentA', message: 'تنبيه', type: 'info', schoolId: 'schoolA', read: false, createdAt: Date.now(),
    }))
    await assertFails(addDoc(collection(studentCtx.firestore(), 'notifications'), {
      recipientUid: 'studentA', message: 'تنبيه', schoolId: 'schoolA', read: false, createdAt: Date.now(),
    }))
  })

  it('an excuse decision cannot be changed after the first decision', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'schools', 'schoolA'), { currentAcademicYear: '2025-2026' }, { merge: true })
    })
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com', taughtSectionIds: ['sec1'] })
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'sec1' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'excuseRequests', 'request1'), {
        studentUid: 'studentA', sectionId: 'sec1', date: '2026-01-01', reason: 'سفر',
        status: 'pending', requestedByUid: 'parentA', schoolId: 'schoolA', instructorUids: ['teacherA'],
      })
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    const requestRef = doc(teacherCtx.firestore(), 'excuseRequests', 'request1')
    const attendanceRef = doc(teacherCtx.firestore(), 'attendance', 'studentA_2026-01-01')
    await assertSucceeds(runTransaction(teacherCtx.firestore(), async (transaction) => {
      const requestSnap = await transaction.get(requestRef)
      transaction.set(attendanceRef, {
        studentUid: 'studentA', sectionId: 'sec1', date: '2026-01-01', excused: true,
        teacherUid: 'teacherA', schoolId: 'schoolA', academicYear: '2025-2026',
      })
      transaction.update(requestRef, { status: 'approved', decidedAt: Date.now(), decidedByUid: 'teacherA' })
      return requestSnap.exists()
    }))
    await assertFails(updateDoc(requestRef, { status: 'rejected', decidedAt: Date.now(), decidedByUid: 'teacherA' }))
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

  it('a platform admin can write an audit entry for a school they support', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformAdmins', 'ownerA'), { name: 'Owner' })
    })
    const ownerCtx = testEnv.authenticatedContext('ownerA')
    await assertSucceeds(addDoc(collection(ownerCtx.firestore(), 'auditLog'), {
      schoolId: 'schoolA', actorUid: 'ownerA', action: 'support_access', targetType: 'school', createdAt: Date.now(),
    }))
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

  // بيانات الاختبار: instructor grading page كانت تعمل collection(db,'submissions') بدون أي where() —
  // القاعدة أعلاه بتعتمد على studentUid/homeworkId لكل وثيقة، فمستحيل تتأكد من أمان استعلام مفتوح
  // زي هيك، فـ Firestore برفض الاستعلام كامل (permission-denied) بدل ما يرجّع نتيجة مفلترة جزئياً.
  // الإصلاح: استعلام محدد بـ where('homeworkId', 'in', myHomeworkIds) — نفس الحقل يلي القاعدة أصلاً
  // بتتحقق منه، فبيصير الاستعلام "قابل للإثبات" للمعلّم صاحب هالواجبات فقط.
  describe('instructor submissions list query must be scoped, not fetched unfiltered', () => {
    it('an unscoped list query (no where at all) is rejected outright, not silently filtered', async () => {
      await seedSubmissionFixture('schoolA', 'A')

      const teacherCtx = testEnv.authenticatedContext('teacherA')
      await assertFails(getDocs(collection(teacherCtx.firestore(), 'submissions')))
    })

    it('a teacher scoped by their own homeworkId sees only their own students\' submissions', async () => {
      await seedSubmissionFixture('schoolA', 'A')
      await seedSubmissionFixture('schoolB', 'B')

      const teacherACtx = testEnv.authenticatedContext('teacherA')
      const snap = await assertSucceeds(
        getDocs(query(collection(teacherACtx.firestore(), 'submissions'), where('homeworkId', 'in', ['hwA'])))
      )
      expect(snap.docs.map((d) => d.id)).toEqual(['studentA_hwA'])
    })

    it('a teacher cannot read another school\'s submission even via a scoped homeworkId query', async () => {
      await seedSubmissionFixture('schoolA', 'A')
      await seedSubmissionFixture('schoolB', 'B')

      const teacherACtx = testEnv.authenticatedContext('teacherA')
      await assertFails(
        getDocs(query(collection(teacherACtx.firestore(), 'submissions'), where('homeworkId', 'in', ['hwB'])))
      )
    })
  })
})

describe('exam center (فترات وحصص الاختبارات)', () => {
  it('an admin can create a draft exam period for their own school', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(
      addDoc(collection(adminCtx.firestore(), 'examPeriods'), {
        schoolId: 'schoolA', name: 'امتحانات الفصل الأول', startDate: '2026-06-01', endDate: '2026-06-10',
        status: 'draft', createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
    )
  })

  it('an instructor cannot create an exam period', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'teacherA', { name: 'T', role: 'instructor', email: 't@x.com' })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      addDoc(collection(teacherCtx.firestore(), 'examPeriods'), {
        schoolId: 'schoolA', name: 'x', startDate: '2026-06-01', endDate: '2026-06-10',
        status: 'draft', createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(), updatedAt: Date.now(),
      })
    )
  })

  it('a student cannot read a draft exam period', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'secA' })
    let periodId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'examPeriods'), {
        schoolId: 'schoolA', name: 'x', startDate: '2026-06-01', endDate: '2026-06-10',
        status: 'draft', createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
      periodId = ref.id
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(getDoc(doc(studentCtx.firestore(), 'examPeriods', periodId)))
  })

  it('a student can read a published exam period and its slots', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedUser('schoolA', 'studentA', { name: 'St', role: 'student', email: 's@x.com', sectionId: 'secA' })
    let periodId, slotId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const periodRef = await addDoc(collection(db, 'examPeriods'), {
        schoolId: 'schoolA', name: 'x', startDate: '2026-06-01', endDate: '2026-06-10',
        status: 'published', createdByUid: 'adminA', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
      periodId = periodRef.id
      const slotRef = await addDoc(collection(db, 'examSlots'), {
        schoolId: 'schoolA', periodId, subjectId: 'subjA', subjectName: 'رياضيات', sectionId: 'secA', sectionName: 'Sec',
        date: '2026-06-02', startTime: '09:00', endTime: '10:00', roomName: 'A1', proctorUid: null, proctorName: null,
        createdByUid: 'adminA', createdAt: Date.now(),
      })
      slotId = slotRef.id
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'examPeriods', periodId)))
    await assertSucceeds(getDoc(doc(studentCtx.firestore(), 'examSlots', slotId)))
  })

  it('an admin cannot read another school\'s exam period even if published', async () => {
    await seedSchoolWithAdmin('schoolA', 'adminA')
    await seedSchoolWithAdmin('schoolB', 'adminB')
    let periodId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'examPeriods'), {
        schoolId: 'schoolB', name: 'x', startDate: '2026-06-01', endDate: '2026-06-10',
        status: 'published', createdByUid: 'adminB', createdByName: 'Admin', createdAt: Date.now(), updatedAt: Date.now(),
      })
      periodId = ref.id
    })

    const adminACtx = testEnv.authenticatedContext('adminA')
    await assertFails(getDoc(doc(adminACtx.firestore(), 'examPeriods', periodId)))
  })
})

describe('questionBank (بنك الأسئلة)', () => {
  async function seedBankFixture(schoolId, suffix) {
    await seedSchoolWithAdmin(schoolId, `admin${suffix}`)
    await seedUser(schoolId, `teacher${suffix}`, { name: 'T', role: 'instructor', email: `t${suffix}@x.com` })
    await seedUser(schoolId, `student${suffix}`, { name: 'St', role: 'student', email: `s${suffix}@x.com`, sectionId: `sec${suffix}` })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', `subj${suffix}`), {
        name: 'رياضيات', schoolId, sectionId: `sec${suffix}`, teacherUid: `teacher${suffix}`, teacherName: 'T', lessons: [],
      })
    })
  }

  it('the subject teacher can add a question to the bank', async () => {
    await seedBankFixture('schoolA', 'A')

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(
      addDoc(collection(teacherCtx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
    )
  })

  it('a teacher who does not teach the subject cannot add a question for it', async () => {
    await seedBankFixture('schoolA', 'A')
    await seedUser('schoolA', 'teacherB', { name: 'T2', role: 'instructor', email: 't2@x.com' })

    const otherTeacherCtx = testEnv.authenticatedContext('teacherB')
    await assertFails(
      addDoc(collection(otherTeacherCtx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherB', createdByName: 'T2', createdAt: Date.now(),
      })
    )
  })

  it('a student cannot read the question bank (would leak correct answers)', async () => {
    await seedBankFixture('schoolA', 'A')
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(getDoc(doc(studentCtx.firestore(), 'questionBank', qId)))
  })

  it('an instructor can read only questions for subjects they teach', async () => {
    await seedBankFixture('schoolA', 'A')
    await seedUser('schoolA', 'teacherB', { name: 'T2', role: 'instructor', email: 't2@x.com' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subjB'), {
        name: 'علوم', schoolId: 'schoolA', sectionId: 'secB', teacherUid: 'teacherB', lessons: [],
      })
    })
    let ownQuestionId, otherQuestionId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const own = await addDoc(collection(db, 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', questionText: 'سؤال أ', options: ['1', '2'], correctIndex: 0,
        difficulty: 'easy', tags: [], createdByUid: 'teacherA', timesUsed: 0, timesCorrect: 0,
      })
      const other = await addDoc(collection(db, 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjB', questionText: 'سؤال ب', options: ['1', '2'], correctIndex: 0,
        difficulty: 'easy', tags: [], createdByUid: 'teacherB', timesUsed: 0, timesCorrect: 0,
      })
      ownQuestionId = own.id
      otherQuestionId = other.id
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(getDoc(doc(teacherCtx.firestore(), 'questionBank', ownQuestionId)))
    await assertFails(getDoc(doc(teacherCtx.firestore(), 'questionBank', otherQuestionId)))
    const ownQuery = await assertSucceeds(getDocs(query(
      collection(teacherCtx.firestore(), 'questionBank'),
      where('schoolId', '==', 'schoolA'), where('subjectId', 'in', ['subjA']),
    )))
    expect(ownQuery.docs.map((d) => d.id)).toContain(ownQuestionId)
  })

  it('a student can still bump usage stats without reading the question', async () => {
    await seedBankFixture('schoolA', 'A')
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertSucceeds(updateDoc(doc(studentCtx.firestore(), 'questionBank', qId), { timesUsed: 1, timesCorrect: 1 }))
  })

  it('a student cannot tamper with the question content via the stats-update loophole', async () => {
    await seedBankFixture('schoolA', 'A')
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const studentCtx = testEnv.authenticatedContext('studentA')
    await assertFails(updateDoc(doc(studentCtx.firestore(), 'questionBank', qId), { timesUsed: 1, correctIndex: 0 }))
  })

  it('the subject teacher can edit their own question\'s content (subjectId unchanged)', async () => {
    await seedBankFixture('schoolA', 'A')
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const teacherCtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(updateDoc(doc(teacherCtx.firestore(), 'questionBank', qId), { questionText: '3+3=؟', options: ['5', '6'] }))
  })

  // الثغرة الأصلية: قاعدة update كانت بتتحقق من teachesSubject على القيمة القديمة لـ subjectId بس،
  // فمعلّم مادته subjA يقدر يغيّر subjectId للسؤال لمادة subjB (يعلّمها معلّم تاني) بدون أي تفويض
  // عليها — إثبات مباشر عبر المحاكي إنه هالتحديث كان ينجح قبل الإصلاح، ولازم يفشل بعده
  it('a teacher cannot reassign their own question into a subject they do not teach', async () => {
    await seedBankFixture('schoolA', 'A')
    await seedUser('schoolA', 'teacherB', { name: 'T2', role: 'instructor', email: 't2@x.com' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subjB'), {
        name: 'علوم', schoolId: 'schoolA', sectionId: 'secB', teacherUid: 'teacherB', teacherName: 'T2', lessons: [],
      })
    })
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const teacherACtx = testEnv.authenticatedContext('teacherA')
    await assertFails(
      updateDoc(doc(teacherACtx.firestore(), 'questionBank', qId), { subjectId: 'subjB', subjectName: 'علوم' })
    )
  })

  it('an admin can edit any question in their own school without changing subjectId', async () => {
    await seedBankFixture('schoolA', 'A')
    let qId
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qId = ref.id
    })

    const adminCtx = testEnv.authenticatedContext('adminA')
    await assertSucceeds(updateDoc(doc(adminCtx.firestore(), 'questionBank', qId), { difficulty: 'hard' }))
  })

  it('the subject teacher can delete their own question; another school\'s teacher cannot', async () => {
    await seedBankFixture('schoolA', 'A')
    await seedBankFixture('schoolB', 'B')
    let qIdA
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'questionBank'), {
        schoolId: 'schoolA', subjectId: 'subjA', subjectName: 'رياضيات', questionText: '2+2=؟',
        options: ['3', '4'], correctIndex: 1, difficulty: 'easy', tags: [],
        timesUsed: 0, timesCorrect: 0, createdByUid: 'teacherA', createdByName: 'T', createdAt: Date.now(),
      })
      qIdA = ref.id
    })

    const teacherBCtx = testEnv.authenticatedContext('teacherB')
    await assertFails(deleteDoc(doc(teacherBCtx.firestore(), 'questionBank', qIdA)))

    const teacherACtx = testEnv.authenticatedContext('teacherA')
    await assertSucceeds(deleteDoc(doc(teacherACtx.firestore(), 'questionBank', qIdA)))
  })
})
