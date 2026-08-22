import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
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
  const [importCreatedCount, setImportCreatedCount] = useState(0)
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
  const [credentialsHidden, setCredentialsHidden] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  useEffect(() => {
    if (session?.role !== 'admin') return
    const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId))
    const unsub = onSnapshot(q, (snap) => {
      setInstructors(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'instructor'))
    })
    return () => unsub()
  }, [session])

  if (session?.role !== 'admin') return <Navigate to="/app/dashboard" replace />

  async function handleAddGrade(e) {
    e.preventDefault()
    if (!gradeName.trim()) return
    await addGrade(gradeName.trim())
    setGradeName('')
  }
function exportResultsToExcel() {
    if (!importResults) return

    const rows = importResults
      .filter((r) => r.status === 'ok' || r.status === 'linked')
      .map((r) => ({
        'الاسم': r.name,
        'الحساب': r.role === 'parent' ? 'ولي أمر' : 'طالب',
        'البريد الإلكتروني': r.status === 'linked' ? '(حساب موجود مسبقاً)' : r.email,
        'ملاحظة': r.status === 'linked' ? r.note : '',
      }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 34 }, { wch: 40 }]

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
    setCredentialsHidden(false)

    try {
      const rows = await parseStudentsExcel(importFile)

      // نسخة قابلة للتعديل محليًا حتى ما نعيد إنشاء نفس الصف/الشعبة لصفين متتاليين بنفس الملف —
      // context.sections ما بينحدّث فورًا (onSnapshot غير متزامن)، فما نقدر نعتمد عليه هون
      const gradesDraft = grades.map((g) => ({ ...g }))
      const sectionsDraft = getSectionsForGrade ? grades.flatMap((g) => getSectionsForGrade(g.id).map((s) => ({ ...s }))) : []
      let createdCount = 0

      async function resolveSectionId(gradeName, sectionName) {
        let grade = gradesDraft.find((g) => g.name === gradeName)
        if (!grade) {
          const gradeId = await addGrade(gradeName)
          grade = { id: gradeId, name: gradeName }
          gradesDraft.push(grade)
          createdCount++
        }
        const existingSection = sectionsDraft.find((s) => s.gradeId === grade.id && s.name === sectionName)
        if (existingSection) return existingSection.id
        const sectionId = await addSection(grade.id, sectionName)
        sectionsDraft.push({ id: sectionId, gradeId: grade.id, name: sectionName })
        createdCount++
        return sectionId
      }

      const matched = []
      for (const row of rows) {
        const sectionId = await resolveSectionId(row.gradeName, row.sectionName)
        matched.push({ name: row.name, sectionId, parentPhone: row.parentPhone, parentName: row.parentName })
      }
      setImportCreatedCount(createdCount)

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

  function hideImportedCredentials() {
    setImportResults((rows) => rows?.map((row) => ({ ...row, password: null })))
    setCredentialsHidden(true)
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
          <strong>كيف تجهّز ملف Excel؟</strong> سوي جدول بهاي الأعمدة، وسمّي الملف واحفظه كـ .xlsx:
          <table style={{ width: '100%', marginTop: '8px', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الاسم</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الصف</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الشعبة</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>جوال ولي الأمر (اختياري)</th>
                <th style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>اسم ولي الأمر (اختياري)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>أحمد سالم</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الصف السابع</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>شعبة أ</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>0791234567</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>سالم أبو خالد</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>سارة سالم</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>الصف الخامس</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>شعبة ب</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>0791234567</td>
                <td style={{ border: '1px solid var(--line)', padding: '4px 8px' }}>سالم أبو خالد</td>
              </tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: '11.5px' }}>
            ✅ لو "الصف" أو "الشعبة" مش موجودين أصلاً، رح ننشئهم تلقائيًا وقت الاستيراد — ما تحتاج تضيفهم يدويًا قبل.
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11.5px' }}>
            👨‍👩‍👧‍👦 إذا كتبت نفس "جوال ولي الأمر" لأكثر من طالب (إخوان)، رح ينربطوا كلهم بحساب ولي أمر واحد بدل ما ينعمل حساب لكل وحد. لو تركت العمود فاضي، كل طالب بياخد حساب ولي أمر لحاله.
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
            نتيجة الاستيراد: {importResults.filter((r) => r.role === 'student' && r.status === 'ok').length} من {importResults.filter((r) => r.role === 'student').length} طالب نجحوا
            (حساب ولي أمر جديد لكل عيلة، أو ربط بحساب موجود لو الإخوان بنفس الجوال)
            {importCreatedCount > 0 && ` — أُنشئ ${importCreatedCount} صف/شعبة تلقائيًا`}
          </p>
          <div className="import-results-table">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button type="button" className="btn btn-accent" onClick={exportResultsToExcel}>
                <i className="ti ti-file-spreadsheet" /> تحميل تقرير آمن
              </button>
              {!credentialsHidden && importResults.some((r) => r.status === 'ok' && r.password) && (
                <button type="button" className="btn" onClick={hideImportedCredentials}>
                  <i className="ti ti-eye-off" /> أخفي بيانات الدخول
                </button>
              )}
            </div>
            {importResults.map((r, i) => (
              <div className="import-result-row" key={i}>
                <span>
                  <span className={`import-role-tag${r.role === 'parent' ? ' parent' : ''}`}>{r.role === 'parent' ? 'ولي أمر' : 'طالب'}</span>
                  {' '}{r.name}
                </span>
                {r.status === 'ok' ? (
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    {credentialsHidden ? `${r.email} / تم إخفاؤها` : `${r.email} / ${r.password}`}
                  </span>
                ) : r.status === 'linked' ? (
                  <span style={{ fontSize: '11px', color: 'var(--pine)' }}>
                    <i className="ti ti-link" /> {r.note}
                  </span>
                ) : r.status === 'duplicate' ? (
                  <span style={{ fontSize: '11px', color: 'var(--gold, #b8860b)' }}>
                    <i className="ti ti-copy" /> {r.note}
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--berry)' }}>فشل: {r.error}</span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '10px' }}>
            ⚠️ كلمات السر مؤقتة ويجب تغييرها عند أول دخول. التقرير الآمن لا يحتوي كلمات السر؛ أخفِ بيانات الدخول بعد تسليمها.
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
