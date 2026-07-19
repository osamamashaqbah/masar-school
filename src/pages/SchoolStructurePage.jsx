import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useBulkImport } from '../context/BulkImportContext'
import { parseStudentsExcel } from '../utils/parseStudentsExcel'
import * as XLSX from 'xlsx'


export default function SchoolStructurePage() {
  const { session } = useSession()
  const {
    grades, addGrade, addSection, addSubject, getSectionsForGrade, getSubjectsForSection,
    archivedSubjects, archiveSubject, restoreSubject,
  } = useSchoolStructure()
  const [confirmArchiveId, setConfirmArchiveId] = useState('')

  const [instructors, setInstructors] = useState([])
  const [gradeName, setGradeName] = useState('')
  const [sectionGradeId, setSectionGradeId] = useState('')
  const [sectionName, setSectionName] = useState('')
  const [subjectSectionId, setSubjectSectionId] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [subjectTeacherUid, setSubjectTeacherUid] = useState('')
const { importStudents } = useBulkImport()
  const [importFile, setImportFile] = useState(null)
  const [importError, setImportError] = useState('')
  const [importResults, setImportResults] = useState(null)
  const [importLoading, setImportLoading] = useState(false)

  useEffect(() => {
    if (session?.role !== 'owner') return
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setInstructors(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'instructor'))
    })
    return () => unsub()
  }, [session])

  if (session?.role !== 'owner') return <Navigate to="/app/dashboard" replace />

  async function handleAddGrade(e) {
    e.preventDefault()
    if (!gradeName.trim()) return
    await addGrade(gradeName.trim())
    setGradeName('')
  }
