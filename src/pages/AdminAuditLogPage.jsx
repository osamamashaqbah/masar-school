import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'

const ACTION_LABELS = {
  set_mark: 'تعديل علامة',
  create_user: 'إنشاء حساب',
  archive_subject: 'أرشفة مادة',
  restore_subject: 'استرجاع مادة',
}

export default function AdminAuditLogPage() {
  const { session } = useSession()
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'auditLog'), where('schoolId', '==', session.schoolId))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setEntries(list.slice(0, 200))
    })
    return () => unsub()
  }, [session])

  return (
    <div>
      <div className="eyebrow">سجل التدقيق</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>مين سوى شو ومتى</h2>

      {entries.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في أي عملية مسجّلة بعد.</p>
      ) : (
        <div className="gradebook-table">
          <div className="gradebook-header"><span>العملية</span><span>الفاعل</span><span>الوقت</span></div>
          {entries.map((e) => (
            <div className="gradebook-row" key={e.id}>
              <span className="gradebook-student">
                <i className="ti ti-history" /> {ACTION_LABELS[e.action] || e.action}
                {e.details ? ` — ${e.details}` : ''}
              </span>
              <span>{e.actorName}</span>
              <span>{e.createdAt?.toDate ? e.createdAt.toDate().toLocaleString('ar-EG') : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
