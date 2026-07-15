import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { categoriesFor } from '../utils/gradeCategories'

export default function ParentDashboardPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getStudentProgress } = useProgress()
  const { getMarkValue } = useMarks()
  const { getStudentStats } = useQuizStats()

  const [children, setChildren] = useState([])

  useEffect(() => {
    if (!session?.childUids || session.childUids.length === 0) return
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setChildren(all.filter((u) => session.childUids.includes(u.id)))
    })
    return () => unsubscribe()
  }, [session])

  if (!session.childUids || session.childUids.length === 0) {
    return (
      <div>
        <div className="eyebrow">لوحة ولي الأمر</div>
        <h2 className="page-title">ما في أبناء مرتبطين بحسابك بعد</h2>
        <p style={{ color: 'var(--ink-soft)' }}>تواصل مع إدارة المدرسة لربط حسابك بأبنائك.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">لوحة ولي الأمر</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>متابعة أبنائك</h2>

      {children.map((child) => {
        const childSubjects = subjects.filter((s) => s.sectionId === child.sectionId)

        return (
          <div key={child.id} style={{ marginBottom: '28px' }}>
            <div className="eyebrow" style={{ marginBottom: '10px' }}>
              <i className="ti ti-user-circle" /> {child.name}
            </div>

            {childSubjects.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: '13.5px' }}>ابنك/ابنتك ما إلها مواد مضافة بعد.</p>
            ) : (
              <div className="analytics-list">
                {childSubjects.map((s) => {
                  const done = getStudentProgress(child.id, s.id)
                  const progressPct = Math.round((done / (s.lessons.length || 1)) * 100)

                 const categories = categoriesFor(s)
                  const { attempts, correct } = getStudentStats(child.id, s.id)

                  return (
                    <div className="analytics-row" key={s.id}>
                      <div className="analytics-title">{s.name}</div>

                      <div className="analytics-stat" style={{ marginBottom: '8px' }}>
                        <i className="ti ti-flag" />
                        <span>التقدم بالدروس: {progressPct}% ({done}/{s.lessons.length})</span>
                      </div>

                      {categories.map((cat) => {
                        const value = cat.id === 'quiz'
                          ? (attempts > 0 ? `${correct}/${attempts}` : null)
                          : getMarkValue(child.id, s.id, cat.id)
                        return (
                          <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                            <span>{cat.label}</span>
                            <span style={{ fontWeight: 600 }}>{value || 'لسا ما انحطت'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}