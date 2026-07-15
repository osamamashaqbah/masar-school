import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useNotes } from '../../context/NotesContext'

export default function InstructorNotesPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { getNote, saveNote } = useNotes()

  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)

  const [notesSubjectId, setNotesSubjectId] = useState('')
  const [draftNotes, setDraftNotes] = useState({})
  const [noteSavedFlash, setNoteSavedFlash] = useState(null)
  const notesSubject = mySubjects.find((s) => s.id === notesSubjectId)

  function selectSubjectForNotes(subjectId) {
    setNotesSubjectId(subjectId)
    setDraftNotes({})
    setNoteSavedFlash(null)
  }
  function getDraft(lessonIndex) {
    if (draftNotes[lessonIndex] !== undefined) return draftNotes[lessonIndex]
    return getNote(notesSubjectId, lessonIndex)
  }
  function handleSaveLessonNote(lessonIndex) {
    const text = getDraft(lessonIndex)
    saveNote(notesSubjectId, lessonIndex, text)
    setNoteSavedFlash(lessonIndex)
    setTimeout(() => setNoteSavedFlash(null), 1800)
  }

  return (
    <div>
      <div className="eyebrow">ملاحظات الدروس</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>
        وجّه طلابك بملاحظة على أي درس
      </h2>

      {mySubjects.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في مواد مسندة لك بعد.</p>
      ) : (
        <>
          <div className="field" style={{ maxWidth: '400px' }}>
            <label htmlFor="notes-subject">اختار المادة</label>
            <select id="notes-subject" value={notesSubjectId} onChange={(e) => selectSubjectForNotes(e.target.value)}>
              <option value="">-- اختار مادة --</option>
              {mySubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {notesSubject && (
            <div className="notes-editor-list">
              {notesSubject.lessons.map((lesson, i) => (
                <div className="notes-editor-row" key={i}>
                  <div className="notes-editor-title">{i + 1}. {lesson.title}</div>
                  <textarea
                    className="notes-textarea"
                    rows="2"
                    placeholder="اكتب ملاحظة تظهر للطلاب على هاد الدرس (اختياري)..."
                    value={getDraft(i)}
                    onChange={(e) => setDraftNotes((prev) => ({ ...prev, [i]: e.target.value }))}
                  />
                  <div className="notes-actions">
                    <button className="btn" onClick={() => handleSaveLessonNote(i)}>
                      <i className="ti ti-device-floppy" /> حفظ الملاحظة
                    </button>
                    {noteSavedFlash === i && (
                      <span className="notes-saved"><i className="ti ti-check" /> تم الحفظ</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}