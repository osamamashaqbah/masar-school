import { useNavigate } from 'react-router-dom'

export default function TaskCenter({
  title = 'مركز المهام',
  subtitle = 'أهم ما يحتاج انتباهك الآن',
  tasks = [],
  actions = [],
  emptyText = 'أمورك مرتبة حاليًا. لا توجد مهام عاجلة.',
}) {
  const navigate = useNavigate()

  function open(to) {
    if (to) navigate(to)
  }

  return (
    <section className="task-center" aria-labelledby="task-center-title">
      <div className="task-center-head">
        <div>
          <div className="eyebrow">أولوياتك</div>
          <h3 id="task-center-title" className="task-center-title"><i className="ti ti-list-check" /> {title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="task-center-count" aria-label={`${tasks.length} مهمة`}>{tasks.length}</span>
      </div>

      <div className="task-center-body">
        <div className="task-list">
          {tasks.length === 0 ? (
            <div className="task-empty"><i className="ti ti-circle-check" /> {emptyText}</div>
          ) : tasks.slice(0, 5).map((task) => (
            <button key={task.id} type="button" className={`task-row${task.tone ? ` ${task.tone}` : ''}`} onClick={() => open(task.to)}>
              <span className="task-row-icon"><i className={`ti ${task.icon || 'ti-circle-dot'}`} /></span>
              <span className="task-row-copy">
                <strong>{task.title}</strong>
                {task.meta && <small>{task.meta}</small>}
              </span>
              {task.badge && <span className="task-row-badge">{task.badge}</span>}
              {task.to && <i className="ti ti-chevron-left task-row-arrow" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {actions.length > 0 && (
          <div className="task-actions" aria-label="إجراءات سريعة">
            {actions.map((action) => (
              <button key={action.label} type="button" className="task-action" onClick={() => open(action.to)}>
                <i className={`ti ${action.icon}`} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
