import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useHomework } from '../../context/HomeworkContext'
import { useMarks } from '../../context/MarksContext'

const STATUS_LABELS = {
  submitted: 'بانتظار المراجعة',
  returned: 'رجّعتها للطالب',
  resubmitted: 'أعاد الطالب التسليم',
  graded: 'تم التقييم',
}

export default function InstructorGradeHomeworkPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { homework, returnHomework, markSubmissionGraded } = useHomework()
  const { setMarkValue } = useMarks()

  const [submissions, setSubmissions] = useState([])
  const [scores, setScores] = useState({})       // sub.id -> الدرجة
  const [maxScores, setMaxScores] = useState({}) // sub.id -> من كم
  const [comments, setComments] = useState({})   // sub.id -> ملاحظة الإرجاع
  const [busyIds, setBusyIds] = useState({})

  const mySubjectIds = subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.id)
  const myHomework = homework.filter((h) => mySubjectIds.includes(h.courseId))
  const myHomeworkIds = myHomework.map((h) => h.id)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'submissions'), (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => myHomeworkIds.includes(s.homeworkId)))
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homework.length])

  async function handleGrade(sub, hw) {
    const score = scores[sub.id]
    const max = maxScores[sub.id]
    if (!score || !max) return
    setBusyIds((p) => ({ ...p, [sub.id]: true }))
    try {
      await setMarkValue(hw.courseId, sub.studentUid, 'homework', score, max, hw.id)
      await markSubmissionGraded(sub.id)
    } finally {
      setBusyIds((p) => ({ ...p, [sub.id]: false }))
    }
  }

  async function handleReturn(sub) {
    const comment = (comments[sub.id] || '').trim()
    if (!comment) return
    setBusyIds((p) => ({ ...p, [sub.id]: true }))
    try {
      await returnHomework(sub.id, comment)
      setComments((p) => ({ ...p, [sub.id]: '' }))
    } finally {
      setBusyIds((p) => ({ ...p, [sub.id]: false }))
    }
  }

  return (
    <div>
      <div className="eyebrow">تقييم الواجبات</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>راجع تسليمات طلابك</h2>

      {submissions.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في تسليمات بعد.</p>
      ) : (
        <div className="analytics-list">
          {submissions.map((sub) => {
            const hw = myHomework.find((h) => h.id === sub.homeworkId)
            const graded = sub.status === 'graded'
            const busy = !!busyIds[sub.id]
            return (
              <div className="analytics-row" key={sub.id}>
                <div className="analytics-title">
                  {hw?.title}{' '}
                  <span className="tag" style={{ fontSize: '11px', marginRight: '6px' }}>{STATUS_LABELS[sub.status] || sub.status}</span>
                  {sub.attemptCount > 1 && <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}> — محاولة {sub.attemptCount}</span>}
                </div>
                {hw?.rubric && (
                  <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '2px 0', whiteSpace: 'pre-wrap' }}>
                    <i className="ti ti-list-check" /> {hw.rubric}
                  </p>
                )}
                <p style={{ fontSize: '13px', margin: '4px 0' }}>
                  <a href={sub.url} target="_blank" rel="noopener noreferrer">شوف الإجابة المسلّمة</a>
                </p>
                {graded ? (
                  <span className="tag tag-pine">تم التقييم</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number" min="0" placeholder="الدرجة"
                        style={{ width: '80px' }}
                        value={scores[sub.id] || ''}
                        onChange={(e) => setScores((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <span>/</span>
                      <input
                        type="number" min="1" placeholder="من كم"
                        style={{ width: '80px' }}
                        value={maxScores[sub.id] || ''}
                        onChange={(e) => setMaxScores((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <button className="btn btn-accent" disabled={busy} onClick={() => handleGrade(sub, hw)}>حفظ الدرجة</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text" placeholder="ملاحظة لإرجاع الواجب للطالب لإعادة التسليم..."
                        style={{ minWidth: '220px', flex: 1 }}
                        value={comments[sub.id] || ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <button className="btn" disabled={busy || !(comments[sub.id] || '').trim()} onClick={() => handleReturn(sub)}>
                        <i className="ti ti-arrow-back-up" /> إرجاع لإعادة التسليم
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}