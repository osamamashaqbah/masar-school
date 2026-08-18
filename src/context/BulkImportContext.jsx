import { createContext, useContext } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth'
import { doc, setDoc, deleteDoc, writeBatch, arrayUnion } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'
import { useSession } from './SessionContext'

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
  // students: [{ name, sectionId, parentPhone?, parentName? }, ...]
  // لكل طالب بننشئ حساب الطالب نفسه + حساب ولي أمر مرتبط فيه تلقائيًا (childUids).
  // إذا أكثر من طالب عندهم نفس "جوال ولي الأمر" (إخوان)، بنربطهم كلهم بنفس حساب ولي الأمر
  // بدل ما ننشئ حساب جديد لكل وحد.
  async function importStudents(students) {
    const results = []
    // جوال ولي الأمر -> { uid, email, password, name }
    const parentByPhone = new Map()

    for (let i = 0; i < students.length; i++) {
      const { name, sectionId, parentPhone, parentName: customParentName } = students[i]
      const slug = slugify(name).toLowerCase()
      // مفتاح ثابت (مدرسة+شعبة+اسم) بدل Date.now() — لو الاستيراد انقطع بالمنتصف، إعادة رفع
      // نفس الملف بترجع تصادف auth/email-already-in-use على الصفوف يلي خلصت فعلاً بدل ما
      // تنشئلها حسابات مكررة بأسماء بريد عشوائية (Bug 2.2، MASAR_CRITICAL_BUGS_DETAILED_AR.md)
      const studentEmail = `${session.schoolId}-${sectionId}-${slug}@masar-school.local`
      const studentPassword = `Student${Math.floor(1000 + Math.random() * 9000)}`
      const existingParent = parentPhone ? parentByPhone.get(parentPhone) : null

      const secondaryApp = initializeApp(firebaseConfig, `bulk-${Date.now()}-${i}`)
      const secondaryAuth = getAuth(secondaryApp)

      try {
        const studentCredential = await createUserWithEmailAndPassword(secondaryAuth, studentEmail, studentPassword)
        const studentUid = studentCredential.user.uid
        try {
          await setDoc(doc(db, 'users', studentUid), {
            name,
            role: 'student',
            email: studentEmail,
            sectionId,
            schoolId: session.schoolId,
          })
        } catch (profileErr) {
          // فشل كتابة الملف الشخصي بعد نجاح إنشاء حساب Auth — نتراجع فورًا بدل ترك حساب
          // يتيم بلا ملف تعريف وبريد محجوز للأبد (Bug 2.1، MASAR_CRITICAL_BUGS_DETAILED_AR.md)
          await deleteUser(studentCredential.user).catch(() => {})
          throw profileErr
        }
        results.push({ name, email: studentEmail, password: studentPassword, status: 'ok', role: 'student' })
        await signOut(secondaryAuth)

        if (existingParent) {
          // أخ/أخت لطالب سابق بنفس جوال ولي الأمر: نربط بنفس الحساب بدون ما ننشئ حساب جديد.
          try {
            const linkBatch = writeBatch(db)
            linkBatch.update(doc(db, 'users', existingParent.uid), { childUids: arrayUnion(studentUid) })
            linkBatch.update(doc(db, 'users', studentUid), { parentUids: arrayUnion(existingParent.uid) })
            await linkBatch.commit()
            results.push({
              name: existingParent.name, email: existingParent.email, password: null,
              status: 'linked', role: 'parent', note: `مرتبط بحساب ولي الأمر الموجود (إخوان مع ${name})`,
            })
          } catch (linkErr) {
            results.push({ name: existingParent.name, email: existingParent.email, password: null, status: 'error', error: linkErr.message, role: 'parent' })
          }
        } else {
          const parentSlug = parentPhone ? parentPhone.replace(/\D/g, '') : `${sectionId}-${slug}`
          const parentEmail = `wali-${session.schoolId}-${parentSlug}@masar-school.local`
          const parentPassword = `Parent${Math.floor(1000 + Math.random() * 9000)}`
          const parentName = customParentName || `ولي أمر ${name}`

          try {
            const parentCredential = await createUserWithEmailAndPassword(secondaryAuth, parentEmail, parentPassword)
            const parentRef = doc(db, 'users', parentCredential.user.uid)
            const studentRef = doc(db, 'users', studentUid)
            try {
              const profileBatch = writeBatch(db)
              profileBatch.set(parentRef, {
                name: parentName,
                role: 'parent',
                email: parentEmail,
                childUids: [studentUid],
                schoolId: session.schoolId,
              })
              // منعكسة على وثيقة الطالب نفسه (parentUids) حتى يقدر المعلّم يعرف مين أهل الطالب
              // ويبعتلهم إشعار (حضور/علامة) بدون ما يحتاج صلاحية جديدة يقرا فيها كل حسابات أولياء الأمور.
              profileBatch.update(studentRef, { parentUids: arrayUnion(parentCredential.user.uid) })
              await profileBatch.commit()
            } catch (profileErr) {
              await deleteDoc(parentRef).catch(() => {})
              await deleteUser(parentCredential.user).catch(() => {})
              throw profileErr
            }
            results.push({ name: parentName, email: parentEmail, password: parentPassword, status: 'ok', role: 'parent' })
            if (parentPhone) {
              parentByPhone.set(parentPhone, { uid: parentCredential.user.uid, email: parentEmail, password: parentPassword, name: parentName })
            }
            await signOut(secondaryAuth)
          } catch (parentErr) {
            if (parentErr.code === 'auth/email-already-in-use') {
              results.push({
                name: parentName, email: parentEmail, password: null, status: 'duplicate', role: 'parent',
                note: 'حساب ولي الأمر موجود مسبقًا من محاولة استيراد سابقة — راجع الربط يدويًا لو لزم',
              })
            } else {
              results.push({ name: parentName, email: parentEmail, password: null, status: 'error', error: parentErr.message, role: 'parent' })
            }
          }
        }
      } catch (err) {
        // ملاحظة: طالب مكرر بيتخطى بالكامل (بدون محاولة ربط ولي أمر) — تبسيط مقصود، لو
        // الصف قبله انحفظ الطالب بس فشل ولي الأمر، لازم مراجعة يدوية من صفحة إدارة المستخدمين.
        if (err.code === 'auth/email-already-in-use') {
          results.push({ name, email: studentEmail, password: null, status: 'duplicate', role: 'student', note: 'هذا الطالب مستورد مسبقًا (نفس الاسم والشعبة) — تم تخطيه' })
        } else {
          results.push({ name, email: studentEmail, password: null, status: 'error', error: err.message, role: 'student' })
        }
      } finally {
        await deleteApp(secondaryApp)
      }
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
