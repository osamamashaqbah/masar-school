import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { buildRolloverKey, rolloverOperationDocId } from '../utils/rollover'

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
  const [savedOperation, setSavedOperation] = useState(null)

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
  useEffect(() => {
    if (!session || !currentAcademicYear || !newYear.trim()) {
      setSavedOperation(null)
      return undefined
    }
    let cancelled = false
    const operationRef = doc(db, 'rolloverOperations', rolloverOperationDocId({
      schoolId: session.schoolId, currentAcademicYear, newYear,
    }))
    getDoc(operationRef).then((snap) => {
      if (!cancelled && snap.exists() && snap.data().status !== 'completed') setSavedOperation(snap.data())
    }).catch(() => {
      if (!cancelled) setSavedOperation(null)
    })
    return () => { cancelled = true }
  }, [session, currentAcademicYear, newYear])

  const canConfirm = newYear.trim() && (savedOperation || (sectionsWithStudents.length > 0 && allMapped)) && !running

  async function handleConfirm() {
    setRunning(true)
    setError('')
    try {
      const operationId = rolloverOperationDocId({
        schoolId: session.schoolId, currentAcademicYear, newYear,
      })
      const operationRef = doc(db, 'rolloverOperations', operationId)
      const operationSnap = await getDoc(operationRef)
      let resolvedTarget
      let studentTargets

      if (operationSnap.exists()) {
        const operation = operationSnap.data()
        if (operation.status === 'completed') throw new Error('rollover-already-completed')
        resolvedTarget = operation.resolvedTarget || {}
        studentTargets = operation.studentTargets || {}
      } else {
        // 1) أنشئ الشعب المطلوبة وسجّل خريطة الطلاب قبل أول batch، حتى تكون إعادة المحاولة قابلة للاستكمال.
        resolvedTarget = {}
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
        studentTargets = Object.fromEntries(
          students
            .filter((st) => Object.prototype.hasOwnProperty.call(resolvedTarget, st.sectionId))
            .map((st) => [st.id, resolvedTarget[st.sectionId]]),
        )
        await setDoc(operationRef, {
          schoolId: session.schoolId,
          currentAcademicYear,
          newYear: newYear.trim(),
          resolvedTarget,
          studentTargets,
          status: 'running',
          createdAt: Date.now(),
        })
      }

      // 2) حرّك فقط الطلاب غير المكتملين. الخريطة المحفوظة تمنع إعادة توزيع الطلاب بشكل مختلف بعد الفشل.
      const pendingStudents = students.filter((st) =>
        Object.prototype.hasOwnProperty.call(studentTargets, st.id) && st.sectionId !== studentTargets[st.id]
      )
      for (let i = 0; i < pendingStudents.length; i += 450) {
        const batch = writeBatch(db)
        pendingStudents.slice(i, i + 450).forEach((st) => {
          const target = studentTargets[st.id]
          batch.update(doc(db, 'users', st.id), { sectionId: target })
        })
        await batch.commit()
      }

      // 3) آخر خطوة بعد نجاح كل شي فوق — تفعيل السنة الجديدة
      const finalBatch = writeBatch(db)
      finalBatch.update(doc(db, 'schools', session.schoolId), { currentAcademicYear: newYear.trim() })
      await finalBatch.commit()
      await updateDoc(operationRef, { status: 'completed', completedAt: Date.now() })

      const targets = Object.values(studentTargets)
      const movedCount = targets.filter((target) => target !== null).length
      const graduatedCount = targets.filter((target) => target === null).length
      setResult({ movedCount, graduatedCount, newYear: newYear.trim() })
      setSavedOperation(null)
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
