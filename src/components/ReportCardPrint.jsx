// كشف علامات رسمي للطباعة/الحفظ كـ PDF (عبر window.print) — مرئي بس وقت الطباعة، شوف index.css
import { computeAverageFromSubjectTotals } from '../utils/gradeCategories'

export default function ReportCardPrint({ schoolName, studentName, rows, absentDays, generatedAt, bilingual = false, branding = null }) {
  const grandScore = rows.reduce((sum, r) => sum + r.totalScore, 0)
  const grandMax = rows.reduce((sum, r) => sum + r.totalMax, 0)
  const overallAverage = computeAverageFromSubjectTotals(rows)
  const overallPct = overallAverage === null ? null : Math.round(overallAverage)
  const accentColor = branding?.primaryColor || null

  return (
    <div className="report-card-print" dir={bilingual ? 'auto' : 'rtl'} style={accentColor ? { '--report-accent': accentColor } : undefined}>
      <div className="report-card-header">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="" className="report-card-logo" />}
        <div className="report-card-school">{schoolName || 'المدرسة'}</div>
        <div className="report-card-title">{bilingual ? 'كشف علامات — Report Card' : 'كشف علامات'}</div>
      </div>

      <div className="report-card-meta">
        <span><strong>{bilingual ? 'الطالب / Student:' : 'الطالب:'}</strong> {studentName}</span>
        <span><strong>{bilingual ? 'التاريخ / Date:' : 'تاريخ الإصدار:'}</strong> {generatedAt}</span>
      </div>

      <table className="report-card-table">
        <thead>
          <tr>
            <th>{bilingual ? 'المادة / Subject' : 'المادة'}</th>
            <th>{bilingual ? 'الدرجة / Score' : 'الدرجة'}</th>
            <th>{bilingual ? 'من / Out of' : 'من'}</th>
            <th>{bilingual ? 'النسبة / %' : 'النسبة'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.totalScore}</td>
              <td>{r.totalMax}</td>
              <td>{r.totalMax > 0 ? `${Math.round((r.totalScore / r.totalMax) * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>{bilingual ? 'المجموع الكلي / Total' : 'المجموع الكلي'}</strong></td>
            <td><strong>{grandScore}</strong></td>
            <td><strong>{grandMax}</strong></td>
            <td><strong>{overallPct !== null ? `${overallPct}%` : '—'}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div className="report-card-meta">
        <span><strong>{bilingual ? 'أيام الغياب / Absences:' : 'أيام الغياب المسجلة:'}</strong> {absentDays}</span>
      </div>

      <div className="report-card-footer">
        <span>{bilingual ? 'توقيع الإدارة / Principal signature: __________________' : 'توقيع الإدارة: __________________'}</span>
        <span>{bilingual ? 'ختم المدرسة / School stamp' : 'ختم المدرسة'}</span>
      </div>
    </div>
  )
}
