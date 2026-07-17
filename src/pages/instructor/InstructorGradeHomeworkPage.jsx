import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useHomework } from '../../context/HomeworkContext'
import { useMarks } from '../../context/MarksContext'

export default function InstructorGradeHomeworkPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { homework } = useHomework()
  const { setMarkValue } = useMarks()

  const [submissions, setSubmissions] = useState([])
  const [scores, setScores] = useState({})       // sub.id -> الدرجة
  const [maxScores, setMaxScores] = useState({}) // sub.id -> من كم
  const [gradedIds, setGradedIds] = useState({})

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

  function alreadyGraded(sub) {
    return !!gradedIds[sub.id]
  }

  async function handleGrade(sub, hw) {
    const score = scores[sub.id]
    const max = maxScores[sub.id]
    if (!score || !max) return
    await setMarkValue(hw.courseId, sub.studentUid, 'homework', score, max, hw.id)
    setGradedIds((prev) => ({ ...prev, [sub.id]: true }))
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
            const graded = alreadyGraded(sub)
            return (
              <div className="analytics-row" key={sub.id}>
                <div className="analytics-title">{hw?.title}</div>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>
                  <a href={sub.url} target="_blank" rel="noopener noreferrer">شوف الإجابة المسلّمة</a>
                </p>
                {graded ? (
                  <span className="tag tag-pine">تم التقييم</span>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    <button className="btn btn-accent" onClick={() => handleGrade(sub, hw)}>حفظ الدرجة</button>
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