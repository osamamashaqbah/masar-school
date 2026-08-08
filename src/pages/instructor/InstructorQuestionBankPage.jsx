import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useQuestionBank, DIFFICULTIES } from '../../context/QuestionBankContext'

function emptyOptions() { return ['', '', '', ''] }

function AddQuestionForm({ mySubjects }) {
  const { addQuestion } = useQuestionBank()
  const [subjectId, setSubjectId] = useState('')
  const [text, setText] = useState('')
  const [options, setOptions] = useState(emptyOptions())
  const [correctIndex, setCorrectIndex] = useState(0)
  const [difficulty, setDifficulty] = useState('medium')
  const [tagsText, setTagsText] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const subject = mySubjects.find((s) => s.id === subjectId)
    const cleanOptions = options.map((o) => o.trim()).filter((o) => o !== '')
    if (!subject) { setError('لازم تختار مادة.'); return }
    if (!text.trim()) { setError('لازم تكتب نص السؤال.'); return }
    if (cleanOptions.length < 2) { setError('لازم خيارين على الأقل.'); return }
    await addQuestion({
      subjectId, subjectName: subject.name, questionText: text, options: cleanOptions,
      correctIndex: Math.min(correctIndex, cleanOptions.length - 1), difficulty,
      tags: tagsText.split('،').map((t) => t.trim()).filter(Boolean),
    })
    setText(''); setOptions(emptyOptions()); setCorrectIndex(0); setTagsText('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <form className="panel" onSubmit={handleSubmit} style={{ maxWidth: '620px', marginBottom: '24px' }}>
      <div style={{ fontWeight: 700, marginBottom: '10px' }}><i className="ti ti-database-plus" /> إضافة سؤال للبنك</div>
      <div className="field">
        <label htmlFor="qb-subject">المادة</label>
        <select id="qb-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">-- اختار --</option>
          {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="qb-text">نص السؤال</label>
        <input id="qb-text" type="text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <input type="radio" name="qb-correct" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
          <input
            type="text" placeholder={i < 2 ? 'خيار (إلزامي)' : 'خيار (اختياري)'} style={{ flex: 1 }}
            value={opt} onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: '140px' }}>
          <label htmlFor="qb-difficulty">مستوى الصعوبة</label>
          <select id="qb-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 2, minWidth: '200px' }}>
          <label htmlFor="qb-tags">وسوم (افصل بفاصلة عربية «،»)</label>
          <input id="qb-tags" type="text" placeholder="مثال: الوحدة الأولى، مراجعة" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="btn btn-primary" type="submit" style={{ marginTop: '6px' }}>إضافة للبنك</button>
      {saved && <span className="notes-saved" style={{ marginRight: '10px' }}><i className="ti ti-check" /> تمت الإضافة</span>}
    </form>
  )
}

function GenerateQuizTool({ mySubjects }) {
  const { subjects, updateSubjectLesson } = useSchoolStructure()
  const { pickRandom } = useQuestionBank()
  const [subjectId, setSubjectId] = useState('')
  const [lessonIndex, setLessonIndex] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count, setCount] = useState(5)
  const [result, setResult] = useState(null)

  const subject = subjects.find((s) => s.id === subjectId)
  const lessons = subject?.lessons || []

  async function handleGenerate(e) {
    e.preventDefault()
    if (!subject || lessonIndex === '') return
    const picked = pickRandom(subjectId, difficulty || null, Number(count))
    if (picked.length === 0) { setResult({ added: 0, requested: Number(count) }); return }
    const lesson = lessons[Number(lessonIndex)]
    const newQuiz = [
      ...(lesson.quiz || []),
      ...picked.map((q) => ({ q: q.questionText, options: q.options, correct: q.correctIndex, bankQuestionId: q.id })),
    ]
    await updateSubjectLesson(subjectId, Number(lessonIndex), { quiz: newQuiz })
    setResult({ added: picked.length, requested: Number(count) })
  }

  return (
    <form className="panel" onSubmit={handleGenerate} style={{ maxWidth: '620px', marginBottom: '24px' }}>
      <div style={{ fontWeight: 700, marginBottom: '10px' }}><i className="ti ti-wand" /> توليد اختبار عشوائي من البنك</div>
      <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '0 0 10px' }}>
        بيختار أسئلة عشوائية من البنك (حسب المادة والصعوبة) ويضيفها لاختبار درس موجود.
      </p>
      <div className="field">
        <label htmlFor="gen-subject">المادة</label>
        <select id="gen-subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setLessonIndex('') }}>
          <option value="">-- اختار --</option>
          {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {subject && (
        <div className="field">
          <label htmlFor="gen-lesson">الدرس (بيتضاف الاختبار لاختباره)</label>
          <select id="gen-lesson" value={lessonIndex} onChange={(e) => setLessonIndex(e.target.value)}>
            <option value="">-- اختار --</option>
            {lessons.map((l, i) => <option key={i} value={i}>{l.title}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: '140px' }}>
          <label htmlFor="gen-difficulty">الصعوبة (اختياري)</label>
          <select id="gen-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">-- الكل --</option>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: '100px' }}>
          <label htmlFor="gen-count">عدد الأسئلة</label>
          <input id="gen-count" type="number" min="1" max="30" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" type="submit" disabled={!subjectId || lessonIndex === ''}>توليد وإضافة</button>
      {result && (
        <p style={{ fontSize: '12.5px', marginTop: '8px', color: result.added > 0 ? 'var(--pine)' : 'var(--berry)' }}>
          {result.added > 0 ? `تمت إضافة ${result.added} سؤال لاختبار الدرس.` : 'ما في أسئلة كافية بالبنك تطابق هالفلاتر.'}
        </p>
      )}
    </form>
  )
}

