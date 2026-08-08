import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useHomework } from '../context/HomeworkContext'
import { parseMaterialUrl } from '../utils/parseMaterialUrl'

const STATUS_LABELS = {
  submitted: 'تم التسليم، بانتظار المراجعة',
  returned: 'المعلّم رجّع الواجب — يحتاج إعادة تسليم',
  resubmitted: 'أعدت التسليم، بانتظار المراجعة',
  graded: 'تم التصحيح ✅',
}

export default function HomeworkDetailPage() {
  const { homeworkId } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { homework, getSubmission, submitHomework, resubmitHomework } = useHomework()

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
  const canResubmit = submission?.status === 'returned'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!answerUrl.trim()) {
      setError('لازم تحط رابط إجابتك.')
      return
    }
    setLoading(true)
    try {
      if (canResubmit) {
        await resubmitHomework(hw.id, answerUrl.trim())
      } else {
        await submitHomework(hw.id, answerUrl.trim())
      }
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
      <div className={`deadline-pill${isPast ? ' past' : ''}`}>
        <i className={`ti ${isPast ? 'ti-calendar-x' : 'ti-calendar-due'}`} />
        {isPast ? 'انتهى الموعد النهائي' : `الموعد النهائي: ${deadlineDate.toLocaleString('ar-EG')}`}
      </div>

      <div className="lesson-body animate-stagger">
        <p>{hw.description}</p>
      </div>

      {hw.rubric && (
        <div className="lesson-body animate-stagger" style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}><i className="ti ti-list-check" /> معايير التصحيح</div>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--ink-soft)' }}>{hw.rubric}</p>
        </div>
      )}

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
        {submission && !canResubmit ? (
          <div>
            <p style={{ color: submission.status === 'graded' ? 'var(--pine)' : 'inherit', fontWeight: 600, margin: '0 0 6px' }}>
              <i className={`ti ${submission.status === 'graded' ? 'ti-circle-check' : 'ti-clock'}`} />{' '}
              {STATUS_LABELS[submission.status] || 'تم التسليم'}
            </p>
            {submission.attemptCount > 1 && (
              <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '0 0 10px' }}>المحاولة رقم {submission.attemptCount}</p>
            )}
            <a href={submission.url} target="_blank" rel="noopener noreferrer" className="btn">
              <i className="ti ti-external-link" /> شوف إجابتك المسلّمة
            </a>
          </div>
        ) : canResubmit ? (
          <div>
            <p style={{ color: 'var(--berry)', fontWeight: 600, margin: '0 0 6px' }}>
              <i className="ti ti-arrow-back-up" /> المعلّم رجّع الواجب — يحتاج إعادة تسليم
            </p>
            {submission.teacherComment && (
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
                <i className="ti ti-message-2" /> {submission.teacherComment}
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="answer-url">رابط إجابتك الجديدة (Google Drive)</label>
                <input id="answer-url" type="text" placeholder="ارفع إجابتك على Drive والصق الرابط هون" value={answerUrl} onChange={(e) => setAnswerUrl(e.target.value)} />
              </div>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-upload" /> أعد التسليم</>)}
              </button>
            </form>
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