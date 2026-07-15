import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useQuestions } from '../../context/QuestionsContext'

export default function InstructorQuestionsPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { teacherQuestions, answerQuestion } = useQuestions()
  const [drafts, setDrafts] = useState({})

  const mySubjectIds = subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.id)
  const myQuestions = teacherQuestions.filter((q) => mySubjectIds.includes(q.subjectId))
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || ''

  async function handleAnswer(qId) {
    const text = drafts[qId]
    if (!text?.trim()) return
    await answerQuestion(qId, text.trim())
    setDrafts((prev) => ({ ...prev, [qId]: '' }))
  }

  return (
    <div>
      <div className="eyebrow">أسئلة الطلاب</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>رد على أسئلة طلابك</h2>

      {myQuestions.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في أسئلة بعد.</p>
      ) : (
        <div className="analytics-list">
          {myQuestions.map((q) => (
            <div className="analytics-row" key={q.id}>
              <div className="analytics-title">{q.studentName} · {subjectName(q.subjectId)}</div>
              <p style={{ fontSize: '13.5px', margin: '6px 0' }}>{q.text}</p>
              {q.answer ? (
                <div className="instructor-note-card" style={{ margin: '8px 0 0' }}>
                  <div className="instructor-note-label"><i className="ti ti-message-2" /> ردّك</div>
                  <p>{q.answer}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    className="option-text-input"
                    placeholder="اكتب ردّك هون..."
                    value={drafts[q.id] || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <button className="btn btn-accent" onClick={() => handleAnswer(q.id)}>رد</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}