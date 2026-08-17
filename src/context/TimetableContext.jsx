import { createContext, useContext, useState, useRef } from 'react'
import { doc, setDoc, onSnapshot, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { replaceTimetableSlot } from '../utils/timetable'

const TimetableContext = createContext(null)

export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']
export const PERIODS = [1, 2, 3, 4, 5, 6, 7]

export function TimetableProvider({ children }) {
  const { session } = useSession()
  const { currentAcademicYear } = useSchoolStructure()
  const [bySectionId, setBySectionId] = useState({})
  const loadedRef = useRef(new Set())

  // تحميل كسول: أول مرة حدا يطلب جدول شعبة معيّنة، نفتح listener إلها بس — مو كل الشعب دفعة وحدة
  function loadSectionTimetable(sectionId) {
    if (!sectionId || loadedRef.current.has(sectionId)) return
    loadedRef.current.add(sectionId)
    onSnapshot(doc(db, 'timetables', sectionId), (snap) => {
      setBySectionId((prev) => ({ ...prev, [sectionId]: snap.exists() ? snap.data() : { slots: [] } }))
    })
  }

  function getSlots(sectionId) {
    loadSectionTimetable(sectionId)
    return bySectionId[sectionId]?.slots || []
  }

  async function setSlot(sectionId, day, period, subjectId) {
    const timetableRef = doc(db, 'timetables', sectionId)
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(timetableRef)
      const existingSlots = snap.exists() && Array.isArray(snap.data().slots) ? snap.data().slots : []
      transaction.set(timetableRef, {
        sectionId, schoolId: session.schoolId, academicYear: currentAcademicYear,
        slots: replaceTimetableSlot(existingSlots, day, period, subjectId),
      })
    })
  }

  // استيراد ملف كامل — كتابة وحدة بدل loop، يستبدل كل slots الشعبة بالدفعة الجديدة
  async function setAllSlots(sectionId, slots) {
    await setDoc(doc(db, 'timetables', sectionId), {
      sectionId, schoolId: session.schoolId, academicYear: currentAcademicYear, slots,
    })
  }

  return (
    <TimetableContext.Provider value={{ getSlots, setSlot, setAllSlots }}>
      {children}
    </TimetableContext.Provider>
  )
}

export function useTimetable() {
  const ctx = useContext(TimetableContext)
  if (!ctx) throw new Error('useTimetable must be used inside TimetableProvider')
  return ctx
}
