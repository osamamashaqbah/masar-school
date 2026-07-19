import { createContext, useContext } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'

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
  // students: [{ name, sectionId }, ...]
  // لكل طالب بننشئ حسابين: حساب الطالب نفسه، وحساب ولي أمر مرتبط فيه تلقائيًا (childUids)،
  // حتى ما يضطر صاحب المنصة يرجع يعمل حساب ولي أمر يدوي لكل طالب لحاله.
  async function importStudents(students) {
    const results = []

    for (let i = 0; i < students.length; i++) {
      const { name, sectionId } = students[i]
      const slug = slugify(name).toLowerCase()
      const studentEmail = `${slug}${Date.now()}${i}@masar-school.local`
      const studentPassword = `Student${Math.floor(1000 + Math.random() * 9000)}`
      const parentEmail = `wali-${slug}${Date.now()}${i}@masar-school.local`
      const parentPassword = `Parent${Math.floor(1000 + Math.random() * 9000)}`
      const parentName = `ولي أمر ${name}`

      const secondaryApp = initializeApp(firebaseConfig, `bulk-${Date.now()}-${i}`)
      const secondaryAuth = getAuth(secondaryApp)

      try {
        const studentCredential = await createUserWithEmailAndPassword(secondaryAuth, studentEmail, studentPassword)
        const studentUid = studentCredential.user.uid
        await setDoc(doc(db, 'users', studentUid), {
          name,
          role: 'student',
          email: studentEmail,
          sectionId,
        })
        results.push({ name, email: studentEmail, password: studentPassword, status: 'ok', role: 'student' })

        try {
          const parentCredential = await createUserWithEmailAndPassword(secondaryAuth, parentEmail, parentPassword)
          await setDoc(doc(db, 'users', parentCredential.user.uid), {
            name: parentName,
            role: 'parent',
            email: parentEmail,
            childUids: [studentUid],
          })
          results.push({ name: parentName, email: parentEmail, password: parentPassword, status: 'ok', role: 'parent' })
        } catch (parentErr) {
          results.push({ name: parentName, email: parentEmail, password: null, status: 'error', error: parentErr.message, role: 'parent' })
        }

        await signOut(secondaryAuth)
      } catch (err) {
        results.push({ name, email: studentEmail, password: null, status: 'error', error: err.message, role: 'student' })
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