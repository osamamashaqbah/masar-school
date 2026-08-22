import { useState, useEffect } from 'react'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useExamCenter } from '../context/ExamCenterContext'

const STATUS_LABELS = { draft: 'مسودة', reviewed: 'تمت المراجعة', published: 'منشورة', locked: 'مقفلة' }
const NEXT_STATUS = { draft: 'reviewed', reviewed: 'published', published: 'locked' }
const PREV_STATUS = { reviewed: 'draft', published: 'reviewed' }

function SeatingSheet({ slot, students }) {
  return (
    <div className="report-card-print">
      <div className="report-card-header">
        <div className="report-card-school">{slot.subjectName} — {slot.sectionName}</div>
        <div className="report-card-title">
          {slot.date} — {slot.startTime} إلى {slot.endTime} {slot.roomName ? `— قاعة ${slot.roomName}` : ''}
          {slot.proctorName ? ` — المراقب: ${slot.proctorName}` : ''}
        </div>
      </div>
      <table className="report-card-table">
        <thead><tr><th>#</th><th>اسم الطالب</th><th>التوقيع</th></tr></thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id}><td>{i + 1}</td><td>{s.name}</td><td></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminExamCenter() {
  const { grades, sections, subjects, allUsers } = useSchoolStructure()
  const { periods, createPeriod, setPeriodStatus, addSlot, deleteSlot, scanConflicts, loadSlotsForPeriod, getSlots, scanning } = useExamCenter()
  const instructors = allUsers.filter((u) => u.role === 'instructor')

  const [periodId, setPeriodId] = useState('')
  const [pName, setPName] = useState('')
  const [pStart, setPStart] = useState('')
  const [pEnd, setPEnd] = useState('')

  const [subjectId, setSubjectId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [roomName, setRoomName] = useState('')
  const [proctorUid, setProctorUid] = useState('')

  const [conflicts, setConflicts] = useState(null)
  const [printSlot, setPrintSlot] = useState(null)

  const period = periods.find((p) => p.id === periodId)
  const slots = getSlots(periodId)

  useEffect(() => { if (periodId) loadSlotsForPeriod(periodId) }, [periodId, loadSlotsForPeriod])

  useEffect(() => {
    if (!printSlot) return
    const t = setTimeout(() => window.print(), 100)
    return () => clearTimeout(t)
  }, [printSlot])

  async function handleCreatePeriod(e) {
    e.preventDefault()
    if (!pName.trim() || !pStart || !pEnd) return
    const id = await createPeriod({ name: pName.trim(), startDate: pStart, endDate: pEnd })
    setPName(''); setPStart(''); setPEnd('')
    setPeriodId(id)
  }

  async function handleAddSlot(e) {
    e.preventDefault()
    const subject = subjects.find((s) => s.id === subjectId)
    if (!subject || !date || !startTime || !endTime) return
    const proctor = instructors.find((t) => t.id === proctorUid)
    const section = sections.find((s) => s.id === subject.sectionId)
    await addSlot({
      periodId, subjectId, subjectName: subject.name, sectionId: subject.sectionId, sectionName: section?.name || subject.sectionId,
      date, startTime, endTime, roomName: roomName.trim(), proctorUid: proctorUid || null, proctorName: proctor?.name || null,
    })
    setSubjectId(''); setDate(''); setStartTime(''); setEndTime(''); setRoomName(''); setProctorUid('')
  }

  async function handleScan() {
    setConflicts(await scanConflicts(periodId))
  }

  function studentsForSection(sectionId) {
    return allUsers.filter((u) => u.role === 'student' && u.sectionId === sectionId)
  }

  return (
    <div>
      <div className="panel" style={{ maxWidth: '520px', marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, marginBottom: '10px' }}><i className="ti ti-calendar-plus" /> فترة اختبارات جديدة</div>
        <form onSubmit={handleCreatePeriod} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="field">
            <label htmlFor="ep-name">اسم الفترة</label>
            <input id="ep-name" type="text" placeholder="مثال: امتحانات نهاية الفصل الأول" value={pName} onChange={(e) => setPName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ep-start">من</label>
              <input id="ep-start" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ep-end">إلى</label>
              <input id="ep-end" type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: 'auto' }}>إنشاء الفترة</button>
        </form>
      </div>

      <div className="field" style={{ maxWidth: '360px', marginBottom: '16px' }}>
        <label htmlFor="ep-select">اختار فترة</label>
        <select id="ep-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">-- اختار --</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({STATUS_LABELS[p.status]})</option>)}
        </select>
      </div>

      {period && (
        <>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
            <span className="tag">{STATUS_LABELS[period.status]}</span>
            {PREV_STATUS[period.status] && (
              <button className="btn" style={{ width: 'auto' }} onClick={() => setPeriodStatus(periodId, PREV_STATUS[period.status])}>
                رجوع لـ{STATUS_LABELS[PREV_STATUS[period.status]]}
              </button>
            )}
            {NEXT_STATUS[period.status] && (
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setPeriodStatus(periodId, NEXT_STATUS[period.status])}>
                {period.status === 'published' ? 'قفل الفترة نهائيًا' : `نقل لـ${STATUS_LABELS[NEXT_STATUS[period.status]]}`}
              </button>
            )}
          </div>

          {period.status === 'draft' && (
            <div className="panel" style={{ maxWidth: '620px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, marginBottom: '10px' }}><i className="ti ti-clipboard-plus" /> إضافة حصة اختبار</div>
              <form onSubmit={handleAddSlot} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="field">
                  <label htmlFor="es-subject">المادة (تحدّد الشعبة تلقائيًا)</label>
                  <select id="es-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">-- اختار --</option>
                    {grades.map((g) => sections.filter((s) => s.gradeId === g.id).map((s) => (
                      subjects.filter((sub) => sub.sectionId === s.id).map((sub) => (
                        <option key={sub.id} value={sub.id}>{g.name} — {s.name} — {sub.name}</option>
                      ))
                    )))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: 1, minWidth: '140px' }}>
                    <label htmlFor="es-date">التاريخ</label>
                    <input id="es-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: '110px' }}>
                    <label htmlFor="es-start">من</label>
                    <input id="es-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: '110px' }}>
                    <label htmlFor="es-end">إلى</label>
                    <input id="es-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: 1, minWidth: '140px' }}>
                    <label htmlFor="es-room">القاعة (اختياري)</label>
                    <input id="es-room" type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: '160px' }}>
                    <label htmlFor="es-proctor">المراقب (اختياري)</label>
                    <select id="es-proctor" value={proctorUid} onChange={(e) => setProctorUid(e.target.value)}>
                      <option value="">-- بدون --</option>
                      {instructors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: 'auto' }}>إضافة الحصة</button>
              </form>
            </div>
          )}

          <div className="panel" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700 }}>حصص الاختبار ({slots.length})</div>
              <button className="btn" style={{ width: 'auto' }} onClick={handleScan} disabled={scanning}>
                {scanning ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-alert-triangle" />} افحص التعارضات
              </button>
            </div>
            {slots.length === 0 ? <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما في حصص مضافة بعد.</p> : (
              slots.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).map((slot) => (
                <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: '220px' }}>
                    {slot.date} · {slot.startTime}–{slot.endTime} · <strong>{slot.subjectName}</strong> — {slot.sectionName}
                    {slot.roomName ? ` — قاعة ${slot.roomName}` : ''}{slot.proctorName ? ` — ${slot.proctorName}` : ''}
                  </span>
                  <button className="btn" style={{ width: 'auto' }} onClick={() => setPrintSlot(slot)}><i className="ti ti-printer" /> كشف جلوس</button>
                  {period.status === 'draft' && (
                    <button className="btn" style={{ width: 'auto', color: 'var(--berry)' }} onClick={() => deleteSlot(slot.id)}><i className="ti ti-trash" /></button>
                  )}
                </div>
              ))
            )}
          </div>

          {conflicts && (
            <div className="panel">
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>نتيجة الفحص</div>
              {conflicts.sectionConflicts.length === 0 && conflicts.roomConflicts.length === 0 && conflicts.proctorConflicts.length === 0 ? (
                <p style={{ color: 'var(--pine)', fontSize: '12.5px' }}>ما في أي تعارض 👍</p>
              ) : (
                <>
                  {conflicts.sectionConflicts.map(([a, b], i) => (
                    <p key={`sec${i}`} style={{ fontSize: '12.5px', color: 'var(--berry)' }}>
                      <i className="ti ti-users" /> تعارض شعبة: {a.sectionName} عندها {a.subjectName} و{b.subjectName} بنفس وقت {a.date}
                    </p>
                  ))}
                  {conflicts.roomConflicts.map(([a, b], i) => (
                    <p key={`room${i}`} style={{ fontSize: '12.5px', color: 'var(--berry)' }}>
                      <i className="ti ti-door" /> تعارض قاعة: {a.roomName} محجوزة لـ{a.subjectName} و{b.subjectName} بنفس وقت {a.date}
                    </p>
                  ))}
                  {conflicts.proctorConflicts.map(([a, b], i) => (
                    <p key={`proc${i}`} style={{ fontSize: '12.5px', color: 'var(--berry)' }}>
                      <i className="ti ti-user-exclamation" /> تعارض مراقب: {a.proctorName} عليه {a.subjectName} و{b.subjectName} بنفس وقت {a.date}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {printSlot && <SeatingSheet slot={printSlot} students={studentsForSection(printSlot.sectionId)} />}
    </div>
  )
}

function ExamScheduleViewer() {
  const { periods, getSlots, loadSlotsForPeriod } = useExamCenter()
  const [periodId, setPeriodId] = useState('')
  const visiblePeriods = periods.filter((p) => p.status === 'published' || p.status === 'locked')
  const slots = getSlots(periodId)

  useEffect(() => { if (periodId) loadSlotsForPeriod(periodId) }, [periodId, loadSlotsForPeriod])

  return (
    <div>
      <div className="field" style={{ maxWidth: '360px', marginBottom: '16px' }}>
        <label htmlFor="ep-view-select">اختار فترة</label>
        <select id="ep-view-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">-- اختار --</option>
          {visiblePeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {visiblePeriods.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>ما في جدول اختبارات منشور بعد.</p>}
      {periodId && (
        slots.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>ما في حصص بهاي الفترة.</p> : (
          <div className="gradebook-table">
            <div className="gradebook-header"><span>التاريخ</span><span>الوقت</span><span>المادة — الشعبة</span><span>القاعة</span></div>
            {slots.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).map((slot) => (
              <div className="gradebook-row" key={slot.id}>
                <span>{slot.date}</span>
                <span>{slot.startTime}–{slot.endTime}</span>
                <span>{slot.subjectName} — {slot.sectionName}</span>
                <span>{slot.roomName || '—'}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

export default function ExamCenterPage() {
  const { session } = useSession()
  const { error } = useExamCenter()
  return (
    <div>
      <div className="eyebrow">مركز الاختبارات</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>
        {session.role === 'admin' ? 'جدول الاختبارات والقاعات' : 'جدول الاختبارات'}
      </h2>
      {error && <p className="auth-error">{error}</p>}
      {session.role === 'admin' ? <AdminExamCenter /> : <ExamScheduleViewer />}
    </div>
  )
}
