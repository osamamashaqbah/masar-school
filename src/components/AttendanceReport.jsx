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
    <div className="attendance-report">
      <div className="attendance-stats-row">
        <div className="attendance-stat-tile excused">
          <i className="ti ti-shield-check" />
          <div className="attendance-stat-value">{excusedCount}</div>
          <div className="attendance-stat-label">غياب بعذر</div>
        </div>
        <div className="attendance-stat-tile unexcused">
          <i className="ti ti-alert-triangle" />
          <div className="attendance-stat-value">{unexcusedCount}</div>
          <div className="attendance-stat-label">غياب بدون عذر</div>
        </div>
      </div>

      <div className="attendance-timeline">
        {absences.map((a) => {
          const d = parseLocalDate(a.date)
          const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' })
          const monthName = d.toLocaleDateString('ar-EG', { month: 'short' })
          return (
            <div key={a.date} className={`attendance-day-card${a.excused ? ' excused' : ' unexcused'}`}>
              <i className={`ti ${a.excused ? 'ti-shield-check' : 'ti-x'} attendance-day-icon`} />
              <div className="attendance-day-name">{dayName}</div>
              <div className="attendance-day-num">{d.getDate()}</div>
              <div className="attendance-day-month">{monthName}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
