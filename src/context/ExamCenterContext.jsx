import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { logAudit } from '../utils/audit'

const ExamCenterContext = createContext(null)

// هل فترتين وقت (نفس اليوم) بتتقاطعوا؟ 'HH:MM' مقارنة نصّية = مقارنة زمنية طالما الصيغة موحّدة
function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

export function ExamCenterProvider({ children }) {
  const { session } = useSession()
  const { features, currentAcademicYear } = useSchoolStructure()
  const examCenterEnabled = features.examCenter !== false
  const [periods, setPeriods] = useState([])
  const [slotsByPeriod, setSlotsByPeriod] = useState({})
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  // Firestore ما بيفلتر النتائج حسب القواعد: الاستعلام نفسه لازم يثبت إن غير الإدارة
  // ما رح يطلب فترات draft، وإلا القاعدة بترفض الاستعلام كاملًا.
  useEffect(() => {
    if (!session || !examCenterEnabled || !currentAcademicYear) { setPeriods([]); setSlotsByPeriod({}); setError(''); return }
    setError('')
    const constraints = [where('schoolId', '==', session.schoolId), where('academicYear', '==', currentAcademicYear)]
    if (session.role !== 'admin') constraints.push(where('status', 'in', ['published', 'locked']))
    const q = query(collection(db, 'examPeriods'), ...constraints)
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
      setPeriods(list)
    }, (err) => { console.error('[مركز الاختبارات] فشل تحميل الفترات:', err); setError('تعذّر تحميل فترات الاختبارات. حاول تحديث الصفحة.') })
    return () => unsub()
  }, [session, examCenterEnabled, currentAcademicYear])

  // حصص فترة معيّنة — تحميل كسول أول ما حدا يطلبها، متل TimetableContext
  const loadSlotsForPeriod = useCallback((periodId) => {
    if (!periodId || !session || !examCenterEnabled) return
    const q = query(collection(db, 'examSlots'), where('schoolId', '==', session.schoolId), where('periodId', '==', periodId), where('academicYear', '==', currentAcademicYear))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setSlotsByPeriod((prev) => ({ ...prev, [periodId]: list }))
    }, (err) => { console.error('[مركز الاختبارات] فشل تحميل حصص الفترة:', err); setError('تعذّر تحميل حصص فترة الاختبارات.') })
  }, [session, examCenterEnabled, currentAcademicYear])

  function getSlots(periodId) {
    return slotsByPeriod[periodId] || []
  }

  async function createPeriod({ name, startDate, endDate }) {
    const ref = await addDoc(collection(db, 'examPeriods'), {
      schoolId: session.schoolId, academicYear: currentAcademicYear, name, startDate, endDate, status: 'draft',
      createdByUid: session.uid, createdByName: session.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'create_exam_period', 'examPeriod', ref.id, name)
    return ref.id
  }

  async function setPeriodStatus(periodId, status) {
    await updateDoc(doc(db, 'examPeriods', periodId), { status, updatedAt: serverTimestamp() })
    logAudit(session.schoolId, session.uid, session.name, 'set_exam_period_status', 'examPeriod', periodId, status)
  }

  async function addSlot({ periodId, subjectId, subjectName, sectionId, sectionName, date, startTime, endTime, roomName, proctorUid, proctorName }) {
    const ref = await addDoc(collection(db, 'examSlots'), {
      schoolId: session.schoolId, academicYear: currentAcademicYear, periodId, subjectId, subjectName, sectionId, sectionName,
      date, startTime, endTime, roomName: roomName || null, proctorUid: proctorUid || null, proctorName: proctorName || null,
      createdByUid: session.uid, createdAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'add_exam_slot', 'examSlot', ref.id, `${subjectName} — ${sectionName} — ${date}`)
    return ref.id
  }

  async function deleteSlot(slotId) {
    await deleteDoc(doc(db, 'examSlots', slotId))
    logAudit(session.schoolId, session.uid, session.name, 'delete_exam_slot', 'examSlot', slotId)
  }

  // فحص تعارض كامل: نفس الشعبة بامتحانين بنفس الوقت، نفس القاعة، أو نفس المراقب
  async function scanConflicts(periodId) {
    setScanning(true)
    setError('')
    try {
      const snap = await getDocs(query(collection(db, 'examSlots'), where('schoolId', '==', session.schoolId), where('periodId', '==', periodId), where('academicYear', '==', currentAcademicYear)))
      const slots = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const sectionConflicts = [], roomConflicts = [], proctorConflicts = []
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i], b = slots[j]
          if (a.date !== b.date || !timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue
          if (a.sectionId === b.sectionId) sectionConflicts.push([a, b])
          if (a.roomName && a.roomName === b.roomName) roomConflicts.push([a, b])
          if (a.proctorUid && a.proctorUid === b.proctorUid) proctorConflicts.push([a, b])
        }
      }
      return { sectionConflicts, roomConflicts, proctorConflicts }
    } catch (err) {
      console.error('[مركز الاختبارات] فشل فحص التعارضات:', err)
      setError('تعذّر فحص تعارضات الاختبارات. حاول مرة ثانية.')
      return null
    } finally {
      setScanning(false)
    }
  }

  return (
    <ExamCenterContext.Provider value={{
      periods, scanning, error, loadSlotsForPeriod, getSlots,
      createPeriod, setPeriodStatus, addSlot, deleteSlot, scanConflicts,
    }}>
      {children}
    </ExamCenterContext.Provider>
  )
}

export function useExamCenter() {
  const ctx = useContext(ExamCenterContext)
  if (!ctx) throw new Error('useExamCenter must be used inside ExamCenterProvider')
  return ctx
}
