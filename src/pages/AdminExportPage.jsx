import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'
import { useAttendance } from '../context/AttendanceContext'
import { logAudit } from '../utils/audit'

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'admin') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}

export default function AdminExportPage() {
  const { session } = useSession()
  const { grades, sections, subjects, allUsers } = useSchoolStructure()
  const { allMarks } = useMarks()
  const { schoolAbsences } = useAttendance()
  const [exporting, setExporting] = useState(false)

  function handleExport() {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()
      const sectionName = (id) => sections.find((s) => s.id === id)?.name || ''
      const gradeName = (id) => grades.find((g) => g.id === id)?.name || ''
      const userName = (uid) => allUsers.find((u) => u.id === uid)?.name || uid
      const subjectName = (id) => subjects.find((s) => s.id === id)?.name || id

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        allUsers.map((u) => ({
          الاسم: u.name, الدور: roleLabel(u.role), البريد: u.email,
          الصف: u.sectionId ? gradeName(sections.find((s) => s.id === u.sectionId)?.gradeId) : '',
          الشعبة: u.sectionId ? sectionName(u.sectionId) : '',
        }))
      ), 'المستخدمون')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        subjects.map((s) => ({ المادة: s.name, الصف: gradeName(s.gradeId), الشعبة: sectionName(s.sectionId), المعلّم: s.teacherName || '' }))
      ), 'المواد')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        allMarks.map((m) => ({
          الطالب: userName(m.studentUid), المادة: subjectName(m.subjectId), البند: m.categoryId,
          الدرجة: m.score, من: m.maxScore, السنة: m.academicYear || '',
        }))
      ), 'العلامات')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        schoolAbsences.map((a) => ({ الطالب: userName(a.studentUid), التاريخ: a.date, العذر: a.excused ? 'بعذر' : 'بدون عذر', السنة: a.academicYear || '' }))
      ), 'الحضور والغياب')

      XLSX.writeFile(wb, `مسار-تصدير-${session.schoolId}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      logAudit(session.schoolId, session.uid, session.name, 'export_school_data', 'school', session.schoolId)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="eyebrow">تصدير بيانات المدرسة</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>نسخة كاملة من بيانات مدرستك</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: '13px', maxWidth: '520px', marginBottom: '18px' }}>
        بيصدّر ملف Excel واحد فيه كل المستخدمين، المواد، العلامات، والحضور — نسخة احتياطية تقدر تحتفظ فيها،
        أو تستخدمها لأي طلب وصول لبياناتك حسب قانون حماية البيانات الشخصية.
      </p>
      <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ width: 'auto', padding: '11px 22px' }}>
        {exporting ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-download" /> تصدير الآن</>}
      </button>
    </div>
  )
}