export default function InstructorQuestionBankPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { questions, duplicateQuestion, deleteQuestion } = useQuestionBank()

  const mySubjects = session.role === 'admin' ? subjects : subjects.filter((s) => s.teacherUid === session.uid)
  const mySubjectIds = mySubjects.map((s) => s.id)

  const [filterSubject, setFilterSubject] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [search, setSearch] = useState('')

  const filtered = questions
    .filter((q) => mySubjectIds.includes(q.subjectId))
    .filter((q) => !filterSubject || q.subjectId === filterSubject)
    .filter((q) => !filterDifficulty || q.difficulty === filterDifficulty)
    .filter((q) => !search.trim() || q.questionText.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div>
      <div className="eyebrow">بنك الأسئلة</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>أسئلة قابلة لإعادة الاستخدام</h2>

      <AddQuestionForm mySubjects={mySubjects} />
      <GenerateQuizTool mySubjects={mySubjects} />

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} style={{ maxWidth: '220px' }}>
            <option value="">كل المواد</option>
            {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} style={{ maxWidth: '160px' }}>
            <option value="">كل المستويات</option>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <input type="text" placeholder="بحث بنص السؤال..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما في أسئلة مطابقة.</p>
        ) : (
          filtered.map((q) => {
            const pct = q.timesUsed > 0 ? Math.round((q.timesCorrect / q.timesUsed) * 100) : null
            return (
              <div key={q.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span><strong>{q.questionText}</strong> — <span style={{ color: 'var(--ink-faint)' }}>{q.subjectName} · {DIFFICULTIES.find((d) => d.id === q.difficulty)?.label}</span></span>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn" style={{ width: 'auto', padding: '4px 8px' }} onClick={() => duplicateQuestion(q)}><i className="ti ti-copy" /></button>
                    <button className="btn" style={{ width: 'auto', padding: '4px 8px', color: 'var(--berry)' }} onClick={() => deleteQuestion(q.id)}><i className="ti ti-trash" /></button>
                  </span>
                </div>
                <div style={{ color: 'var(--ink-faint)', marginTop: '3px' }}>
                  {q.options.map((o, i) => (
                    <span key={i} style={{ marginInlineEnd: '10px', color: i === q.correctIndex ? 'var(--pine)' : undefined }}>
                      {i === q.correctIndex && <i className="ti ti-circle-check" />} {o}
                    </span>
                  ))}
                </div>
                {pct !== null && (
                  <div style={{ marginTop: '3px', color: pct < 50 ? 'var(--berry)' : 'var(--ink-faint)' }}>
                    نسبة الإجابة الصحيحة: {pct}% ({q.timesUsed} محاولة){pct < 50 ? ' — ممكن السؤال غير واضح' : ''}
                  </div>
                )}
                {q.tags?.length > 0 && <div style={{ marginTop: '3px', color: 'var(--ink-faint)' }}>{q.tags.join('، ')}</div>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
