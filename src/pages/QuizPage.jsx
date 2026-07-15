import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useMarks } from '../context/MarksContext'






export default function QuizPage() {
  const { subjectId, lessonIndex } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { completeLesson } = useProgress()
  const { recordAttempt } = useQuizStats()
const { addMark } = useMarks()



  const subject = subjects.find((s) => s.id === subjectId)
  const index = Number(lessonIndex)
  const lesson = subject?.lessons[index]
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  if (!subject || !lesson) return <div>الاختبار غير موجود</div>

  const questions = lesson.quiz
  const question = questions[current]

 function submit() {
    if (selected === null || answered) return
    setAnswered(true)
    const correct = selected === question.correct
    recordAttempt(subject.id, correct)
    if (correct) setScore((s) => s + 1)
  }

  function next() {
    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1); setSelected(null); setAnswered(false)
    } else {
      setFinished(true)
      if (score > questions.length / 2) completeLesson(subject.id, index)
    }
  }

  if (finished) {
    const passed = score > questions.length / 2
    return (
      <div>
        <div className="eyebrow">نتيجة اختبار الدرس</div>
        <h2 className="page-title" style={{ marginBottom: '18px' }}>{lesson.title}</h2>
        <div className="quiz-card">
          <div className="quiz-result">
            <div className={`quiz-score animate-pop ${passed ? 'win' : 'lose'}`}>{score}/{questions.length}</div>
            <p style={{ fontSize: '15px', margin: '0 0 24px', color: 'var(--ink-soft)' }}>
              {passed ? 'أحسنت! انتقلت لمحطة جديدة.' : 'لازم تجاوب صح على أكثر من نص الأسئلة. راجع الدرس وحاول مرة ثانية.'}
            </p>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 26px' }} onClick={() => navigate(`/app/subject/${subject.id}`)}>
              <i className="ti ti-map-pin" /> الرجوع للمادة
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">اختبار الدرس</div>
      <h2 className="page-title" style={{ marginBottom: '18px' }}>{lesson.title}</h2>
      <div className="quiz-card">
        <div className="quiz-progress">سؤال {current + 1} من {questions.length}</div>
        <div className="quiz-q">{question.q}</div>
        {!answered ? (
          <>
            <div>{question.options.map((opt, i) => (
              <div key={i} className={`quiz-option${selected === i ? ' selected' : ''}`} onClick={() => setSelected(i)}>{opt}</div>
            ))}</div>
            <button className="btn btn-accent" onClick={submit}>تأكيد الإجابة</button>
          </>
        ) : (
          <>
            <div>{question.options.map((opt, i) => {
              let cls = 'quiz-option animate-pop'
              if (i === question.correct) cls += ' correct'
              else if (i === selected) cls += ' wrong'
              return <div key={i} className={cls}>{opt}</div>
            })}</div>
            <button className="btn btn-accent" onClick={next}>{current + 1 < questions.length ? 'السؤال التالي' : 'عرض النتيجة'}</button>
          </>
        )}
      </div>
    </div>
  )
}