import { createContext, useContext, useRef } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth'
import { collection, doc, setDoc, deleteDoc, writeBatch, arrayUnion, query, where, getDocs } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'

const BulkImportContext = createContext(null)

const ARABIC_TO_LATIN = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ء': 'a', 'ئ': 'e', 'ؤ': 'o',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
  'َ': '', 'ُ': '', 'ِ': '', 'ّ': '', 'ْ': '', 'ً': '', 'ٌ': '', 'ٍ': '',
}

function transliterate(text) {
  return text
    .split('')
    .map((ch) => (ARABIC_TO_LATIN[ch] !== undefined ? ARABIC_TO_LATIN[ch] : ch))
    .join('')
}

function slugify(name) {
  return transliterate(name)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
}

export function BulkImportProvider({ children }) {
  const { session } = useSession()
  const { allUsers } = useSchoolStructure()
  const knownUsersRef = useRef(new Map())

  async function findExistingUser(email, role) {
    const cacheKey = `${role}:${email}`
    const cached = knownUsersRef.current.get(cacheKey)
    if (cached) return cached

    const cachedProfile = allUsers.find((user) => user.email === email && user.role === role)
    if (cachedProfile) {
      const profile = { uid: cachedProfile.id, ...cachedProfile }
      knownUsersRef.current.set(cacheKey, profile)
      return profile
    }

    // allUsers مستمع المدرسة الكامل؛ إذا وصل ولم نجد الحساب فلا حاجة لقراءة إضافية لكل صف.
    // الاستعلام الاحتياطي يعمل فقط أثناء لحظة التحميل الأولى بعد فتح الصفحة.
    if (allUsers.length > 0) return null

    const snap = await getDocs(query(
      collection(db, 'users'),
      where('schoolId', '==', session.schoolId),
      where('email', '==', email),
    ))
    const existing = snap.docs
      .map((item) => ({ uid: item.id, ...item.data() }))
      .find((user) => user.role === role)
    if (existing) knownUsersRef.current.set(cacheKey, existing)
    return existing || null
  }

  // students: [{ name, sectionId, parentPhone?, parentName? }, ...]
  // كل عملية تعيد rowIndex حتى نعيد الصفوف الفاشلة فقط بدون فقدان نتائج المحاولة الأولى.
  async function importStudents(students, onProgress, { onlyIndices } = {}) {
    const results = []
    const parentByPhone = new Map()
    const selected = onlyIndices ? new Set(onlyIndices) : null
    const work = students
      .map((student, rowIndex) => ({ student, rowIndex }))
      .filter(({ rowIndex }) => !selected || selected.has(rowIndex))
    let completed = 0

    async function processStudent({ student, rowIndex }) {
      const { name, sectionId, parentPhone, parentName: customParentName } = student
      const slug = slugify(name).toLowerCase()
      // مفتاح ثابت (مدرسة+شعبة+اسم) يجعل إعادة المحاولة idempotent بدل إنشاء حسابات مكررة.
      const studentEmail = `${session.schoolId}-${sectionId}-${slug}@masar-school.local`
      const studentPassword = `Student${Math.floor(1000 + Math.random() * 9000)}`
      const secondaryApp = initializeApp(firebaseConfig, `bulk-${Date.now()}-${rowIndex}`)
      const secondaryAuth = getAuth(secondaryApp)

      try {
        const existingStudent = await findExistingUser(studentEmail, 'student')
        let studentUid
        let studentStatus = 'resumed'
        let studentNote = 'تم استكمال حساب الطالب الموجود من محاولة سابقة'

        if (existingStudent) {
          studentUid = existingStudent.uid
        } else {
          const studentCredential = await createUserWithEmailAndPassword(secondaryAuth, studentEmail, studentPassword)
          studentUid = studentCredential.user.uid
          try {
            await setDoc(doc(db, 'users', studentUid), {
              name, role: 'student', email: studentEmail, sectionId,
              schoolId: session.schoolId, mustChangePassword: true,
            })
          } catch (profileErr) {
            // فشل كتابة الملف الشخصي بعد نجاح Auth — تراجع فوري لمنع حساب يتيم.
            await deleteUser(studentCredential.user).catch(() => {})
            throw profileErr
          }
          studentStatus = 'ok'
          studentNote = ''
        }

        knownUsersRef.current.set(`student:${studentEmail}`, {
          uid: studentUid, name, role: 'student', email: studentEmail, sectionId, schoolId: session.schoolId,
        })
        results.push({ rowIndex, name, email: studentEmail, password: studentStatus === 'ok' ? studentPassword : null, status: studentStatus, role: 'student', note: studentNote })
        await signOut(secondaryAuth)

        const parentSlug = parentPhone ? parentPhone.replace(/\D/g, '') : `${sectionId}-${slug}`
        const parentEmail = `wali-${session.schoolId}-${parentSlug}@masar-school.local`
        const parentPassword = `Parent${Math.floor(1000 + Math.random() * 9000)}`
        const parentName = customParentName || `ولي أمر ${name}`
        const existingParent = parentPhone
          ? parentByPhone.get(parentPhone) || await findExistingUser(parentEmail, 'parent')
          : await findExistingUser(parentEmail, 'parent')

        if (existingParent) {
          try {
            const linkBatch = writeBatch(db)
            linkBatch.update(doc(db, 'users', existingParent.uid), { childUids: arrayUnion(studentUid) })
            linkBatch.update(doc(db, 'users', studentUid), { parentUids: arrayUnion(existingParent.uid) })
            await linkBatch.commit()
            results.push({
              rowIndex, name: existingParent.name || parentName, email: existingParent.email || parentEmail,
              password: null, status: 'linked', role: 'parent', note: `تم ربط حساب ولي الأمر الموجود مع ${name}`,
            })
            if (parentPhone) parentByPhone.set(parentPhone, existingParent)
          } catch (linkErr) {
            results.push({ rowIndex, name: existingParent.name || parentName, email: existingParent.email || parentEmail, password: null, status: 'error', error: linkErr.message, role: 'parent' })
          }
        } else {
          try {
            const parentCredential = await createUserWithEmailAndPassword(secondaryAuth, parentEmail, parentPassword)
            const parentRef = doc(db, 'users', parentCredential.user.uid)
            const studentRef = doc(db, 'users', studentUid)
            try {
              const profileBatch = writeBatch(db)
              profileBatch.set(parentRef, {
                name: parentName, role: 'parent', email: parentEmail, childUids: [studentUid],
                schoolId: session.schoolId, mustChangePassword: true,
              })
              profileBatch.update(studentRef, { parentUids: arrayUnion(parentCredential.user.uid) })
              await profileBatch.commit()
            } catch (profileErr) {
              await deleteDoc(parentRef).catch(() => {})
              await deleteUser(parentCredential.user).catch(() => {})
              throw profileErr
            }
            const parentProfile = { uid: parentCredential.user.uid, name: parentName, role: 'parent', email: parentEmail, childUids: [studentUid], schoolId: session.schoolId }
            knownUsersRef.current.set(`parent:${parentEmail}`, parentProfile)
            results.push({ rowIndex, name: parentName, email: parentEmail, password: parentPassword, status: 'ok', role: 'parent' })
            if (parentPhone) parentByPhone.set(parentPhone, parentProfile)
            await signOut(secondaryAuth)
          } catch (parentErr) {
            results.push({
              rowIndex, name: parentName, email: parentEmail, password: null, status: 'error', role: 'parent',
              error: parentErr.code === 'auth/email-already-in-use'
                ? 'حساب ولي الأمر موجود لكن ملفه لم يُقرأ بعد — أعد المحاولة لاستكمال الربط'
                : parentErr.message,
            })
          }
        }
      } catch (err) {
        results.push({
          rowIndex, name, email: studentEmail, password: null, status: 'error', role: 'student',
          error: err.code === 'auth/email-already-in-use'
            ? 'حساب الطالب موجود لكن ملفه لم يُقرأ بعد — أعد المحاولة لاستكماله'
            : err.message,
        })
      } finally {
        await deleteApp(secondaryApp)
        completed += 1
        onProgress?.({ completed, total: work.length })
      }
    }

    // العائلة الواحدة تبقى متسلسلة لإعادة استخدام حساب ولي الأمر، والعائلات المختلفة
    // تعمل على دفعات صغيرة حتى لا نضغط Firebase Auth.
    const groupsByParent = new Map()
    work.forEach(({ student, rowIndex }) => {
      const key = student.parentPhone || `row-${rowIndex}`
      if (!groupsByParent.has(key)) groupsByParent.set(key, [])
      groupsByParent.get(key).push({ student, rowIndex })
    })
    const groups = [...groupsByParent.values()]
    for (let i = 0; i < groups.length; i += 5) {
      await Promise.all(groups.slice(i, i + 5).map(async (group) => {
        for (const item of group) await processStudent(item)
      }))
    }

    return results
  }

  return (
    <BulkImportContext.Provider value={{ importStudents }}>
      {children}
    </BulkImportContext.Provider>
  )
}

export function useBulkImport() {
  const ctx = useContext(BulkImportContext)
  if (!ctx) throw new Error('useBulkImport must be used inside BulkImportProvider')
  return ctx
}
