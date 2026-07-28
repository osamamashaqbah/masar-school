import { useState, useEffect } from 'react'
import { useSession } from '../context/SessionContext'
import { useAnnouncements } from '../context/AnnouncementsContext'

export default function AnnouncementsPage() {
  const { session } = useSession()
  const { announcements, postAnnouncement, markRead } = useAnnouncements()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    announcements.forEach((a) => {
      if (!(a.readBy || []).includes(session.uid)) markRead(a.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements])

  async function handlePost(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setPosting(true)
    try {
      await postAnnouncement(title, body)
      setTitle('')
      setBody('')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div>
      <div className="eyebrow">إعلانات المدرسة</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>كل الإعلانات</h2>

      {session.role === 'admin' && (
        <form className="panel card-hover-lift" style={{ maxWidth: '520px', marginBottom: '24px' }} onSubmit={handlePost}>
          <div className="field">
            <label htmlFor="ann-title">العنوان</label>
            <input id="ann-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="ann-body">النص</label>
            <textarea id="ann-body" className="notes-textarea" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={posting}>
            {posting ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-speakerphone" /> نشر الإعلان</>}
          </button>
        </form>
      )}

      {announcements.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في إعلانات بعد.</p>
      ) : (
        <div className="analytics-list">
          {announcements.map((a) => (
            <div className="analytics-row" key={a.id}>
              <div className="analytics-title">{a.title}</div>
              <p style={{ fontSize: '13.5px', margin: '6px 0', whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                {a.authorName} · {a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString('ar-EG') : ''}
                {session.role === 'admin' && ` · شافها ${(a.readBy || []).length} شخص`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
