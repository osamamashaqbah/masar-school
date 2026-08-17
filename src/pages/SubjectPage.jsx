import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useQuestions } from '../context/QuestionsContext'

export default function SubjectPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { subjects, subjectsLoaded } = useSchoolStructure()
  const { progress } = useProgress()
  const { askQuestion, getQuestionsForSubject } = useQuestions()
  const [questionText, setQuestionText] = useState('')

  const subject = subjects.find((s) => s.id === subjectId)
  if (!subject) return <div className="panel">{subjectsLoaded ? 'المادة غير موجودة' : 'جاري تحميل المادة...'}</div>

  const done = progress[subjectId] || 0
  const total = subject.lessons.length
  const pct = total > 0 ? done / total : 0
  const R = 26
  const circumference = 2 * Math.PI * R

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
      <div className="subject-hero">
        <div className="subject-progress-ring">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="subjectRingGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            <circle className="subject-progress-ring-track" cx="32" cy="32" r={R} />
            <circle
              className="subject-progress-ring-value"
              cx="32" cy="32" r={R}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)}
            />
          </svg>
          <div className="subject-progress-ring-label">{Math.round(pct * 100)}٪</div>
        </div>
        <div className="subject-hero-text">
          <h2 className="page-title">{subject.name}</h2>
          <p className="subject-hero-sub"><i className="ti ti-flag" /> تقدمك: {done} من {total} دروس</p>
        </div>
        <button className="btn" onClick={() => navigate(`/app/homework/${subjectId}`)}>
          <i className="ti ti-clipboard-list" /> الواجبات
        </button>
      </div>

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
      <div className="panel ask-card">
        <div className="ask-card-title"><i className="ti ti-message-2-question" /> عندك سؤال عن الدرس؟</div>
        <div className="ask-row">
          <input type="text" placeholder="اكتب سؤالك هون..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
          <button className="btn btn-accent" onClick={handleAsk}>إرسال</button>
        </div>
        {getQuestionsForSubject(subjectId).length === 0 ? (
          <p className="question-empty">ما في أسئلة بعد — كن أول من يسأل.</p>
        ) : (
          getQuestionsForSubject(subjectId).map((q, i) => (
            <div key={q.id} className="question-item" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="question-item-q"><i className="ti ti-help-circle" /> {q.text}</div>
              {q.answer && <div className="question-item-a"><i className="ti ti-corner-down-left" /> {q.answer}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
