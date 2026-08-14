import { useState, useEffect } from 'react'
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useTimetable, DAYS, PERIODS } from '../context/TimetableContext'
import { parseTimetableExcel } from '../utils/parseTimetableExcel'
import { chunkArray } from '../utils/chunk'

function TimetableGrid({ sectionId, editable, todayDayIdx, coverageToday }) {
  const { subjects } = useSchoolStructure()
  const { getSlots, setSlot } = useTimetable()
  const slots = getSlots(sectionId)
  const sectionSubjects = subjects.filter((s) => s.sectionId === sectionId)

  function slotAt(day, period) {
    const slot = slots.find((s) => s.day === day && s.period === period)
    return slot ? sectionSubjects.find((s) => s.id === slot.subjectId) : null
  }

  // بديل معلم اليوم على هاي الحصة بالذات — تغطية استثنائية محفوظة بـ substituteCoverage
  // بدون أي لمس لجدول timetables الأصلي
  function coverageAt(day, period) {
    if (day !== todayDayIdx) return null
    return coverageToday?.find((c) => c.sectionId === sectionId && c.period === period) || null
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="gradebook-table" style={{ minWidth: '600px' }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 10px' }}>الحصة</th>
            {DAYS.map((d) => <th key={d} style={{ padding: '6px 10px' }}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period}>
              <td style={{ padding: '6px 10px', fontWeight: 700 }}>{period}</td>
              {DAYS.map((_, dayIdx) => {
                const subject = slotAt(dayIdx, period)
                const coverage = coverageAt(dayIdx, period)
                return (
                  <td key={dayIdx} style={{ padding: '4px 6px', minWidth: '110px' }}>
                    {editable ? (
                      <select
                        value={subject?.id || ''}
                        onChange={(e) => setSlot(sectionId, dayIdx, period, e.target.value || null)}
                        style={{ width: '100%', fontSize: '12px', padding: '4px' }}
                      >
                        <option value="">—</option>
                        {sectionSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : subject ? (
                      <div style={{ fontSize: '12.5px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{subject.name}</div>
                        <div style={{ color: 'var(--ink-faint)', fontSize: '11px' }}>{subject.teacherName}</div>
                        {coverage && (
                          <div style={{ color: 'var(--berry)', fontSize: '10.5px', marginTop: '2px' }}>
                            <i className="ti ti-replace" /> بديل: {coverage.substituteTeacherName}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>—</div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TimetableImport({ sectionId }) {
  const { subjects } = useSchoolStructure()
  const { setAllSlots } = useTimetable()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const sectionSubjects = subjects.filter((s) => s.sectionId === sectionId)

  async function handleImport(e) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const { slots, unmatched } = await parseTimetableExcel(file, sectionSubjects)
      if (slots.length === 0) {
        setError('ما لقينا ولا حصة تطابق أسماء مواد هاي الشعبة. تأكد أسماء المواد بالملف قريبة من أسماء المواد المضافة بالنظام.')
        return
      }
      await setAllSlots(sectionId, slots)
      setResult({ matchedCount: slots.length, unmatched })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setFile(null)
    }
  }

  return (
    <div className="panel" style={{ maxWidth: '520px', marginBottom: '16px' }}>
      <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '6px' }}><i className="ti ti-upload" /> استيراد جدول جاهز من Excel</div>
      <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '0 0 10px' }}>
        الصف الأول: أسماء الأيام (الأحد، الاثنين...). العمود الأول: رقم الحصة. باقي الخلايا: اسم المادة —
        رح نطابقها تلقائيًا مع مواد الشعبة (حتى لو فيها فرق بسيط بالتشكيل أو الألف/التاء المربوطة).
      </p>
      <form onSubmit={handleImport} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        <button type="submit" className="btn btn-primary" disabled={busy || !file} style={{ width: 'auto' }}>
          {busy ? <i className="ti ti-loader-2 spin" /> : 'استيراد'}
        </button>
      </form>
      {error && <p className="auth-error" style={{ marginTop: '8px' }}>{error}</p>}
      {result && (
        <div style={{ marginTop: '10px', fontSize: '12.5px' }}>
          <p style={{ color: 'var(--pine)', margin: '4px 0' }}>✅ اتحطّت {result.matchedCount} حصة تلقائيًا.</p>
          {result.unmatched.length > 0 && (
            <>
              <p style={{ color: 'var(--berry)', margin: '4px 0' }}>⚠️ {result.unmatched.length} خلية ما انطابقت مع أي مادة موجودة — عدّلها يدويًا بالجدول تحت:</p>
              <ul style={{ margin: '4px 0', paddingRight: '18px' }}>
                {result.unmatched.map((u, i) => <li key={i}>{u.dayLabel} · حصة {u.period}: "{u.text}"</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AdminTimetableEditor() {
  const { grades, getSectionsForGrade } = useSchoolStructure()
  const [sectionId, setSectionId] = useState('')

  return (
    <div>
      <div className="field" style={{ maxWidth: '360px', marginBottom: '16px' }}>
        <label htmlFor="tt-section">اختار شعبة</label>
        <select id="tt-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">-- اختار --</option>
          {grades.map((g) => getSectionsForGrade(g.id).map((s) => (
            <option key={s.id} value={s.id}>{g.name} — {s.name}</option>
          )))}
        </select>
      </div>
      {sectionId && (
        <>
          <TimetableImport sectionId={sectionId} />
          <TimetableGrid sectionId={sectionId} editable />
        </>
      )}
    </div>
  )
}

function ChildTimetable({ child, todayDayIdx, coverageToday }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px' }}>{child.name}</div>
      <TimetableGrid sectionId={child.sectionId} editable={false} todayDayIdx={todayDayIdx} coverageToday={coverageToday} />
    </div>
  )
}

export default function TimetablePage() {
  const { session } = useSession()
  const [children, setChildren] = useState([])
  const [coverageToday, setCoverageToday] = useState([])
  const todayDayIdx = new Date().getDay() // الأحد=0 ... الخميس=4، مطابق تمامًا لترتيب DAYS

  useEffect(() => {
    if (session.role !== 'parent' || !session.childUids?.length) return
    const chunks = chunkArray(session.childUids)
    const childrenByChunk = chunks.map(() => [])
    const unsubs = chunks.map((chunk, index) => {
      const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where(documentId(), 'in', chunk))
      return onSnapshot(q, (snap) => {
        childrenByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setChildren(childrenByChunk.flat())
      })
    })
    return () => unsubs.forEach((unsub) => unsub())
  }, [session])

  // بدلاء اليوم فقط — بيانات محدودة جدًا (تغطية يوم واحد لمدرسة وحدة)، عرض لحظي مقبول ضمن حصة Spark
  useEffect(() => {
    if (todayDayIdx > 4) { setCoverageToday([]); return } // جمعة/سبت
    const todayStr = new Date().toISOString().slice(0, 10)
    const q = query(collection(db, 'substituteCoverage'), where('schoolId', '==', session.schoolId), where('date', '==', todayStr))
    const unsub = onSnapshot(q, (snap) => setCoverageToday(snap.docs.map((d) => d.data())), () => setCoverageToday([]))
    return () => unsub()
  }, [session, todayDayIdx])

  return (
    <div>
      <div className="eyebrow">الجدول الأسبوعي</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>
        {session.role === 'admin' ? 'إدارة جدول الحصص' : 'جدولك الأسبوعي'}
      </h2>

      {session.role === 'admin' && <AdminTimetableEditor />}
      {session.role === 'student' && <TimetableGrid sectionId={session.sectionId} editable={false} todayDayIdx={todayDayIdx} coverageToday={coverageToday} />}
      {session.role === 'parent' && (
        children.length === 0
          ? <p style={{ color: 'var(--ink-soft)' }}>ما في أبناء مرتبطين بحسابك بعد.</p>
          : children.map((c) => <ChildTimetable key={c.id} child={c} todayDayIdx={todayDayIdx} coverageToday={coverageToday} />)
      )}
    </div>
  )
}
