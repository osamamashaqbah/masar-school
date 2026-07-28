// تست ضغط عالي: يبني عدة مدارس تجريبية بالتوازي (مو وحدة ورا وحدة)، كل مدرسة فيها بيانات كبيرة
// (طلاب/علامات/حضور)، مع كتابة batches بالتوازي كمان — عشان نولّد ضغط حقيقي على قاعدة البيانات.
// افتراضيًا يشتغل بس على Firebase Local Emulator (مجاني، بدون سقف يومي) — ما بيلمس الإنتاج إطلاقًا
// إلا لو مرّرت --prod صراحة مع تأكيد يدوي.
//
// التشغيل (الافتراضي — بيتطلب تشغيل الـ emulator أول: npx firebase emulators:start --only firestore):
//   node scripts/stress-test.mjs
// التشغيل على الإنتاج الحقيقي (خطير، محتاج تأكيد):
//   node scripts/stress-test.mjs --prod --yes-i-know-this-hits-production

import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const useProd = process.argv.includes('--prod')
if (!useProd) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
  console.log(`== وضع الـ Emulator المحلي (${process.env.FIRESTORE_EMULATOR_HOST}) — ما رح يلمس الإنتاج ==\n`)
} else if (!process.argv.includes('--yes-i-know-this-hits-production')) {
  console.error('هاد التست بالحجم الكبير رح يضرب الإنتاج الحقيقي. لو متأكد، أضف --yes-i-know-this-hits-production')
  process.exit(1)
} else {
  console.log('== تحذير: شغّال على الإنتاج الحقيقي masar-school-demo ==\n')
}

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
if (useProd) db.settings({ preferRest: true })

const SCHOOLS_COUNT = 8
const GRADES_PER_SCHOOL = 6
const SECTIONS_PER_GRADE = 3
const SUBJECTS_PER_SECTION = 4
const STUDENTS_PER_SECTION = 25 // 6*3*25 = 450 طالب/مدرسة
const INSTRUCTORS_PER_SCHOOL = 15
const ATTENDANCE_DAYS_PER_STUDENT = 20
const CATEGORIES = ['quiz', 'homework', 'exam1', 'exam2', 'continuous', 'final']
const ACADEMIC_YEAR = '2025-2026'
const BATCH_CONCURRENCY = 12 // كم batch يشتغلوا بالتوازي بنفس الوقت
const SCHOOL_CONCURRENCY = 4 // كم مدرسة تتبنى بنفس الوقت

let totalWrites = 0
const errors = []

const BATCH_TIMEOUT_MS = 20000
const MAX_RETRIES = 3

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`تعليق (timeout بعد ${ms / 1000}s): ${label}`)), ms)),
  ])
}

async function commitWithRetry(batch, label) {
  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await withTimeout(batch.commit(), BATCH_TIMEOUT_MS, label)
      return
    } catch (err) {
      lastErr = err
      console.warn(`  !! محاولة ${attempt}/${MAX_RETRIES} فشلت (${label}): ${err.message}`)
    }
  }
  throw lastErr
}

// يقسم ops لدفعات 400، وبيشغّل عدة دفعات بالتوازي (بدل وحدة ورا وحدة) لتوليد ضغط حقيقي
async function commitInChunks(ops, label) {
  const batchSize = 400
  const chunks = []
  for (let i = 0; i < ops.length; i += batchSize) chunks.push(ops.slice(i, i + batchSize))

  for (let i = 0; i < chunks.length; i += BATCH_CONCURRENCY) {
    const group = chunks.slice(i, i + BATCH_CONCURRENCY)
    await Promise.all(group.map((chunkOps, idx) => {
      const batch = db.batch()
      chunkOps.forEach((op) => op(batch))
      return commitWithRetry(batch, `${label} batch ${i + idx + 1}/${chunks.length}`)
    }))
  }
  totalWrites += ops.length
  console.log(`  ${label}: ${ops.length} وثيقة (${chunks.length} batch، تركيز ${BATCH_CONCURRENCY})`)
}

