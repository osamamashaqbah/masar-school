function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// absences: [{date: 'YYYY-MM-DD', excused: boolean}, ...] الأحدث أول
export default function AttendanceReport({ absences }) {
  if (absences.length === 0) {
    return (
      <div className="attendance-report empty">
        <i className="ti ti-calendar-check" />
        <p>حضور كامل — ما في أي غياب مسجّل.</p>
      </div>
    )
  }

  const excusedCount = absences.filter((a) => a.excused).length
  const unexcusedCount = absences.length - excusedCount

  return (
    <div>
      <div className="attendance-summary">
        <div className="attendance-stat">
          <div className="attendance-stat-value">{absences.length}</div>
          <div className="attendance-stat-label">إجمالي أيام الغياب</div>
        </div>
        <div className="attendance-stat">
          <div className="attendance-stat-value excused">{excusedCount}</div>
          <div className="attendance-stat-label">بعذر</div>
        </div>
        <div className="attendance-stat">
          <div className="attendance-stat-value unexcused">{unexcusedCount}</div>
          <div className="attendance-stat-label">بدون عذر</div>
        </div>
      </div>
      <div className="attendance-table" style={{ maxWidth: '420px' }}>
        <div className="attendance-table-header">
          <span>التاريخ</span>
          <span>الحالة</span>
        </div>
        {absences.map((a, i) => (
          <div key={a.date} className="attendance-table-row animate-stagger" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
            <span>{parseLocalDate(a.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className={`attendance-status-tag${a.excused ? ' excused' : ' unexcused'}`}>
              {a.excused ? 'بعذر' : 'بدون عذر'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
