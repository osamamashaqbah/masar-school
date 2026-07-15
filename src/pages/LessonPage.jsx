import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useNotes } from '../context/NotesContext'

export default function LessonPage() {
  const { subjectId, lessonIndex } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { getNote } = useNotes()

  const subject = subjects.find((s) => s.id === subjectId)
  const index = Number(lessonIndex)
  const lesson = subject?.lessons[index]
  if (!subject || !lesson) return <div>الدرس غير موجود</div>

  const instructorNote = getNote(subjectId, index)

  return (
    <div>
      <div className="eyebrow">الدرس {index + 1} من {subject.lessons.length} · {subject.name}</div>
      <h2 className="page-title animate-stagger">{lesson.title}</h2>

      <div className="lesson-body animate-stagger" style={{ animationDelay: '60ms' }}>
        <p>{lesson.content}</p>
      </div>

      {lesson.materials?.length > 0 && (
        <div className="materials-section animate-stagger" style={{ animationDelay: '120ms' }}>
          <div className="materials-heading"><i className="ti ti-paperclip" /> مرفقات الدرس</div>
          {lesson.materials.map((m, i) => (
            <div className="material-card" key={i}>
              <div className="material-label">{m.label}</div>
              {(m.type === 'youtube' || m.type === 'drive') && (
                <iframe src={m.embedUrl} className="material-embed" allow="autoplay; encrypted-media" allowFullScreen title={m.label} />
              )}
              {m.type === 'image' && <img src={m.embedUrl} alt={m.label} className="material-image" />}
              {m.type === 'link' && (
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn btn-accent"><i className="ti ti-external-link" /> فتح الرابط</a>
              )}
            </div>
          ))}
        </div>
      )}

      {instructorNote && (
        <div className="instructor-note-card animate-stagger" style={{ animationDelay: '180ms' }}>
          <div className="instructor-note-label"><i className="ti ti-message-2-bolt" /> ملاحظة من {subject.teacherName}</div>
          <p>{instructorNote}</p>
        </div>
      )}

      <div className="lesson-nav">
        <button className="btn" onClick={() => navigate(`/app/subject/${subject.id}`)}><i className="ti ti-arrow-right" /> الرجوع للمادة</button>
        {lesson.quiz?.length > 0 && (
          <button className="btn btn-accent" onClick={() => navigate(`/app/quiz/${subject.id}/${index}`)}>ابدأ اختبار الدرس <i className="ti ti-arrow-left" /></button>
        )}
      </div>
    </div>
  )
}