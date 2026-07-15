import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useHomework } from '../../context/HomeworkContext'

export default function InstructorHomeworkPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { addHomework } = useHomework()

  const myCourses = subjects.filter((c) => c.teacherUid === session.uid)

  const [hwCourseId, setHwCourseId] = useState('')
  const [hwTitle, setHwTitle] = useState('')
  const [hwDescription, setHwDescription] = useState('')
  const [hwMaterialUrl, setHwMaterialUrl] = useState('')
  const [hwDeadline, setHwDeadline] = useState('')
  const [hwError, setHwError] = useState('')
  const [hwSaved, setHwSaved] = useState(false)

  async function handleAddHomework(e) {
    e.preventDefault()
    setHwError('')

    if (!hwCourseId) {
      setHwError('لازم تختار مادة أول.')
      return
    }
    if (!hwTitle.trim()) {
      setHwError('لازم تكتب عنوان للواجب.')
      return
    }
    if (!hwDeadline) {
      setHwError('لازم تحدد موعد نهائي للتسليم.')
      return
    }

    try {
      await addHomework({
        courseId: hwCourseId,
        title: hwTitle.trim(),
        description: hwDescription.trim(),
        materialUrl: hwMaterialUrl.trim(),
        deadline: hwDeadline,
      })

      setHwTitle('')
      setHwDescription('')
      setHwMaterialUrl('')
      setHwDeadline('')
      setHwSaved(true)
      setTimeout(() => setHwSaved(false), 1800)
    } catch (err) {
      setHwError('صار خطأ أثناء الحفظ: ' + err.message)
    }
  }

  return (
    <div>
      <div className="eyebrow">الواجبات</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>
        أضف واجب جديد بموعد تسليم
      </h2>

      {myCourses.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد.</p>
      ) : (
        <form className="panel" onSubmit={handleAddHomework} style={{ maxWidth: '620px' }}>
          <div className="field">
            <label htmlFor="hw-course">المادة</label>
            <select id="hw-course" value={hwCourseId} onChange={(e) => setHwCourseId(e.target.value)}>
              <option value="">-- اختار مادة --</option>
              {myCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="hw-title">عنوان الواجب</label>
            <input id="hw-title" type="text" placeholder="مثال: تطبيق عملي" value={hwTitle} onChange={(e) => setHwTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="hw-desc">وصف المطلوب</label>
            <textarea id="hw-desc" rows="3" placeholder="اشرح المطلوب من الطالب بالتفصيل..." value={hwDescription} onChange={(e) => setHwDescription(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="hw-material">رابط ملف مرفق (اختياري)</label>
            <input id="hw-material" type="text" placeholder="رابط Google Drive لملف يشرح الواجب" value={hwMaterialUrl} onChange={(e) => setHwMaterialUrl(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="hw-deadline">الموعد النهائي للتسليم</label>
            <input id="hw-deadline" type="datetime-local" value={hwDeadline} onChange={(e) => setHwDeadline(e.target.value)} />
          </div>

          {hwError && <p className="auth-error">{hwError}</p>}

          <button type="submit" className="btn btn-primary">
            <i className="ti ti-clipboard-plus" /> إضافة الواجب
          </button>
          {hwSaved && (
            <span className="notes-saved" style={{ marginRight: '10px' }}>
              <i className="ti ti-check" /> تمت الإضافة
            </span>
          )}
        </form>
      )}
    </div>
  )
}