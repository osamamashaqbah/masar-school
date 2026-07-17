import { useEffect, useState } from 'react'
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useProgress } from '../context/ProgressContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { categoriesFor } from '../utils/gradeCategories'

export default function ParentDashboardPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getStudentProgress } = useProgress()
  const { getMarkValue } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { getAbsenceDatesFor } = useAttendance()

  const [children, setChildren] = useState([])

  useEffect(() => {
    if (!session?.childUids || session.childUids.length === 0) return
    const q = query(collection(db, 'users'), where(documentId(), 'in', session.childUids.slice(0, 10)))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChildren(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
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
        const absenceDates = getAbsenceDatesFor(child.id)

        return (
          <div key={child.id} style={{ marginBottom: '28px' }}>
            <div className="eyebrow" style={{ marginBottom: '10px' }}>
              <i className="ti ti-user-circle" /> {child.name}
            </div>

            <div className="panel" style={{ maxWidth: '620px', marginBottom: '16px' }}>
              <div className="analytics-title" style={{ marginBottom: '8px' }}>الحضور والغياب</div>
              {absenceDates.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>ما في غياب مسجّل.</p>
              ) : (
                <>
                  <p style={{ fontSize: '13px', marginBottom: '6px' }}>عدد أيام الغياب: <strong>{absenceDates.length}</strong></p>
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>{absenceDates.join('، ')}</p>
                </>
              )}
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
                  const total = categories
                    .filter((cat) => cat.id !== 'quiz')
                    .reduce((sum, cat) => {
                      const raw = getMarkValue(child.id, s.id, cat.id)
                      const num = Number(raw)
                      return raw && !Number.isNaN(num) ? sum + num : sum
                    }, 0)

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
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0 0', fontWeight: 700 }}>
                        <span>المجموع</span>
                        <span>{total}/100</span>
                      </div>
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