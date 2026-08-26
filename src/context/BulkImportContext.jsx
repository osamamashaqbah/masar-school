import { createContext, useContext } from 'react'
import { auth } from '../firebase'
import { useSession } from './SessionContext'

const BulkImportContext = createContext(null)
const workerUrl = (import.meta.env.VITE_ADMIN_OPS_WORKER_URL || '').replace(/\/$/, '')

const ARABIC_TO_LATIN = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ء': 'a', 'ئ': 'e', 'ؤ': 'o', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'َ': '', 'ُ': '', 'ِ': '', 'ّ': '', 'ْ': '', 'ً': '', 'ٌ': '', 'ٍ': '',
}

function slugify(name) {
  return name.split('').map((ch) => ARABIC_TO_LATIN[ch] ?? ch).join('').trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

async function createWorkerUser(body) {
  const currentUser = auth.currentUser
  if (!workerUrl || !currentUser) throw new Error('worker-unavailable')
  const token = await currentUser.getIdToken()
  const response = await fetch(`${workerUrl}/create-school-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...body, bulk: true }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.error || `HTTP_${response.status}`)
  return data
}

export function BulkImportProvider({ children }) {
  const { session } = useSession()

  async function importStudents(students, onProgress, { onlyIndices } = {}) {
    if (!session || session.role !== 'admin') throw new Error('permission_denied')
    const selected = onlyIndices ? new Set(onlyIndices) : null
    const work = students.map((student, rowIndex) => ({ student, rowIndex })).filter(({ rowIndex }) => !selected || selected.has(rowIndex))
    const results = []
    let completed = 0

    async function processStudent({ student, rowIndex }) {
      const { name, sectionId, parentPhone, parentName: customParentName } = student
      const slug = slugify(name)
      const studentEmail = `${session.schoolId}-${sectionId}-${slug}@masar-school.local`
      try {
        const studentData = await createWorkerUser({ name, email: studentEmail, role: 'student', sectionId })
        results.push({ rowIndex, name, email: studentEmail, password: studentData.temporaryPassword, status: studentData.existing ? 'resumed' : 'ok', role: 'student', note: studentData.existing ? 'تم استكمال حساب الطالب الموجود' : '' })

        const parentSlug = parentPhone ? parentPhone.replace(/\D/g, '') : `${sectionId}-${slug}`
        const parentEmail = `wali-${session.schoolId}-${parentSlug}@masar-school.local`
        const parentName = customParentName || `ولي أمر ${name}`
        const parentData = await createWorkerUser({ name: parentName, email: parentEmail, role: 'parent', childUids: [studentData.uid] })
        results.push({ rowIndex, name: parentName, email: parentEmail, password: parentData.temporaryPassword, status: parentData.existing ? 'linked' : 'ok', role: 'parent', note: parentData.existing ? `تم ربط حساب ولي الأمر الموجود مع ${name}` : '' })
      } catch (err) {
        results.push({ rowIndex, name, email: studentEmail, password: null, status: 'error', role: 'student', error: err.message })
      } finally {
        completed += 1
        onProgress?.({ completed, total: work.length })
      }
    }

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

  return <BulkImportContext.Provider value={{ importStudents }}>{children}</BulkImportContext.Provider>
}

export function useBulkImport() {
  const ctx = useContext(BulkImportContext)
  if (!ctx) throw new Error('useBulkImport must be used inside BulkImportProvider')
  return ctx
}
