import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { parseMaterialUrl } from '../../utils/parseMaterialUrl'

function emptyMaterial() {
  return { label: '', url: '' }
}

export default function InstructorMaterialsPage() {
  const { session } = useSession()
  const { subjects, updateSubjectLesson } = useSchoolStructure()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)

  const [existingSubjectId, setExistingSubjectId] = useState('')
  const [existingLessonIndex, setExistingLessonIndex] = useState('')
  const [existingMaterials, setExistingMaterials] = useState([emptyMaterial()])
  const [existingError, setExistingError] = useState('')
  const [existingSaved, setExistingSaved] = useState(false)

  const existingSubject = mySubjects.find((s) => s.id === existingSubjectId)

  function addExistingMaterialRow() {
    setExistingMaterials((prev) => [...prev, emptyMaterial()])
  }
  function removeExistingMaterialRow(index) {
    setExistingMaterials((prev) => prev.filter((_, i) => i !== index))
  }
  function updateExistingMaterialField(index, field, value) {
    setExistingMaterials((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  async function handleAddMaterialsToExistingLesson(e) {
    e.preventDefault()
    setExistingError('')

    if (!existingSubjectId) {
      setExistingError('لازم تختار مادة أول.')
      return
    }
    if (existingLessonIndex === '') {
      setExistingError('لازم تختار درس أول.')
      return
    }

    const newMaterials = existingMaterials
      .filter((m) => m.url.trim() !== '')
      .map((m) => {
        const parsed = parseMaterialUrl(m.url)
        return { label: m.label.trim() || 'مرفق', url: m.url.trim(), type: parsed.type, embedUrl: parsed.embedUrl }
      })

    if (newMaterials.length === 0) {
      setExistingError('لازم تضيف رابط واحد على الأقل.')
      return
    }

    try {
      const lesson = existingSubject.lessons[Number(existingLessonIndex)]
      const updatedMaterials = [...(lesson.materials || []), ...newMaterials]
      await updateSubjectLesson(existingSubjectId, Number(existingLessonIndex), { materials: updatedMaterials })

      setExistingMaterials([emptyMaterial()])
      setExistingSaved(true)
      setTimeout(() => setExistingSaved(false), 1800)
    } catch (err) {
      setExistingError('صار خطأ أثناء الحفظ: ' + err.message)
    }
  }

  return (
    <div>
      <div className="eyebrow">مرفقات إضافية</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>
        أضف رابط لدرس موجود من قبل
      </h2>

      {mySubjects.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد.</p>
      ) : (
        <form className="panel" onSubmit={handleAddMaterialsToExistingLesson} style={{ maxWidth: '620px' }}>
          <div className="field">
            <label htmlFor="existing-subject">المادة</label>
            <select
              id="existing-subject"
              value={existingSubjectId}
              onChange={(e) => {
                setExistingSubjectId(e.target.value)
                setExistingLessonIndex('')
              }}
            >
              <option value="">-- اختار مادة --</option>
              {mySubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {existingSubject && (
            <div className="field">
              <label htmlFor="existing-lesson">الدرس</label>
              <select id="existing-lesson" value={existingLessonIndex} onChange={(e) => setExistingLessonIndex(e.target.value)}>
                <option value="">-- اختار درس --</option>
                {existingSubject.lessons.map((l, i) => (
                  <option key={i} value={i}>{i + 1}. {l.title}</option>
                ))}
              </select>
            </div>
          )}

          {existingSubject && existingLessonIndex !== '' && (
            <>
              <p className="materials-hint">هيك رح تنضاف مرفقات جديدة فوق أي مرفقات موجودة أصلاً بهاد الدرس.</p>
              {existingMaterials.map((m, i) => (
                <div className="material-input-row" key={i}>
                  <input
                    type="text"
                    className="option-text-input"
                    placeholder="اسم المرفق"
                    value={m.label}
                    onChange={(e) => updateExistingMaterialField(i, 'label', e.target.value)}
                    style={{ maxWidth: '150px' }}
                  />
                  <input
                    type="text"
                    className="option-text-input"
                    placeholder="رابط Google Drive أو YouTube"
                    value={m.url}
                    onChange={(e) => updateExistingMaterialField(i, 'url', e.target.value)}
                  />
                  {existingMaterials.length > 1 && (
                    <button type="button" className="remove-question-btn" onClick={() => removeExistingMaterialRow(i)}>
                      <i className="ti ti-trash" />
                    </button>
                  )}
                </div>
              ))}

              <button type="button" className="btn add-question-btn" onClick={addExistingMaterialRow}>
                <i className="ti ti-plus" /> إضافة رابط آخر
              </button>

              {existingError && <p className="auth-error">{existingError}</p>}

              <button type="submit" className="btn btn-primary">
                <i className="ti ti-device-floppy" /> حفظ المرفقات
              </button>
              {existingSaved && (
                <span className="notes-saved" style={{ marginRight: '10px' }}>
                  <i className="ti ti-check" /> تمت الإضافة
                </span>
              )}
            </>
          )}
        </form>
      )}
    </div>
  )
}