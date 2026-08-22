import { useState, useEffect } from 'react'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useScheduleOps } from '../context/ScheduleOpsContext'
import { DAYS, PERIODS } from '../context/TimetableContext'

const TABS = [
  { id: 'conflicts', label: 'التعارضات', icon: 'ti-alert-triangle' },
  { id: 'availability', label: 'توفر المعلمين', icon: 'ti-calendar-user' },
  { id: 'absence', label: 'غياب وتغطية', icon: 'ti-user-exclamation' },
]

function ConflictsTab() {
  const { subjects } = useSchoolStructure()
  const { scanning, scanResult, scanConflicts, setSubjectWeeklyPeriods } = useScheduleOps()
  const [weeklyDrafts, setWeeklyDrafts] = useState({})

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={scanConflicts} disabled={scanning}>
          {scanning ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-refresh" />} افحص الآن
        </button>
        {scanResult && <span style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>آخر فحص الآن</span>}
      </div>

      {!scanResult ? (
        <p style={{ color: 'var(--ink-soft)' }}>اضغط "افحص الآن" لكشف تعارضات المعلمين ومخالفات التوفر وعدد الحصص.</p>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>
              <i className="ti ti-user-x" /> تعارض معلم ({scanResult.conflicts.length})
            </div>
            {scanResult.conflicts.length === 0 ? (
              <p style={{ color: 'var(--pine)', fontSize: '12.5px' }}>ما في أي تعارض معلمين 👍</p>
            ) : scanResult.conflicts.map((group, i) => (
              <div key={i} style={{ fontSize: '12.5px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <strong>{group[0].teacherName}</strong> — {DAYS[group[0].day]}، حصة {group[0].period}:{' '}
                {group.map((g) => `${g.sectionName} (${g.subjectName})`).join(' + ')}
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>
              <i className="ti ti-calendar-off" /> مخالفة توفر ({scanResult.availabilityViolations.length})
            </div>
            {scanResult.availabilityViolations.length === 0 ? (
              <p style={{ color: 'var(--pine)', fontSize: '12.5px' }}>ما في جدولة بوقت غير متاح لأي معلم 👍</p>
            ) : scanResult.availabilityViolations.map((v, i) => (
              <div key={i} style={{ fontSize: '12.5px', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <strong>{v.teacherName}</strong> مجدول {DAYS[v.day]} حصة {v.period} ({v.sectionName} — {v.subjectName}) رغم إنه غير متاح بهاد الوقت.
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>
              <i className="ti ti-hash" /> عدم تطابق عدد الحصص ({scanResult.weeklyMismatches.length})
            </div>
            {scanResult.weeklyMismatches.length === 0 ? (
              <p style={{ color: 'var(--pine)', fontSize: '12.5px' }}>كل المواد يلي حدّدتلها عدد حصص مطلوب متطابقة مع الجدول 👍</p>
            ) : scanResult.weeklyMismatches.map((m, i) => (
              <div key={i} style={{ fontSize: '12.5px', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <strong>{m.subjectName}</strong> ({m.sectionName}): المطلوب {m.required} حصة، بالجدول فعليًا {m.actual}.
              </div>
            ))}
          </div>
        </>
      )}

      <div className="panel">
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>عدد الحصص الأسبوعي المطلوب لكل مادة (اختياري)</div>
        <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '0 0 10px' }}>
          حدّد رقم لمادة حتى يفحصلك النظام تطابقه مع الجدول الفعلي. اتركها فاضية إذا ما بدك هالفحص لهاي المادة.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {subjects.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
              <span style={{ flex: 1 }}>{s.name}</span>
              <input
                type="number" min="0" max="14" style={{ width: '64px' }}
                value={weeklyDrafts[s.id] ?? s.weeklyPeriods ?? ''}
                onChange={(e) => setWeeklyDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                onBlur={(e) => setSubjectWeeklyPeriods(s.id, e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AvailabilityTab() {
  const { instructors, availabilityByTeacher, setTeacherAvailability } = useScheduleOps()
  const [teacherUid, setTeacherUid] = useState('')
  const [local, setLocal] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!teacherUid) { setLocal(new Set()); return }
    const existing = availabilityByTeacher[teacherUid] || []
    setLocal(new Set(existing.map((u) => `${u.day}-${u.period}`)))
  }, [teacherUid, availabilityByTeacher])

  function toggle(day, period) {
    const key = `${day}-${period}`
    setLocal((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const unavailable = [...local].map((k) => {
        const [day, period] = k.split('-').map(Number)
        return { day, period }
      })
      await setTeacherAvailability(teacherUid, unavailable)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="field" style={{ maxWidth: '360px', marginBottom: '16px' }}>
        <label htmlFor="avail-teacher">اختار معلم</label>
        <select id="avail-teacher" value={teacherUid} onChange={(e) => setTeacherUid(e.target.value)}>
          <option value="">-- اختار --</option>
          {instructors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {teacherUid && (
        <>
          <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginBottom: '10px' }}>
            علّم الأوقات يلي المعلم غير متاح فيها (اجتماع، دوام جزئي...). باقي الأوقات تعتبر متاحة تلقائيًا.
          </p>
          <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
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
                      const active = local.has(`${dayIdx}-${period}`)
                      return (
                        <td key={dayIdx} style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <button
                            type="button" onClick={() => toggle(dayIdx, period)}
                            className={active ? 'btn' : 'btn btn-primary'}
                            style={{ width: '100%', fontSize: '11px', padding: '4px', opacity: active ? 1 : 0.35, background: active ? 'var(--berry)' : undefined, color: active ? '#fff' : undefined }}
                          >
                            {active ? 'غير متاح' : 'متاح'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={save} disabled={saving}>
            {saving ? <i className="ti ti-loader-2 spin" /> : 'حفظ التوفر'}
          </button>
        </>
      )}
    </div>
  )
}

function AbsenceTab() {
  const { instructors, scanResult, scanConflicts, scanning, getTeacherSlotsForDay, suggestSubstitutes, reportAbsence, assignSubstitute, markAbsenceCovered, absences, coverageLog } = useScheduleOps()
  const [teacherUid, setTeacherUid] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeAbsence, setActiveAbsence] = useState(null) // { id, teacherUid, teacherName, date, slots }
  const [picks, setPicks] = useState({}) // `${day}-${period}` -> substituteUid
  const [assigned, setAssigned] = useState(new Set())

  useEffect(() => { if (!scanResult) scanConflicts() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReport(e) {
    e.preventDefault()
    if (!teacherUid || !date) return
    setBusy(true)
    try {
      const teacher = instructors.find((t) => t.id === teacherUid)
      const slots = getTeacherSlotsForDay(teacherUid, date)
      const id = await reportAbsence({ teacherUid, teacherName: teacher?.name || '', date, periods: slots.map((s) => s.period), reason })
      setActiveAbsence({ id, teacherUid, teacherName: teacher?.name || '', date, slots })
      setPicks({}); setAssigned(new Set())
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign(slot) {
    const key = `${slot.day}-${slot.period}`
    const substituteUid = picks[key]
    if (!substituteUid) return
    const substitute = instructors.find((t) => t.id === substituteUid)
    await assignSubstitute({
      absenceId: activeAbsence.id, date: activeAbsence.date, day: slot.day, period: slot.period,
      sectionId: slot.sectionId, sectionName: slot.sectionName, subjectId: slot.subjectId, subjectName: slot.subjectName,
      originalTeacherUid: activeAbsence.teacherUid, originalTeacherName: activeAbsence.teacherName,
      substituteTeacherUid: substituteUid, substituteTeacherName: substitute?.name || '',
    })
    setAssigned((prev) => new Set(prev).add(key))
  }

  async function handleFullyCovered() {
    await markAbsenceCovered(activeAbsence.id)
    setActiveAbsence(null)
  }

  return (
    <div>
      <div className="panel" style={{ maxWidth: '520px', marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, marginBottom: '10px' }}><i className="ti ti-user-exclamation" /> تسجيل غياب معلم</div>
        <form onSubmit={handleReport} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="field">
            <label htmlFor="abs-teacher">المعلم الغائب</label>
            <select id="abs-teacher" value={teacherUid} onChange={(e) => setTeacherUid(e.target.value)} required>
              <option value="">-- اختار --</option>
              {instructors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="abs-date">التاريخ</label>
            <input id="abs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="abs-reason">السبب (اختياري)</label>
            <input id="abs-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || scanning} style={{ width: 'auto' }}>
            {busy ? <i className="ti ti-loader-2 spin" /> : 'تسجيل الغياب وعرض الحصص'}
          </button>
        </form>
      </div>

      {activeAbsence && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>
            حصص {activeAbsence.teacherName} يوم {activeAbsence.date} ({activeAbsence.slots.length})
          </div>
          {activeAbsence.slots.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما إله حصص مجدولة هاليوم حسب آخر فحص.</p>
          ) : (
            <>
              {activeAbsence.slots.map((slot) => {
                const key = `${slot.day}-${slot.period}`
                const candidates = suggestSubstitutes(slot.day, slot.period, activeAbsence.teacherUid)
                const isAssigned = assigned.has(key)
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: '160px' }}>حصة {slot.period} — {slot.sectionName} ({slot.subjectName})</span>
                    {isAssigned ? (
                      <span style={{ color: 'var(--pine)' }}><i className="ti ti-circle-check" /> تم التعيين</span>
                    ) : (
                      <>
                        <select
                          value={picks[key] || ''}
                          onChange={(e) => setPicks((p) => ({ ...p, [key]: e.target.value }))}
                          style={{ minWidth: '160px' }}
                        >
                          <option value="">-- اختار بديل --</option>
                          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.weeklyLoad} حصة/أسبوع)</option>)}
                        </select>
                        <button type="button" className="btn btn-primary" style={{ width: 'auto' }} disabled={!picks[key]} onClick={() => handleAssign(slot)}>
                          تعيين
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              <button type="button" className="btn" style={{ width: 'auto', marginTop: '12px' }} onClick={handleFullyCovered}>
                إنهاء ووضع الغياب كمغطى بالكامل
              </button>
            </>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>آخر حالات الغياب</div>
        {absences.length === 0 ? <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما في غياب مسجّل بعد.</p> : (
          absences.slice(0, 15).map((a) => (
            <div key={a.id} style={{ fontSize: '12.5px', padding: '5px 0', borderTop: '1px solid var(--line)' }}>
              {a.teacherName} — {a.date} — {a.status === 'covered' ? 'مغطى' : 'مفتوح'} {a.reason ? `— ${a.reason}` : ''}
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>سجل التغطية</div>
        {coverageLog.length === 0 ? <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما في تغطية مسجّلة بعد.</p> : (
          coverageLog.slice(0, 15).map((c) => (
            <div key={c.id} style={{ fontSize: '12.5px', padding: '5px 0', borderTop: '1px solid var(--line)' }}>
              {c.date} — {c.subjectName} ({c.sectionName}): {c.originalTeacherName} ← {c.substituteTeacherName}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function ScheduleOpsPage() {
  const [tab, setTab] = useState('conflicts')
  const { error } = useScheduleOps()

  return (
    <div>
      <div className="eyebrow">الجدول الأسبوعي</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>التعارضات والتغطية</h2>
      {error && <p className="auth-error">{error}</p>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id} type="button" onClick={() => setTab(t.id)}
            className={tab === t.id ? 'btn btn-primary' : 'btn'} style={{ width: 'auto' }}
          >
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'conflicts' && <ConflictsTab />}
      {tab === 'availability' && <AvailabilityTab />}
      {tab === 'absence' && <AbsenceTab />}
    </div>
  )
}