function exportResultsToExcel() {
    if (!importResults) return

    const rows = importResults
      .filter((r) => r.status === 'ok')
      .map((r) => ({
        'الاسم': r.name,
        'البريد الإلكتروني': r.email,
        'كلمة السر': r.password,
      }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 22 }, { wch: 34 }, { wch: 16 }]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'بيانات الدخول')

    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
    XLSX.writeFile(workbook, `بيانات-دخول-الطلاب-${dateStr}.xlsx`)
  }

  async function handleBulkImport(e) {
    e.preventDefault()
    setImportError('')
    if (!importFile) return

    setImportLoading(true)
    setImportResults(null)

    try {
      const rows = await parseStudentsExcel(importFile)

      const matched = []
      const unmatched = []

      rows.forEach((row) => {
        const grade = grades.find((g) => g.name === row.gradeName)
        const section = grade ? getSectionsForGrade(grade.id).find((s) => s.name === row.sectionName) : null

        if (section) {
          matched.push({ name: row.name, sectionId: section.id })
        } else {
          unmatched.push(row)
        }
      })

      if (unmatched.length > 0) {
        setImportError(
          `${unmatched.length} طالب ما انطابق صفهم/شعبتهم مع أي شعبة موجودة (تأكد الأسماء مطابقة تماماً): ${unmatched.map((u) => u.name).join('، ')}`
        )
      }

      if (matched.length > 0) {
        const results = await importStudents(matched)
        setImportResults(results)
      }
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportLoading(false)
      setImportFile(null)
    }
  }

  async function handleAddSection(e) {
    e.preventDefault()
    if (!sectionGradeId || !sectionName.trim()) return
    await addSection(sectionGradeId, sectionName.trim())
    setSectionName('')
  }

  async function handleAddSubject(e) {
    e.preventDefault()
    if (!subjectSectionId || !subjectName.trim()) return
    const teacher = instructors.find((i) => i.id === subjectTeacherUid)
    await addSubject({
      sectionId: subjectSectionId,
      name: subjectName.trim(),
      teacherUid: subjectTeacherUid || null,
      teacherName: teacher ? teacher.name : 'بدون معلم بعد',
    })
    setSubjectName('')
    setSubjectTeacherUid('')
  }

  async function handleArchiveSubject(subjectId) {
    await archiveSubject(subjectId)
    setConfirmArchiveId('')
  }

  return (
    <div>
      <div className="eyebrow">هيكل المدرسة</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>الصفوف، الشعب، والمواد</h2>

      <form className="panel" onSubmit={handleAddGrade} style={{ maxWidth: '460px' }}>
        <div className="field">
          <label htmlFor="grade-name">إضافة صف دراسي</label>
          <input id="grade-name" type="text" placeholder="مثال: الصف السابع" value={gradeName} onChange={(e) => setGradeName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary"><i className="ti ti-plus" /> إضافة صف</button>
      </form>

      <form className="panel" onSubmit={handleAddSection} style={{ maxWidth: '460px', marginTop: '16px' }}>
        <div className="field">
          <label htmlFor="section-grade">الصف</label>
          <select id="section-grade" value={sectionGradeId} onChange={(e) => setSectionGradeId(e.target.value)}>
            <option value="">-- اختار صف --</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="section-name">إضافة شعبة</label>
          <input id="section-name" type="text" placeholder="مثال: شعبة أ" value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary"><i className="ti ti-plus" /> إضافة شعبة</button>
      </form>

      <form className="panel" onSubmit={handleAddSubject} style={{ maxWidth: '460px', marginTop: '16px' }}>
        <div className="field">
          <label htmlFor="subject-section">الشعبة</label>
          <select id="subject-section" value={subjectSectionId} onChange={(e) => setSubjectSectionId(e.target.value)}>
            <option value="">-- اختار شعبة --</option>
            {grades.map((g) => getSectionsForGrade(g.id).map((s) => (
              <option key={s.id} value={s.id}>{g.name} — {s.name}</option>
            )))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="subject-name">اسم المادة</label>
          <input id="subject-name" type="text" placeholder="مثال: الرياضيات" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="subject-teacher">المعلم</label>
          <select id="subject-teacher" value={subjectTeacherUid} onChange={(e) => setSubjectTeacherUid(e.target.value)}>
            <option value="">-- بدون معلم بعد --</option>
            {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary"><i className="ti ti-plus" /> إضافة مادة</button>
      </form>
<div className="eyebrow" style={{ marginTop: '32px' }}>استيراد طلاب بالجملة</div>
      <h2 className="page-title" style={{ marginBottom: '16px', fontSize: '20px' }}>
        أضف كل طلاب الشعبة دفعة وحدة
      </h2>

      <div className="upload-help">
        <i className="ti ti-info-circle" />
        <div>
          <strong>كيف تجهّز ملف Excel؟</strong> سوي جدول بـ3 أعمدة بالضبط بهاي العناوين، وسمّي الملف واحفظه كـ .xlsx:
          <table style={{ width: '100%', marginTop: '8px', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الاسم</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الصف</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الشعبة</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>أحمد سالم</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الصف السابع</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>شعبة أ</td>
              </tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: '11.5px' }}>
            ⚠️ لازم "الصف" و"الشعبة" يطابقوا بالضبط الأسماء يلي أضفتها فوق بقسم "هيكل المدرسة".
          </p>
        </div>
      </div>

      <form className="panel" onSubmit={handleBulkImport} style={{ maxWidth: '520px' }}>
        <div className="field">
          <label htmlFor="import-file">ملف Excel (.xlsx)</label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files[0])}
          />
        </div>
        {importError && <p className="auth-error">{importError}</p>}
        <button type="submit" className="btn btn-primary" disabled={importLoading || !importFile}>
          {importLoading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-upload" /> استيراد الطلاب</>)}
        </button>
      </form>

      {importResults && (
        <div className="panel" style={{ maxWidth: '520px', marginTop: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
            نتيجة الاستيراد: {importResults.filter((r) => r.status === 'ok').length} من {importResults.length} نجحوا
          </p>
          <div className="import-results-table">
            <button type="button" className="btn btn-accent" onClick={exportResultsToExcel} style={{ marginBottom: '12px' }}>
            <i className="ti ti-file-spreadsheet" /> تحميل كملف Excel
          </button>
            {importResults.map((r, i) => (
              <div className="import-result-row" key={i}>
                <span>{r.name}</span>
                {r.status === 'ok' ? (
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    {r.email} / {r.password}
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--berry)' }}>فشل: {r.error}</span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '10px' }}>
            ⚠️ احفظ هاي القائمة بمكان آمن — كلمات السر ما رح تظهر مرة ثانية بعد ما تسكر الصفحة.
          </p>
        </div>
      )}
      <div className="eyebrow" style={{ marginTop: '32px' }}>نظرة عامة</div>
      <div className="school-overview-grid">
        {grades.map((g, gi) => {
          const gradeSections = getSectionsForGrade(g.id)
          const totalSubjects = gradeSections.reduce((sum, s) => sum + getSubjectsForSection(s.id).length, 0)

          return (
            <div className="school-grade-card animate-stagger" key={g.id} style={{ animationDelay: `${gi * 60}ms` }}>
              <div className="school-grade-head">
                <div className="school-grade-name">{g.name}</div>
                <span className="school-grade-count">{gradeSections.length} شعبة</span>
              </div>

              {gradeSections.length === 0 ? (
                <p className="school-empty-note">ما في شعب مضافة لهاد الصف بعد.</p>
              ) : (
                gradeSections.map((s) => {
                  const sectionSubjects = getSubjectsForSection(s.id)
                  return (
                    <div className="school-section-block" key={s.id}>
                      <div className="school-section-name"><i className="ti ti-users-group" /> {s.name}</div>
                      {sectionSubjects.length === 0 ? (
                        <p className="school-empty-note">ما في مواد بهاي الشعبة بعد.</p>
                      ) : (
                        <div className="subject-chip-wrap">
                          {sectionSubjects.map((sub) => (
                            <span key={sub.id} className={`subject-chip${sub.teacherUid ? '' : ' unassigned'}`}>
                              <i className={`ti ${sub.teacherUid ? 'ti-book-2' : 'ti-alert-triangle'}`} />
                              {sub.name} <span className="subject-chip-teacher">— {sub.teacherName}</span>
                              {confirmArchiveId === sub.id ? (
                                <span className="subject-chip-confirm">
                                  <button type="button" onClick={() => handleArchiveSubject(sub.id)} aria-label="تأكيد الحذف" title="تأكيد الحذف">
                                    <i className="ti ti-check" />
                                  </button>
                                  <button type="button" onClick={() => setConfirmArchiveId('')} aria-label="تراجع" title="تراجع">
                                    <i className="ti ti-x" />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="subject-chip-delete"
                                  onClick={() => setConfirmArchiveId(sub.id)}
                                  aria-label={`حذف مادة ${sub.name}`}
                                  title="حذف المادة"
                                >
                                  <i className="ti ti-trash" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              <div className="school-grade-footer">{totalSubjects} مادة إجمالًا</div>
            </div>
          )
        })}
      </div>

      {archivedSubjects.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: '32px' }}>مواد محذوفة (مؤرشفة)</div>
          <p style={{ fontSize: '12px', color: 'var(--ink-faint)', margin: '2px 0 14px' }}>
            هاي المواد مخفية عن الطلاب والمعلمين، بس درجاتهم وحضورهم فيها محفوظين. تقدر ترجّعها أي وقت.
          </p>
          <div className="subject-chip-wrap" style={{ maxWidth: '620px' }}>
            {archivedSubjects.map((sub) => (
              <span key={sub.id} className="subject-chip archived">
                <i className="ti ti-archive" />
                {sub.name} <span className="subject-chip-teacher">— {sub.teacherName}</span>
                <button type="button" className="subject-chip-restore" onClick={() => restoreSubject(sub.id)} aria-label={`استرجاع مادة ${sub.name}`} title="استرجاع">
                  <i className="ti ti-arrow-back-up" /> استرجاع
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}