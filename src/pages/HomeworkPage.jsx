import { useParams, useNavigate } from 'react-router-dom'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useHomework } from '../context/HomeworkContext'

export default function HomeworkPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { subjects } = useSchoolStructure()
  const { getHomeworkForCourse, getSubmission } = useHomework()

  const course = subjects.find((c) => c.id === subjectId)
  const homeworkList = getHomeworkForCourse(subjectId)

  if (!course) return <div>المادة غير موجودة</div>

  return (
    <div>
      <div className="eyebrow">واجبات المادة</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>{course.name}</h2>

      {homeworkList.length === 0 ? (
        <div className="homework-empty">
          <i className="ti ti-clipboard-off" />
          <p>ما في واجبات مضافة لهذي المادة بعد.</p>
        </div>
      ) : (
        <div className="homework-list">
          {homeworkList.map((hw, i) => {
            const deadlineDate = hw.deadline?.toDate ? hw.deadline.toDate() : new Date(hw.deadline)
            const isPast = deadlineDate < new Date()
            const submission = getSubmission(hw.id)

            return (
              <div
                key={hw.id}
                className="homework-card animate-stagger"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => navigate(`/app/homework-detail/${hw.id}`)}
              >
                <div className="homework-card-title"><i className="ti ti-notebook" /> {hw.title}</div>
                <div className="homework-card-meta">
                  <i className="ti ti-calendar-due" />
                  الموعد النهائي: {deadlineDate.toLocaleString('ar-EG')}
                </div>
                {submission?.status === 'returned' ? (
                  <span className="tag" style={{ background: 'var(--berry-bg)', color: 'var(--berry)' }}>رجّعها المعلّم — أعد التسليم</span>
                ) : submission?.status === 'graded' ? (
                  <span className="tag tag-pine">تم التصحيح</span>
                ) : submission ? (
                  <span className="tag tag-pine">تم التسليم</span>
                ) : isPast ? (
                  <span className="tag" style={{ background: 'var(--berry-bg)', color: 'var(--berry)' }}>انتهى الموعد</span>
                ) : (
                  <span className="tag tag-sunset">لسا ما سلّمت</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}