import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useAttendance } from '../../context/AttendanceContext'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function InstructorAttendancePage() {
  const { session } = useSession()
  const { grades, subjects, getSectionsForGrade } = useSchoolStructure()
  const { getAttendanceForDate, setAbsent, setPresent } = useAttendance()

  const myTaughtSectionIds = [...new Set(subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.sectionId))]
  const myGrades = grades.filter((g) => getSectionsForGrade(g.id).some((s) => myTaughtSectionIds.includes(s.id)))

  const [gradeId, setGradeId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [date, setDate] = useState(todayStr())
  const [students, setStudents] = useState([])
  const [absentSet, setAbsentSet] = useState(new Set())
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [studentsError, setStudentsError] = useState('')

  const mySections = gradeId ? getSectionsForGrade(gradeId).filter((s) => myTaughtSectionIds.includes(s.id)) : []

  useEffect(() => {
    if (!sectionId) { setStudents([]); return }
    setStudentsError('')
    const q = query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', sectionId))
    const unsub = onSnapshot(
      q,
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => setStudentsError(`ما قدرنا نجيب لستة الطلاب (${err.code}). جرب تسجّل خروج ودخول من جديد، وإذا استمرت المشكلة تواصل مع إدارة المدرسة.`)
    )
    return () => unsub()
  }, [sectionId])

  useEffect(() => {
    if (!sectionId || !date) { setAbsentSet(new Set()); return }
    let cancelled = false
    getAttendanceForDate(sectionId, date).then((uids) => {
      if (!cancelled) setAbsentSet(new Set(uids))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, date])

  function toggleAbsent(uid) {
    setAbsentSet((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  async function handleSave() {
    setSaveError('')
    try {
      const previousSet = new Set(await getAttendanceForDate(sectionId, date))
      for (const st of students) {
        const wasAbsent = previousSet.has(st.id)
        const isAbsent = absentSet.has(st.id)
        if (isAbsent && !wasAbsent) await setAbsent(st.id, sectionId, date)
        else if (!isAbsent && wasAbsent) await setPresent(st.id, date)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      console.error('فشل حفظ الحضور:', err)
      setSaveError(`صار خطأ وقت الحفظ: ${err.code || err.message}`)
    }
  }

  return (
    <div>
      <div className="eyebrow">الحضور والغياب</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>خذ حضور الصف</h2>

      <div className="panel" style={{ maxWidth: '620px' }}>
        <div className="field">
          <label htmlFor="att-grade">الصف</label>
          <select id="att-grade" value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSectionId('') }}>
            <option value="">-- اختار صف --</option>
            {myGrades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        {gradeId && (
          <div className="field">
            <label htmlFor="att-section">الشعبة</label>
            <select id="att-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">-- اختار شعبة --</option>
              {mySections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {sectionId && (
          <div className="field">
            <label htmlFor="att-date">التاريخ</label>
            <input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        {sectionId && date && (
          <>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
              علّم بس على الطلاب الغايبين — الباقي بيعتبر حاضر تلقائيًا:
            </p>
            {studentsError && <p className="auth-error">{studentsError}</p>}
            {!studentsError && students.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>ما في طلاب بهاي الشعبة بعد.</p>
            ) : (
              students.map((st) => (
                <label key={st.id} className="child-check-row">
                  <input type="checkbox" checked={absentSet.has(st.id)} onChange={() => toggleAbsent(st.id)} />
                  <span>{st.name}</span>
                </label>
              ))
            )}
            <button className="btn btn-primary" onClick={handleSave} style={{ marginTop: '12px' }}>
              <i className="ti ti-device-floppy" /> حفظ الحضور
            </button>
            {saved && <span className="notes-saved" style={{ marginRight: '10px' }}><i className="ti ti-check" /> تم الحفظ</span>}
            {saveError && <p className="auth-error" style={{ marginTop: '10px' }}>{saveError}</p>}
          </>
        )}
      </div>
    </div>
  )
}