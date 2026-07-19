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
  const { setMarkValue, getMark } = useMarks()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const [subjectId, setSubjectId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [students, setStudents] = useState([])
  const [maxScore, setMaxScore] = useState('')
  const [scores, setScores] = useState({})
  const [saved, setSaved] = useState(false)
  const [weightsDraft, setWeightsDraft] = useState([])
  const [saveError, setSaveError] = useState('')
  const [studentsError, setStudentsError] = useState('')

  const subject = mySubjects.find((s) => s.id === subjectId)
  const categories = subject ? categoriesFor(subject) : []
  const manualCategories = categories.filter((c) => !c.auto)

  useEffect(() => {
    if (subject) setWeightsDraft(categories)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  useEffect(() => {
    if (!subject) return
    setStudentsError('')
    const q = query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', subject.sectionId))
    const unsub = onSnapshot(
      q,
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => setStudentsError(`ما قدرنا نجيب لستة الطلاب (${err.code}). جرب تسجّل خروج ودخول من جديد، وإذا استمرت المشكلة تواصل مع إدارة المدرسة.`)
    )
    return () => unsub()
  }, [subject])

  // لما يختار المعلّم مادة + فئة، نحمّل الدرجات الموجودة مسبقاً (إذا في)
  useEffect(() => {
    if (!subject || !categoryId || students.length === 0) { setScores({}); setMaxScore(''); return }
    const initial = {}
    let existingMax = ''
    students.forEach((st) => {
      const existing = getMark(st.id, subjectId, categoryId)
      if (existing) {
        initial[st.id] = String(existing.score)
        existingMax = String(existing.maxScore)
      }
    })
    setScores(initial)
    setMaxScore(existingMax)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, categoryId, students])

  async function handleSaveAll() {
    setSaveError('')

    if (!maxScore || Number(maxScore) <= 0) {
      setSaveError('لازم تحدد الدرجة الكلية للاختبار (من كم؟) قبل ما تحفظ.')
      return
    }

    const entries = Object.entries(scores).filter(([, v]) => v !== '' && v !== undefined)
    if (entries.length === 0) {
      setSaveError('لازم تدخل درجة طالب واحد على الأقل.')
      return
    }

    try {
      for (const [studentUid, value] of entries) {
        await setMarkValue(subjectId, studentUid, categoryId, value, maxScore)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      console.error('فشل حفظ الدرجات:', err)
      setSaveError(`صار خطأ وقت الحفظ: ${err.code || err.message}`)
    }
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
            <div className="field">
              <label htmlFor="grade-maxscore">الدرجة الكلية للاختبار (من كم؟)</label>
              <input
                id="grade-maxscore" type="number" min="1" placeholder="مثال: 50"
                style={{ width: '120px' }} value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
              />
            </div>

            <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
              اكتب درجة كل طالب من أصل {maxScore || '؟'}:
            </p>
            {studentsError && <p className="auth-error">{studentsError}</p>}
            {students.map((st) => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ flex: 1, fontSize: '13.5px' }}>{st.name}</span>
                <input
                  type="number" min="0" max={maxScore || undefined}
                  style={{ width: '90px' }}
                  value={scores[st.id] || ''}
                  onChange={(e) => setScores((prev) => ({ ...prev, [st.id]: e.target.value }))}
                />
                <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>/ {maxScore || '؟'}</span>
              </div>
            ))}
            <button className="btn btn-primary" onClick={handleSaveAll}><i className="ti ti-device-floppy" /> حفظ كل الدرجات</button>
            {saved && <span className="notes-saved" style={{ marginRight: '10px' }}><i className="ti ti-check" /> تم الحفظ</span>}
            {saveError && <p className="auth-error" style={{ marginTop: '10px' }}>{saveError}</p>}
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