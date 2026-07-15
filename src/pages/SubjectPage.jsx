import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useQuestions } from '../context/QuestionsContext'

export default function SubjectPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { progress } = useProgress()
  const { askQuestion, getQuestionsForSubject } = useQuestions()
  const [questionText, setQuestionText] = useState('')

  const subject = subjects.find((s) => s.id === subjectId)
  if (!subject) return <div>المادة غير موجودة</div>

  const done = progress[subjectId] || 0

  function openLesson(index) {
    navigate(`/app/lesson/${subjectId}/${index}`)
  }

  async function handleAsk() {
    if (!questionText.trim()) return
    await askQuestion(subjectId, questionText.trim())
    setQuestionText('')
  }

  return (
    <div>
      <div className="eyebrow">دروس المادة</div>
      <div className="topbar" style={{ marginBottom: '8px' }}>
        <h2 className="page-title">{subject.name}</h2>
        <button className="btn" onClick={() => navigate(`/app/homework/${subjectId}`)}>
          <i className="ti ti-clipboard-list" /> الواجبات
        </button>
      </div>
      <p className="course-progress-text">
        <i className="ti ti-flag" /> تقدمك: {done} من {subject.lessons.length} دروس
      </p>

      <div className="lesson-list-clean">
        {subject.lessons.map((l, i) => {
          const state = i < done ? 'done' : 'current'
          const iconMap = { done: 'ti-check', current: 'ti-player-play-filled' }
          const subMap = { done: 'مكتمل', current: 'متاح' }

          return (
            <div key={i} className={`lesson-row-clean ${state} animate-stagger`} style={{ animationDelay: `${i * 50}ms` }} onClick={() => openLesson(i)}>
              <div className={`lesson-dot-clean ${state}`}><i className={`ti ${iconMap[state]}`} /></div>
              <div style={{ flex: 1 }}>
                <div className="lesson-title">{i + 1}. {l.title}</div>
                <div className="lesson-sub">{subMap[state]}</div>
              </div>
              <i className="ti ti-chevron-left lesson-chevron" />
            </div>
          )
        })}
      </div>

      <div className="eyebrow" style={{ marginTop: '28px' }}>اسأل أستاذك</div>
      <div className="panel" style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input type="text" placeholder="اكتب سؤالك هون..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-accent" onClick={handleAsk}>إرسال</button>
        </div>
        {getQuestionsForSubject(subjectId).map((q) => (
          <div key={q.id} style={{ marginBottom: '10px', fontSize: '13px' }}>
            <strong>سؤالك:</strong> {q.text}
            {q.answer && <div style={{ color: 'var(--pine)', marginTop: '4px' }}><strong>الرد:</strong> {q.answer}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}