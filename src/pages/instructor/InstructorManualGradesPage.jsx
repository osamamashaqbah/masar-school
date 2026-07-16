import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useMarks } from '../../context/MarksContext'
import { categoriesFor } from '../../utils/gradeCategories'

export default function InstructorManualGradesPage() {
  const { session } = useSession()
  const { subjects, updateSubjectCategories } = useSchoolStructure()
  const { setMarkValue } = useMarks()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const [subjectId, setSubjectId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [saved, setSaved] = useState(false)
  const [weightsDraft, setWeightsDraft] = useState([])

  const subject = mySubjects.find((s) => s.id === subjectId)
  const categories = subject ? categoriesFor(subject) : []
  const manualCategories = categories.filter((c) => !c.auto)

  useEffect(() => {
    if (subject) setWeightsDraft(categories)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  useEffect(() => {
    if (!subject) return
    const q = query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', subject.sectionId))
    const unsub = onSnapshot(q, (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [subject])

  async function handleSaveAll() {
    const entries = Object.entries(scores).filter(([, v]) => v !== '' && v !== undefined)
    for (const [studentUid, value] of entries) {
      await setMarkValue(subjectId, studentUid, categoryId, value)
    }
    setScores({})
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function updateWeight(catId, value) {
    setWeightsDraft((prev) => prev.map((c) => (c.id === catId ? { ...c, weight: Number(value) } : c)))
  }

  async function handleSaveWeights() {
    await updateSubjectCategories(subjectId, weightsDraft)
  }

  const totalWeight = weightsDraft.reduce((sum, c) => sum + c.weight, 0)

  return (
    <div>
      <div className="eyebrow">الدرجات اليدوية</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>ارفع درجات اختبار أو مشاركة</h2>

      <div className="panel" style={{ maxWidth: '620px' }}>
        <div className="field">
          <label htmlFor="grade-subject">المادة</label>
          <select id="grade-subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setCategoryId('') }}>
            <option value="">-- اختار مادة --</option>
            {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {subject && (
          <div className="field">
            <label htmlFor="grade-category">نوع الدرجة</label>
            <select id="grade-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">-- اختار --</option>
              {manualCategories.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.weight}%)</option>)}
            </select>
          </div>
        )}

        {subject && categoryId && (
          <>
           <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
              اكتب الدرجة لكل طالب بالشكل يلي بدك ياه (مثال: 18/20 أو ممتاز):
            </p>
            {students.map((st) => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ flex: 1, fontSize: '13.5px' }}>{st.name}</span>
                <input
                  type="text"
                  style={{ width: '110px' }}
                  value={scores[st.id] || ''}
                  onChange={(e) => setScores((prev) => ({ ...prev, [st.id]: e.target.value }))}
                />
              </div>
            ))}
            <button className="btn btn-primary" onClick={handleSaveAll}><i className="ti ti-device-floppy" /> حفظ كل الدرجات</button>
            {saved && <span className="notes-saved" style={{ marginRight: '10px' }}><i className="ti ti-check" /> تم الحفظ</span>}
          </>
        )}
      </div>

      {subject && (
        <>
          <div className="eyebrow" style={{ marginTop: '28px' }}>نسب فئات الدرجات لهذي المادة</div>
          <div className="panel" style={{ maxWidth: '520px' }}>
            {weightsDraft.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ flex: 1, fontSize: '13px' }}>{c.label}{c.auto && <span style={{ color: 'var(--ink-faint)', fontSize: '11px' }}> (تلقائي)</span>}</span>
                <input type="number" min="0" max="100" style={{ width: '80px' }} value={c.weight} onChange={(e) => updateWeight(c.id, e.target.value)} />
                <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>%</span>
              </div>
            ))}
            <p style={{ fontSize: '12px', color: totalWeight === 100 ? 'var(--pine)' : 'var(--berry)', margin: '8px 0' }}>
              المجموع: {totalWeight}% {totalWeight !== 100 && '(لازم يكون المجموع 100%)'}
            </p>
            <button className="btn" onClick={handleSaveWeights}><i className="ti ti-device-floppy" /> حفظ النسب</button>
          </div>
        </>
      )}
    </div>
  )
}