import { useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { buildRolloverKey } from '../utils/rollover'

const GRADUATE = 'graduate'
const EXISTING = 'existing'
const NEW = 'new'

export default function AdminRolloverPage() {
  const { session } = useSession()
  const { grades, sections, allUsers, currentAcademicYear, addSection } = useSchoolStructure()

  const [newYear, setNewYear] = useState('')
  const [choices, setChoices] = useState({}) // sectionId -> { type, targetSectionId?, newName?, newGradeId? }
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const students = allUsers.filter((u) => u.role === 'student')
  const sectionsWithStudents = sections.filter((s) => students.some((st) => st.sectionId === s.id))

  function setChoice(sectionId, patch) {
    setChoices((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], ...patch } }))
  }

  const allMapped = sectionsWithStudents.every((s) => {
    const c = choices[s.id]
    if (!c) return false
    if (c.type === EXISTING) return !!c.targetSectionId
    if (c.type === NEW) return !!c.newName?.trim() && !!c.newGradeId
    return c.type === GRADUATE
  })
  const canConfirm = newYear.trim() && sectionsWithStudents.length > 0 && allMapped && !running

  async function handleConfirm() {
    setRunning(true)
    setError('')
    try {
      // 1) ننشئ أي شعب جديدة مطلوبة أول شي، حتى تصير عندنا كل الـ sectionId قبل تحريك الطلاب
      const resolvedTarget = {}
      for (const section of sectionsWithStudents) {
        const c = choices[section.id]
        if (c.type === EXISTING) resolvedTarget[section.id] = c.targetSectionId
        else if (c.type === GRADUATE) resolvedTarget[section.id] = null
        else if (c.type === NEW) {
          const targetName = c.newName.trim().replace(/\s+/g, ' ')
          const rolloverKey = buildRolloverKey({
            schoolId: session.schoolId,
            currentAcademicYear,
            newYear,
            sourceSectionId: section.id,
            newGradeId: c.newGradeId,
            name: targetName,
          })
          resolvedTarget[section.id] = await addSection(c.newGradeId, targetName, { idempotencyKey: rolloverKey })
        }
      }

      // 2) تحريك كل طالب لشعبته الجديدة، على batches بحد 450 عملية
      let movedCount = 0
      let graduatedCount = 0
      const affectedStudents = students.filter((st) => st.sectionId in resolvedTarget)
      for (let i = 0; i < affectedStudents.length; i += 450) {
        const batch = writeBatch(db)
        affectedStudents.slice(i, i + 450).forEach((st) => {
          const target = resolvedTarget[st.sectionId]
          batch.update(doc(db, 'users', st.id), { sectionId: target })
          if (target === null) graduatedCount += 1
          else movedCount += 1
        })
        await batch.commit()
      }

      // 3) آخر خطوة بعد نجاح كل شي فوق — تفعيل السنة الجديدة
      const finalBatch = writeBatch(db)
      finalBatch.update(doc(db, 'schools', session.schoolId), { currentAcademicYear: newYear.trim() })
      await finalBatch.commit()

      setResult({ movedCount, graduatedCount, newYear: newYear.trim() })
      setChoices({})
      setNewYear('')
    } catch (err) {
      setError(`صار خطأ وقت الترفيع: ${err.code || err.message}. تحقق من الحالة قبل ما تعيد المحاولة.`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">إجراء لمرة بالسنة — لا يمكن التراجع بسهولة</div>
          <h2 className="page-title">بدء سنة دراسية جديدة</h2>
        </div>
        <div className="role-badge"><i className="ti ti-calendar-event" /> السنة الحالية: {currentAcademicYear || 'غير محددة بعد'}</div>
      </div>

      {result && (
        <div className="panel card-hover-lift animate-stagger" style={{ marginBottom: '20px', maxWidth: '520px' }}>
          <div style={{ fontWeight: 800, marginBottom: '6px' }}><i className="ti ti-check" /> تم الترفيع بنجاح</div>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: 0 }}>
            {result.movedCount} طالب انترفّع، {result.graduatedCount} طالب اتخرّج/انهى، السنة الحالية الآن {result.newYear}.
          </p>
        </div>
      )}

      <div className="panel" style={{ maxWidth: '320px', marginBottom: '22px' }}>
        <div className="field">
          <label htmlFor="new-year">السنة الدراسية الجديدة</label>
          <input id="new-year" type="text" placeholder="مثال: 2026-2027" value={newYear} onChange={(e) => setNewYear(e.target.value)} />
        </div>
      </div>

      {sectionsWithStudents.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في طلاب مسجّلين بأي شعبة حاليًا.</p>
      ) : (
        <div className="analytics-list">
          {sectionsWithStudents.map((section) => {
            const grade = grades.find((g) => g.id === section.gradeId)
            const studentCount = students.filter((st) => st.sectionId === section.id).length
            const c = choices[section.id] || {}
            const otherSections = sections.filter((s) => s.id !== section.id)

            return (
              <div className="analytics-row" key={section.id}>
                <div className="analytics-title">{grade?.name} — {section.name} <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>({studentCount} طالب)</span></div>

                <div style={{ display: 'flex', gap: '8px', margin: '10px 0', flexWrap: 'wrap' }}>
                  <button type="button" className={`excuse-toggle-btn${c.type === EXISTING ? ' active' : ''}`} onClick={() => setChoice(section.id, { type: EXISTING })}>شعبة موجودة</button>
                  <button type="button" className={`excuse-toggle-btn${c.type === NEW ? ' active' : ''}`} onClick={() => setChoice(section.id, { type: NEW })}>+ شعبة جديدة</button>
                  <button type="button" className={`excuse-toggle-btn${c.type === GRADUATE ? ' active' : ''}`} onClick={() => setChoice(section.id, { type: GRADUATE })}>تخرّج/إنهاء</button>
                </div>

                {c.type === EXISTING && (
                  <select value={c.targetSectionId || ''} onChange={(e) => setChoice(section.id, { targetSectionId: e.target.value })}>
                    <option value="">-- اختار الشعبة الهدف --</option>
                    {otherSections.map((s) => {
                      const g = grades.find((gr) => gr.id === s.gradeId)
                      return <option key={s.id} value={s.id}>{g?.name} — {s.name}</option>
                    })}
                  </select>
                )}

                {c.type === NEW && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <select value={c.newGradeId || ''} onChange={(e) => setChoice(section.id, { newGradeId: e.target.value })} style={{ flex: 1, minWidth: '140px' }}>
                      <option value="">-- الصف --</option>
                      {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <input
                      type="text" placeholder="اسم الشعبة الجديدة" value={c.newName || ''}
                      onChange={(e) => setChoice(section.id, { newName: e.target.value })}
                      style={{ flex: 1, minWidth: '140px' }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="auth-error" style={{ marginTop: '14px' }}>{error}</p>}

      <button type="button" className="btn btn-primary" style={{ marginTop: '18px', width: 'auto', padding: '11px 24px' }} onClick={handleConfirm} disabled={!canConfirm}>
        {running ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-arrow-up-circle" /> تأكيد الترفيع وبدء السنة الجديدة</>}
      </button>
    </div>
  )
}
