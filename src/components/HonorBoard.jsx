// لوحة شرف عامة — تعرض ترتيب مسبق الحساب (من AdminInsightsPage) بدون أي حساب هون
export default function HonorBoard({ title, icon, entries, nameKey, subKey, idKey, meId }) {
  return (
    <div className="panel honor-board card-hover-lift">
      <div className="honor-board-head">
        <i className={`ti ${icon}`} />
        <span>{title}</span>
      </div>

      {!entries || entries.length === 0 ? (
        <p className="honor-board-empty">ما في نتائج محسوبة بعد.</p>
      ) : (
        <div className="honor-board-list">
          {entries.map((entry, i) => (
            <div key={entry[idKey]} className={`honor-board-row${entry[idKey] === meId ? ' me' : ''}`}>
              <span className="honor-board-rank">{i + 1}</span>
              <div className="honor-board-info">
                <div className="honor-board-name">{entry[nameKey]}</div>
                {subKey && entry[subKey] && <div className="honor-board-sub">{entry[subKey]}</div>}
              </div>
              <span className="honor-board-avg">{Math.round(entry.average)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
