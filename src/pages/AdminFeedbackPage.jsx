import { useState } from 'react'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useFeedback } from '../context/FeedbackContext'
import {
  KIND_LABELS, KIND_ICONS, CATEGORY_LABELS, STATUS_LABELS, STATUS_COLORS,
} from '../utils/feedbackLabels'

function StatusBadge({ status }) {
  return <span className="tag" style={{ background: STATUS_COLORS[status], color: '#fff' }}>{STATUS_LABELS[status] || status}</span>
}

const STATUS_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'جديدة' },
  { key: 'in_progress', label: 'قيد المتابعة' },
  { key: 'resolved', label: 'تم حلها' },
  { key: 'unassigned', label: 'بدون مسؤول' },
]

function CaseDetails({ feedbackCase, admins }) {
  const { session } = useSession()
  const { replies, addReply, changeStatus, assignAdmin } = useFeedback()
  const [draft, setDraft] = useState('')
  const [internalDraft, setInternalDraft] = useState('')
  const [sending, setSending] = useState(false)

  const isOpen = feedbackCase.status === 'open' || feedbackCase.status === 'in_progress'

  async function handleReply(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try { await addReply(feedbackCase.id, draft, 'participants'); setDraft('') } finally { setSending(false) }
  }

  async function handleInternalNote(e) {
    e.preventDefault()
    if (!internalDraft.trim()) return
    setSending(true)
    try { await addReply(feedbackCase.id, internalDraft, 'admin_internal'); setInternalDraft('') } finally { setSending(false) }
  }

  return (
    <div className="messages-chat panel">
      <div className="messages-chat-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{feedbackCase.title}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
            {KIND_LABELS[feedbackCase.kind]} · {CATEGORY_LABELS[feedbackCase.category]} · {feedbackCase.createdByNameSnapshot}
            {feedbackCase.escalatedToAdmin && <> · <i className="ti ti-corner-up-right" /> مصعّدة</>}
          </div>
        </div>
        <StatusBadge status={feedbackCase.status} />
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 0', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>المسؤول عن المتابعة:</label>
        <select
          value={feedbackCase.assignedAdminUid || ''}
          onChange={(e) => assignAdmin(feedbackCase.id, e.target.value || null)}
          style={{ maxWidth: '200px' }}
        >
          <option value="">بدون تعيين</option>
          {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="messages-thread">
        <div className="messages-bubble">
          <div className="messages-bubble-text">{feedbackCase.body}</div>
        </div>
        {replies.map((r) => (
          <div key={r.id} className={`messages-bubble${r.authorUid === session.uid ? ' mine' : ''}`}>
            {r.visibility === 'admin_internal' && <div style={{ fontSize: '11px', color: 'var(--sunset)', marginBottom: '2px' }}><i className="ti ti-lock" /> ملاحظة داخلية (لا تظهر لولي الأمر)</div>}
            <div className="messages-bubble-text">{r.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 0' }}>
        {isOpen ? (
          <>
            <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'in_progress')}><i className="ti ti-progress" /> قيد المتابعة</button>
            <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'resolved')}><i className="ti ti-check" /> تم الحل</button>
            <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'closed')}><i className="ti ti-x" /> إغلاق</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'open')}><i className="ti ti-refresh" /> إعادة فتح</button>
        )}
      </div>

      <form className="messages-input-row" onSubmit={handleReply}>
        <input type="text" placeholder="اكتب ردك لولي الأمر..." value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} />
        <button type="submit" className="btn btn-primary" aria-label="إرسال الرد" disabled={!draft.trim() || sending}><i className="ti ti-send" /></button>
      </form>
      <form className="messages-input-row" onSubmit={handleInternalNote} style={{ marginTop: '6px' }}>
        <input type="text" placeholder="ملاحظة داخلية (للإدارة فقط)..." value={internalDraft} onChange={(e) => setInternalDraft(e.target.value)} maxLength={4000} />
        <button type="submit" className="btn" aria-label="إضافة ملاحظة داخلية" disabled={!internalDraft.trim() || sending}><i className="ti ti-lock" /></button>
      </form>
    </div>
  )
}

export default function AdminFeedbackPage() {
  const { allUsers } = useSchoolStructure()
  const { adminCases, activeCaseId, openCase } = useFeedback()
  const [statusFilter, setStatusFilter] = useState('all')

  const admins = allUsers.filter((u) => u.role === 'admin')

  const filtered = adminCases.filter((c) => {
    if (statusFilter === 'unassigned') return !c.assignedAdminUid && (c.status === 'open' || c.status === 'in_progress')
    if (statusFilter === 'all') return true
    return c.status === statusFilter
  })

  const activeCase = adminCases.find((c) => c.id === activeCaseId)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">صندوق الإدارة</div>
          <h2 className="page-title">الملاحظات والمتابعة</h2>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key} type="button"
            className={`nav-pill${statusFilter === f.key ? ' active' : ''}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="messages-layout">
        <div className="messages-contacts panel">
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', padding: '8px' }}>لا يوجد شيء هون حاليًا.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id} type="button"
                className={`messages-contact-item${c.id === activeCaseId ? ' active' : ''}`}
                onClick={() => openCase(c.id)}
              >
                <i className={`ti ${KIND_ICONS[c.kind] || 'ti-message'}`} />
                <div className="messages-contact-info">
                  <div className="messages-contact-name">{c.title}</div>
                  <div className="messages-contact-preview">{c.createdByNameSnapshot} · {CATEGORY_LABELS[c.category]}</div>
                </div>
                <StatusBadge status={c.status} />
              </button>
            ))
          )}
        </div>

        {activeCase ? <CaseDetails feedbackCase={activeCase} admins={admins} /> : (
          <div className="messages-chat panel">
            <div className="messages-empty"><i className="ti ti-message-circle-2" /> اختر حالة من القائمة</div>
          </div>
        )}
      </div>
    </div>
  )
}
