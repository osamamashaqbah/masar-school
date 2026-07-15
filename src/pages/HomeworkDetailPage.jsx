import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useHomework } from '../context/HomeworkContext'
import { parseMaterialUrl } from '../utils/parseMaterialUrl'

export default function HomeworkDetailPage() {
  const { homeworkId } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { homework, getSubmission, submitHomework } = useHomework()

  const hw = homework.find((h) => h.id === homeworkId)
  const course = hw ? subjects.find((c) => c.id === hw.courseId) : null
  const submission = hw ? getSubmission(hw.id) : null

  const [answerUrl, setAnswerUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!hw || !course) return <div>الواجب غير موجود</div>

  const deadlineDate = hw.deadline?.toDate ? hw.deadline.toDate() : new Date(hw.deadline)
  const isPast = deadlineDate < new Date()
  const materialParsed = hw.materialUrl ? parseMaterialUrl(hw.materialUrl) : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!answerUrl.trim()) {
      setError('لازم تحط رابط إجابتك.')
      return
    }
    setLoading(true)
    try {
      await submitHomework(hw.id, answerUrl.trim())
      setAnswerUrl('')
    } catch (err) {
      setError('صار خطأ أثناء التسليم: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="eyebrow">{course.name}</div>
      <h2 className="page-title" style={{ marginBottom: '10px' }}>{hw.title}</h2>
      <p className="course-progress-text">
        <i className="ti ti-calendar-due" /> الموعد النهائي: {deadlineDate.toLocaleString('ar-EG')}
        {isPast && <span style={{ color: 'var(--berry)', marginRight: '8px' }}>(انتهى الموعد)</span>}
      </p>

      <div className="lesson-body animate-stagger">
        <p>{hw.description}</p>
      </div>

      {materialParsed && (
        <div className="materials-section animate-stagger" style={{ animationDelay: '60ms' }}>
          <div className="materials-heading"><i className="ti ti-paperclip" /> ملف الواجب</div>
          <div className="material-card">
            {(materialParsed.type === 'youtube' || materialParsed.type === 'drive') && (
              <iframe src={materialParsed.embedUrl} className="material-embed" allow="autoplay; encrypted-media" allowFullScreen title="ملف الواجب" />
            )}
            {materialParsed.type === 'image' && <img src={materialParsed.embedUrl} alt="ملف الواجب" className="material-image" />}
            {materialParsed.type === 'link' && (
              <a href={hw.materialUrl} target="_blank" rel="noopener noreferrer" className="btn btn-accent">
                <i className="ti ti-external-link" /> فتح الملف
              </a>
            )}
          </div>
        </div>
      )}

      <div className="quiz-card animate-stagger" style={{ animationDelay: '120ms' }}>
        {submission ? (
          <div>
            <p style={{ color: 'var(--pine)', fontWeight: 600, margin: '0 0 10px' }}>
              <i className="ti ti-circle-check" /> تم تسليم إجابتك
            </p>
            <a href={submission.url} target="_blank" rel="noopener noreferrer" className="btn">
              <i className="ti ti-external-link" /> شوف إجابتك المسلّمة
            </a>
          </div>
        ) : isPast ? (
          <p style={{ color: 'var(--berry)' }}>انتهى الموعد النهائي، ما عاد فيك تسلّم هاد الواجب.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="answer-url">رابط إجابتك (Google Drive)</label>
              <input id="answer-url" type="text" placeholder="ارفع إجابتك على Drive والصق الرابط هون" value={answerUrl} onChange={(e) => setAnswerUrl(e.target.value)} />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-upload" /> سلّم الواجب</>)}
            </button>
          </form>
        )}
      </div>

      <div className="lesson-nav" style={{ marginTop: '20px' }}>
        <button className="btn" onClick={() => navigate(`/app/homework/${course.id}`)}>
          <i className="ti ti-arrow-right" /> الرجوع لكل الواجبات
        </button>
      </div>
    </div>
  )
}