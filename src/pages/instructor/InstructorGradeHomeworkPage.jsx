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
  const [scores, setScores] = useState({})

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
    return !!scores[`saved-${sub.id}`]
  }

  async function handleGrade(sub, hw) {
    const value = scores[sub.id]
    if (!value || !value.trim()) return
    await setMarkValue(hw.courseId, sub.studentUid, 'homework', value.trim())
    setScores((prev) => ({ ...prev, [`saved-${sub.id}`]: true }))
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
                      type="text" placeholder="مثال: 8/10"
                      style={{ width: '120px' }}
                      value={scores[sub.id] || ''}
                      onChange={(e) => setScores((prev) => ({ ...prev, [sub.id]: e.target.value }))}
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