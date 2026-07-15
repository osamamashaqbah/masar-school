import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { parseMaterialUrl } from '../../utils/parseMaterialUrl'

const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د']
function emptyQuestion() { return { q: '', options: ['', '', '', ''], correct: 0 } }
function emptyMaterial() { return { label: '', url: '' } }

export default function InstructorAddLessonPage() {
  const { session } = useSession()
  const { subjects, addLessonToSubject } = useSchoolStructure()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)

  const [subjectId, setSubjectId] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonContent, setLessonContent] = useState('')
  const [lessonQuestions, setLessonQuestions] = useState([emptyQuestion()])
  const [lessonMaterials, setLessonMaterials] = useState([emptyMaterial()])
  const [showQuizBuilder, setShowQuizBuilder] = useState(false)
  const [showMaterialsBuilder, setShowMaterialsBuilder] = useState(false)
  const [lessonSaved, setLessonSaved] = useState(false)
  const [lessonError, setLessonError] = useState('')

  function addQuestionBlock() { setLessonQuestions((p) => [...p, emptyQuestion()]) }
  function removeQuestionBlock(i) { setLessonQuestions((p) => p.filter((_, idx) => idx !== i)) }
  function updateQuestionText(i, v) { setLessonQuestions((p) => { const u = [...p]; u[i] = { ...u[i], q: v }; return u }) }
  function updateOptionText(qi, oi, v) { setLessonQuestions((p) => { const u = [...p]; const opts = [...u[qi].options]; opts[oi] = v; u[qi] = { ...u[qi], options: opts }; return u }) }
  function setCorrectOption(qi, oi) { setLessonQuestions((p) => { const u = [...p]; u[qi] = { ...u[qi], correct: oi }; return u }) }
  function addMaterialRow() { setLessonMaterials((p) => [...p, emptyMaterial()]) }
  function removeMaterialRow(i) { setLessonMaterials((p) => p.filter((_, idx) => idx !== i)) }
  function updateMaterialField(i, f, v) { setLessonMaterials((p) => { const u = [...p]; u[i] = { ...u[i], [f]: v }; return u }) }

  async function handleAddLesson(e) {
    e.preventDefault()
    setLessonError('')
    if (!subjectId) { setLessonError('لازم تختار مادة أول.'); return }
    if (!lessonTitle.trim()) { setLessonError('لازم تكتب عنوان للدرس.'); return }

    const cleanQuestions = []
    for (let i = 0; i < lessonQuestions.length; i++) {
      const item = lessonQuestions[i]
      if (!item.q.trim()) continue
      const cleanOptions = item.options.map((o) => o.trim()).filter((o) => o !== '')
      if (cleanOptions.length < 2) { setLessonError(`السؤال رقم ${i + 1} لازم فيه خيارين على الأقل.`); return }
      cleanQuestions.push({ q: item.q.trim(), options: cleanOptions, correct: Math.min(item.correct, cleanOptions.length - 1) })
    }

    const cleanMaterials = lessonMaterials
      .filter((m) => m.url.trim() !== '')
      .map((m) => {
        const parsed = parseMaterialUrl(m.url)
        return { label: m.label.trim() || 'مرفق', url: m.url.trim(), type: parsed.type, embedUrl: parsed.embedUrl }
      })

    try {
      await addLessonToSubject(subjectId, {
        title: lessonTitle.trim(),
        content: lessonContent.trim(),
        quiz: cleanQuestions,
        materials: cleanMaterials,
      })
      setLessonTitle(''); setLessonContent(''); setLessonQuestions([emptyQuestion()]); setLessonMaterials([emptyMaterial()])
      setShowQuizBuilder(false); setShowMaterialsBuilder(false)
      setLessonSaved(true)
      setTimeout(() => setLessonSaved(false), 1800)
    } catch (err) {
      setLessonError('صار خطأ أثناء الحفظ: ' + err.message)
    }
  }

  return (
    <div>
      <div className="eyebrow">إضافة دروس</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>أضف درس جديد لمادتك</h2>

      {mySubjects.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد. تواصل مع إدارة المدرسة.</p>
      ) : (
        <form className="panel" onSubmit={handleAddLesson} style={{ maxWidth: '620px' }}>
          <div className="field">
            <label htmlFor="lesson-subject">المادة</label>
            <select id="lesson-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">-- اختار مادة --</option>
              {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="lesson-title">عنوان الدرس</label>
            <input id="lesson-title" type="text" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="lesson-content">محتوى الدرس (اختياري)</label>
            <textarea id="lesson-content" rows="3" value={lessonContent} onChange={(e) => setLessonContent(e.target.value)} />
          </div>

          {!showQuizBuilder ? (
            <button type="button" className="btn optional-toggle-btn" onClick={() => setShowQuizBuilder(true)}>
              <i className="ti ti-plus" /> إضافة اختبار (اختياري)
            </button>
          ) : (
            <div className="optional-section">
              <div className="optional-section-header">
                <span>أسئلة الاختبار</span>
                <button type="button" className="remove-question-btn" onClick={() => setShowQuizBuilder(false)}><i className="ti ti-x" /> إخفاء</button>
              </div>
              {lessonQuestions.map((item, qi) => (
                <div className="question-block" key={qi}>
                  <div className="question-block-header">
                    <span className="question-block-title">سؤال {qi + 1}</span>
                    {lessonQuestions.length > 1 && (
                      <button type="button" className="remove-question-btn" onClick={() => removeQuestionBlock(qi)}><i className="ti ti-trash" /> حذف</button>
                    )}
                  </div>
                  <input type="text" placeholder="نص السؤال" value={item.q} onChange={(e) => updateQuestionText(qi, e.target.value)} style={{ marginBottom: '10px' }} className="option-text-input" />
                  {item.options.map((opt, oi) => (
                    <div className="option-input-row" key={oi}>
                      <input type="radio" name={`correct-${qi}`} checked={item.correct === oi} onChange={() => setCorrectOption(qi, oi)} />
                      <span className="option-letter">{OPTION_LETTERS[oi]}</span>
                      <input type="text" className="option-text-input" placeholder={oi < 2 ? 'خيار (إلزامي)' : 'خيار (اختياري)'} value={opt} onChange={(e) => updateOptionText(qi, oi, e.target.value)} />
                    </div>
                  ))}
                </div>
              ))}
              <button type="button" className="btn add-question-btn" onClick={addQuestionBlock}><i className="ti ti-plus" /> إضافة سؤال آخر</button>
            </div>
          )}

          {!showMaterialsBuilder ? (
            <button type="button" className="btn optional-toggle-btn" onClick={() => setShowMaterialsBuilder(true)}>
              <i className="ti ti-paperclip" /> إضافة مرفقات (اختياري)
            </button>
          ) : (
            <div className="optional-section">
              <div className="optional-section-header">
                <span>مرفقات الدرس</span>
                <button type="button" className="remove-question-btn" onClick={() => setShowMaterialsBuilder(false)}><i className="ti ti-x" /> إخفاء</button>
              </div>
              {lessonMaterials.map((m, i) => (
                <div className="material-input-row" key={i}>
                  <input type="text" className="option-text-input" placeholder="اسم المرفق" value={m.label} onChange={(e) => updateMaterialField(i, 'label', e.target.value)} style={{ maxWidth: '150px' }} />
                  <input type="text" className="option-text-input" placeholder="رابط Drive أو YouTube" value={m.url} onChange={(e) => updateMaterialField(i, 'url', e.target.value)} />
                  {lessonMaterials.length > 1 && (
                    <button type="button" className="remove-question-btn" onClick={() => removeMaterialRow(i)}><i className="ti ti-trash" /></button>
                  )}
                </div>
              ))}
              <button type="button" className="btn add-question-btn" onClick={addMaterialRow}><i className="ti ti-plus" /> إضافة مرفق آخر</button>
            </div>
          )}

          {lessonError && <p className="auth-error">{lessonError}</p>}
          <button type="submit" className="btn btn-primary"><i className="ti ti-device-floppy" /> حفظ الدرس</button>
          {lessonSaved && <span className="notes-saved" style={{ marginRight: '10px' }}><i className="ti ti-check" /> تمت الإضافة</span>}
        </form>
      )}
    </div>
  )
}