async function buildSchool(schoolIndex) {
  const schoolId = `STRESS_TEST_${Date.now()}_${schoolIndex}_${Math.random().toString(36).slice(2, 7)}`
  const schoolName = `مدرسة اختبار الضغط ${schoolIndex + 1}`
  await db.collection('schools').doc(schoolId).set({ name: schoolName, currentAcademicYear: ACADEMIC_YEAR, createdAt: Date.now() })

  const instructorUids = []
  const instructorOps = []
  for (let i = 0; i < INSTRUCTORS_PER_SCHOOL; i++) {
    const uid = db.collection('users').doc().id
    instructorUids.push(uid)
    instructorOps.push((batch) => batch.set(db.collection('users').doc(uid), {
      name: `معلّم تجريبي ${i}`, role: 'instructor', email: `stress-instructor-${schoolIndex}-${i}@test.local`, schoolId,
    }))
  }
  await commitInChunks(instructorOps, `[مدرسة ${schoolIndex + 1}] معلّمون`)

  const gradeSectionOps = []
  const sectionIds = []
  for (let g = 0; g < GRADES_PER_SCHOOL; g++) {
    const gradeId = db.collection('grades').doc().id
    gradeSectionOps.push((batch) => batch.set(db.collection('grades').doc(gradeId), { name: `صف ${g + 1}`, schoolId }))
    for (let s = 0; s < SECTIONS_PER_GRADE; s++) {
      const sectionId = db.collection('sections').doc().id
      sectionIds.push(sectionId)
      gradeSectionOps.push((batch) => batch.set(db.collection('sections').doc(sectionId), { name: `شعبة ${s + 1}`, gradeId, schoolId }))
    }
  }
  await commitInChunks(gradeSectionOps, `[مدرسة ${schoolIndex + 1}] صفوف وشعب`)

  const subjectOps = []
  const subjectsBySection = {}
  for (const sectionId of sectionIds) {
    subjectsBySection[sectionId] = []
    for (let sub = 0; sub < SUBJECTS_PER_SECTION; sub++) {
      const subjectId = db.collection('subjects').doc().id
      subjectsBySection[sectionId].push(subjectId)
      const teacherUid = instructorUids[Math.floor(Math.random() * instructorUids.length)]
      subjectOps.push((batch) => batch.set(db.collection('subjects').doc(subjectId), {
        name: `مادة ${sub + 1}`, sectionId, schoolId, academicYear: ACADEMIC_YEAR, teacherUid, lessons: [],
      }))
    }
  }
  await commitInChunks(subjectOps, `[مدرسة ${schoolIndex + 1}] مواد`)

  const studentOps = []
  const studentIdsBySection = {}
  for (const sectionId of sectionIds) {
    studentIdsBySection[sectionId] = []
    for (let st = 0; st < STUDENTS_PER_SECTION; st++) {
      const uid = db.collection('users').doc().id
      studentIdsBySection[sectionId].push(uid)
      studentOps.push((batch) => batch.set(db.collection('users').doc(uid), {
        name: `طالب تجريبي ${st}`, role: 'student', email: `stress-student-${uid}@test.local`, schoolId, sectionId,
      }))
    }
  }
  await commitInChunks(studentOps, `[مدرسة ${schoolIndex + 1}] طلاب`)

  const markOps = []
  const attendanceOps = []
  for (const sectionId of sectionIds) {
    const subjectIds = subjectsBySection[sectionId]
    for (const studentUid of studentIdsBySection[sectionId]) {
      for (const subjectId of subjectIds) {
        for (const categoryId of CATEGORIES) {
          const score = Math.floor(Math.random() * 20)
          const docId = `${studentUid}_${subjectId}_${categoryId}`
          markOps.push((batch) => batch.set(db.collection('marks').doc(docId), {
            subjectId, studentUid, categoryId, score, maxScore: 20, homeworkId: null,
            source: 'manual', schoolId, academicYear: ACADEMIC_YEAR, updatedAt: Date.now(),
          }))
        }
      }
      for (let d = 0; d < ATTENDANCE_DAYS_PER_STUDENT; d++) {
        const date = `2026-01-${String((d % 28) + 1).padStart(2, '0')}`
        const docId = `${studentUid}_${date}`
        attendanceOps.push((batch) => batch.set(db.collection('attendance').doc(docId), {
          studentUid, sectionId, date, excused: Math.random() > 0.6, schoolId, academicYear: ACADEMIC_YEAR, createdAt: Date.now(),
        }))
      }
    }
  }
  await commitInChunks(markOps, `[مدرسة ${schoolIndex + 1}] علامات`)
  await commitInChunks(attendanceOps, `[مدرسة ${schoolIndex + 1}] حضور`)

  return schoolId
}

