import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { collection, doc, addDoc, updateDoc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'
import { logAudit } from '../utils/audit'

const ScheduleOpsContext = createContext(null)

export function ScheduleOpsProvider({ children }) {
  const { session } = useSession()
  const { sections, subjects, allUsers, currentAcademicYear } = useSchoolStructure()

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null) // { conflicts, availabilityViolations, weeklyMismatches, teacherSlotMap, slotsByTeacher }
  const [availabilityByTeacher, setAvailabilityByTeacher] = useState({})
  const [absences, setAbsences] = useState([])
  const [coverageLog, setCoverageLog] = useState([])
  const [error, setError] = useState('')

  const instructors = allUsers.filter((u) => u.role === 'instructor')

  // سجل الغياب وسجل التغطية — قراءة مرة وحدة (schoolId فقط) عشان الإدارة تشوف تاريخها بدون listener دائم
  useEffect(() => {
    if (!session || session.role !== 'admin' || !currentAcademicYear) { setAbsences([]); setCoverageLog([]); return }
    setError('')
    const onLoadError = (err) => { console.error('[الجدول] فشل تحميل السجل:', err); setError('تعذّر تحميل سجلات الغياب والتغطية. حاول تحديث الصفحة.') }
    const unsub1 = getDocsOnce(query(collection(db, 'teacherAbsences'), where('schoolId', '==', session.schoolId), where('academicYear', '==', currentAcademicYear)), setAbsences, onLoadError)
    const unsub2 = getDocsOnce(query(collection(db, 'substituteCoverage'), where('schoolId', '==', session.schoolId), where('academicYear', '==', currentAcademicYear)), setCoverageLog, onLoadError)
    return () => { unsub1(); unsub2() }
  }, [session, currentAcademicYear])

  // فحص كامل: يجيب جداول المدرسة كلها + توفر المعلمين، ويبني خريطة (معلم × يوم × حصة) بربط subjectId
  // بمادته (subjects.teacherUid) بالمتصفح — بدون أي تعديل على شكل وثيقة timetables نفسها
  const scanConflicts = useCallback(async () => {
    setScanning(true)
    setError('')
    try {
      const ttSnap = await getDocs(query(collection(db, 'timetables'), where('schoolId', '==', session.schoolId), where('academicYear', '==', currentAcademicYear)))
      const availSnap = await getDocs(query(collection(db, 'teacherAvailability'), where('schoolId', '==', session.schoolId), where('academicYear', '==', currentAcademicYear)))
      const availMap = {}
      availSnap.docs.forEach((d) => { availMap[d.data().teacherUid] = d.data().unavailable || [] })
      setAvailabilityByTeacher(availMap)

      const sMap = new Map(subjects.map((s) => [s.id, s]))
      const secMap = new Map(sections.map((s) => [s.id, s]))
      const teacherSlotMap = new Map() // `${teacherUid}|${day}|${period}` -> entries[]
      const slotsByTeacher = new Map() // teacherUid -> entries[] (كل حصصه، بدون تجميع تعارض)
      const subjectSlotCount = new Map() // subjectId -> عدد الحصص الفعلي بالجدول

      ttSnap.docs.forEach((d) => {
        const data = d.data()
        const sectionId = data.sectionId
        ;(data.slots || []).forEach((slot) => {
          const subj = sMap.get(slot.subjectId)
          if (!subj) return
          subjectSlotCount.set(slot.subjectId, (subjectSlotCount.get(slot.subjectId) || 0) + 1)
          if (!subj.teacherUid) return
          const entry = {
            teacherUid: subj.teacherUid, teacherName: subj.teacherName,
            sectionId, sectionName: secMap.get(sectionId)?.name || sectionId,
            subjectId: slot.subjectId, subjectName: subj.name,
            day: slot.day, period: slot.period,
          }
          const key = `${subj.teacherUid}|${slot.day}|${slot.period}`
          teacherSlotMap.set(key, [...(teacherSlotMap.get(key) || []), entry])
          slotsByTeacher.set(subj.teacherUid, [...(slotsByTeacher.get(subj.teacherUid) || []), entry])
        })
      })

      const conflicts = [...teacherSlotMap.values()].filter((arr) => arr.length > 1)

      const availabilityViolations = []
      teacherSlotMap.forEach((arr) => {
        const first = arr[0]
        const unavailable = availMap[first.teacherUid] || []
        if (unavailable.some((u) => u.day === first.day && u.period === first.period)) {
          availabilityViolations.push(...arr)
        }
      })

      const weeklyMismatches = subjects
        .filter((s) => s.weeklyPeriods && (subjectSlotCount.get(s.id) || 0) !== s.weeklyPeriods)
        .map((s) => ({
          subjectId: s.id, subjectName: s.name, sectionId: s.sectionId,
          sectionName: secMap.get(s.sectionId)?.name || s.sectionId,
          required: s.weeklyPeriods, actual: subjectSlotCount.get(s.id) || 0,
        }))

      const result = { conflicts, availabilityViolations, weeklyMismatches, teacherSlotMap, slotsByTeacher }
      setScanResult(result)
      return result
    } catch (err) {
      console.error('[الجدول] فشل فحص التعارضات:', err)
      setError('تعذّر فحص التعارضات. تأكد من الاتصال والصلاحيات ثم حاول مرة ثانية.')
      return null
    } finally {
      setScanning(false)
    }
  }, [session, subjects, sections, currentAcademicYear])

  // حصص معلم غائب بيوم معيّن (مشتقة من آخر فحص) — لازم تشغّل scanConflicts قبلها
  function getTeacherSlotsForDay(teacherUid, dateStr) {
    if (!scanResult) return []
    const day = new Date(`${dateStr}T00:00:00`).getDay()
    if (day > 4) return [] // جمعة/سبت، ما في دوام
    return (scanResult.slotsByTeacher.get(teacherUid) || []).filter((s) => s.day === day)
  }

  // اقتراح بدلاء لحصة معيّنة: معلم مو مشغول بنفس الوقت، ومو معلّم غير متاح بهيدا الوقت،
  // مرتّبين حسب الأخف حمولة أسبوعية أولاً (بدون أي ذكاء اصطناعي، مجرد أفضلية بسيطة)
  function suggestSubstitutes(day, period, excludeTeacherUid) {
    if (!scanResult) return []
    return instructors
      .filter((t) => t.id !== excludeTeacherUid)
      .filter((t) => !scanResult.teacherSlotMap.has(`${t.id}|${day}|${period}`))
      .filter((t) => !(availabilityByTeacher[t.id] || []).some((u) => u.day === day && u.period === period))
      .map((t) => ({ ...t, weeklyLoad: (scanResult.slotsByTeacher.get(t.id) || []).length }))
      .sort((a, b) => a.weeklyLoad - b.weeklyLoad)
  }

  async function setTeacherAvailability(teacherUid, unavailable) {
    await setDoc(doc(db, 'teacherAvailability', teacherUid), {
      teacherUid, schoolId: session.schoolId, academicYear: currentAcademicYear, unavailable, updatedAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'set_teacher_availability', 'teacherAvailability', teacherUid)
  }

  async function setSubjectWeeklyPeriods(subjectId, weeklyPeriods) {
    await updateDoc(doc(db, 'subjects', subjectId), { weeklyPeriods: weeklyPeriods || null })
  }

  async function reportAbsence({ teacherUid, teacherName, date, periods, reason }) {
    const ref = await addDoc(collection(db, 'teacherAbsences'), {
      schoolId: session.schoolId, academicYear: currentAcademicYear, teacherUid, teacherName, date, periods, reason: reason || '',
      status: 'open', createdByUid: session.uid, createdByName: session.name, createdAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'report_teacher_absence', 'teacherAbsence', ref.id, `${teacherName} — ${date}`)
    return ref.id
  }

  async function assignSubstitute({ absenceId, date, day, period, sectionId, sectionName, subjectId, subjectName, originalTeacherUid, originalTeacherName, substituteTeacherUid, substituteTeacherName }) {
    const ref = await addDoc(collection(db, 'substituteCoverage'), {
      schoolId: session.schoolId, academicYear: currentAcademicYear, absenceId, date, day, period,
      sectionId, sectionName, subjectId, subjectName,
      originalTeacherUid, originalTeacherName, substituteTeacherUid, substituteTeacherName,
      createdByUid: session.uid, createdAt: serverTimestamp(),
    })
    logAudit(session.schoolId, session.uid, session.name, 'assign_substitute', 'substituteCoverage', ref.id, `${subjectName} — ${sectionName} — ${date}`)
    try {
      await sendNotification(substituteTeacherUid, `عُيّنت بديلاً لحصة ${subjectName} بشعبة ${sectionName} بتاريخ ${date}`, 'schedule', session.schoolId)
    } catch { /* best-effort */ }
    return ref.id
  }

  async function markAbsenceCovered(absenceId) {
    await updateDoc(doc(db, 'teacherAbsences', absenceId), { status: 'covered' })
    logAudit(session.schoolId, session.uid, session.name, 'cover_teacher_absence', 'teacherAbsence', absenceId)
  }

  return (
    <ScheduleOpsContext.Provider value={{
      scanning, scanResult, scanConflicts, availabilityByTeacher, instructors, absences, coverageLog, error,
      getTeacherSlotsForDay, suggestSubstitutes, setTeacherAvailability, setSubjectWeeklyPeriods,
      reportAbsence, assignSubstitute, markAbsenceCovered,
    }}>
      {children}
    </ScheduleOpsContext.Provider>
  )
}

// تحميل مرة وحدة (مو onSnapshot) — سجلات غياب/تغطية ما بتحتاج تفاعل لحظي، وبتوفّر قراءات يوميًا
function getDocsOnce(q, setList, onError) {
  let cancelled = false
  getDocs(q).then((snap) => {
    if (cancelled) return
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    setList(list.slice(0, 100))
  }).catch(onError)
  return () => { cancelled = true }
}

export function useScheduleOps() {
  const ctx = useContext(ScheduleOpsContext)
  if (!ctx) throw new Error('useScheduleOps must be used inside ScheduleOpsProvider')
  return ctx
}
