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

  return (
    <div className="attendance-table" style={{ maxWidth: '420px' }}>
      <div className="attendance-table-header">
        <span>التاريخ</span>
        <span>الحالة</span>
      </div>
      {absences.map((a) => (
        <div key={a.date} className="attendance-table-row">
          <span>{parseLocalDate(a.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span className={`attendance-status-tag${a.excused ? ' excused' : ' unexcused'}`}>
            {a.excused ? 'بعذر' : 'بدون عذر'}
          </span>
        </div>
      ))}
    </div>
  )
}