async function readBenchmark(schoolIds) {
  const t0 = Date.now()
  await Promise.all(schoolIds.map((schoolId) => Promise.all([
    db.collection('users').where('schoolId', '==', schoolId).get(),
    db.collection('marks').where('schoolId', '==', schoolId).get(),
    db.collection('attendance').where('schoolId', '==', schoolId).get(),
  ])))
  console.log(`  قراءة ${schoolIds.length} مدرسة بالتوازي (كل وحدة users+marks+attendance): ${Date.now() - t0}ms`)
}

async function cleanupSchool(schoolId) {
  const collections = ['attendance', 'grades', 'marks', 'sections', 'subjects', 'users']
  for (const name of collections) {
    const snap = await withTimeout(db.collection(name).where('schoolId', '==', schoolId).get(), BATCH_TIMEOUT_MS, `قراءة ${name} للحذف`)
    const chunks = []
    for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400))
    for (let i = 0; i < chunks.length; i += BATCH_CONCURRENCY) {
      const group = chunks.slice(i, i + BATCH_CONCURRENCY)
      await Promise.all(group.map((docs) => {
        const batch = db.batch()
        docs.forEach((d) => batch.delete(d.ref))
        return commitWithRetry(batch, `حذف ${name}`)
      }))
    }
  }
  await withTimeout(db.collection('schools').doc(schoolId).delete(), BATCH_TIMEOUT_MS, 'حذف وثيقة المدرسة')
}

const overallStart = Date.now()

console.log(`== بناء ${SCHOOLS_COUNT} مدارس تجريبية بالتوازي (تركيز ${SCHOOL_CONCURRENCY}) ==`)
const schoolIds = []
for (let i = 0; i < SCHOOLS_COUNT; i += SCHOOL_CONCURRENCY) {
  const group = Array.from({ length: Math.min(SCHOOL_CONCURRENCY, SCHOOLS_COUNT - i) }, (_, k) => i + k)
  const results = await Promise.allSettled(group.map((idx) => buildSchool(idx)))
  results.forEach((r, k) => {
    if (r.status === 'fulfilled') { schoolIds.push(r.value); console.log(`مدرسة ${group[k] + 1} خلصت: ${r.value}`) }
    else { errors.push(`مدرسة ${group[k] + 1}: ${r.reason.message}`); console.error(`فشلت مدرسة ${group[k] + 1}:`, r.reason.message) }
  })
}

console.log('\n== قياس زمن القراءة بالتوازي (محاكاة عدة مدارس بتفتح لوحاتها بنفس الوقت) ==')
await readBenchmark(schoolIds)

console.log('\n== تنظيف: حذف كل بيانات الاختبار ==')
for (const schoolId of schoolIds) {
  await cleanupSchool(schoolId)
  console.log(`  حُذفت ${schoolId}`)
}

const totalMs = Date.now() - overallStart
console.log('\n===== التقرير النهائي =====')
console.log(`مدارس: ${schoolIds.length}/${SCHOOLS_COUNT} نجحت`)
console.log(`إجمالي الوثائق المكتوبة: ${totalWrites}`)
console.log(`متوسط سرعة الكتابة: ${(totalWrites / (totalMs / 1000)).toFixed(0)} وثيقة/ثانية`)
console.log(`الزمن الكلي (بناء + قراءة + حذف): ${(totalMs / 1000).toFixed(1)} ثانية`)
console.log(`أخطاء: ${errors.length === 0 ? 'لا يوجد' : errors.join(' | ')}`)
process.exit(0)
