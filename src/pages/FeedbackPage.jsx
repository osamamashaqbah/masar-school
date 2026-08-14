import { useState, useEffect } from 'react'
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useFeedback } from '../context/FeedbackContext'
import {
  KIND_LABELS, KIND_ICONS, CATEGORY_LABELS, STATUS_LABELS, STATUS_COLORS, IMPORTANCE_LABELS, QUICK_TEMPLATES,
} from '../utils/feedbackLabels'
import { chunkArray } from '../utils/chunk'

function StatusBadge({ status }) {
  return <span className="tag" style={{ background: STATUS_COLORS[status], color: '#fff' }}>{STATUS_LABELS[status] || status}</span>
}

function ComposerParent({ onDone }) {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { createCase } = useFeedback()
  const [children, setChildren] = useState([])
  const [childUid, setChildUid] = useState('general')
  const [target, setTarget] = useState('admin') // admin | teacher
  const [subjectId, setSubjectId] = useState('')
  const [kind, setKind] = useState('observation')
  const [category, setCategory] = useState('academic')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [requiresResponse, setRequiresResponse] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.childUids?.length) { setChildren([]); return }
    const chunks = chunkArray(session.childUids)
    const childrenByChunk = chunks.map(() => [])
    const unsubs = chunks.map((chunk, index) => {
      const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where(documentId(), 'in', chunk))
      return onSnapshot(q, (snap) => {
        childrenByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setChildren(childrenByChunk.flat())
      })
    })
    return () => unsubs.forEach((unsub) => unsub())
  }, [session.childUids, session.schoolId])

  const child = children.find((c) => c.id === childUid)
  const childSubjects = child ? subjects.filter((s) => s.sectionId === child.sectionId && s.teacherUid) : []
  const isTeacherTarget = childUid !== 'general' && target === 'teacher'
  const isComplaintToTeacher = isTeacherTarget && kind === 'complaint'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setError('')
    try {
      if (isComplaintToTeacher) {
        // شكوى على معلّم تروح للإدارة دايمًا، مو للمعلّم مباشرة
        await createCase({
          route: 'parent_to_admin', recipientRole: 'admin', recipientUid: null,
          studentUid: childUid === 'general' ? null : childUid, subjectId: null,
          kind, category, title, body, requiresResponse,
        })
      } else if (isTeacherTarget) {
        const subject = childSubjects.find((s) => s.id === subjectId)
        if (!subject) { setError('اختر مادة'); setSending(false); return }
        await createCase({
          route: 'parent_to_teacher', recipientRole: 'instructor', recipientUid: subject.teacherUid,
          studentUid: childUid, subjectId: subject.id,
          kind, category, title, body, requiresResponse,
        })
      } else {
        await createCase({
          route: 'parent_to_admin', recipientRole: 'admin', recipientUid: null,
          studentUid: childUid === 'general' ? null : childUid, subjectId: null,
          kind, category, title, body, requiresResponse,
        })
      }
      setTitle(''); setBody('')
      onDone()
    } catch (err) {
      setError(err.message || 'صار خطأ وقت الإرسال')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="panel" style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }} onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={childUid} onChange={(e) => { setChildUid(e.target.value); setSubjectId('') }} style={{ flex: 1, minWidth: '160px' }}>
          <option value="general">موضوع إداري عام</option>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {childUid !== 'general' && (
          <select value={target} onChange={(e) => { setTarget(e.target.value); setSubjectId('') }} style={{ flex: 1, minWidth: '140px' }}>
            <option value="admin">إلى الإدارة</option>
            <option value="teacher">إلى المعلّم</option>
          </select>
        )}
        {isTeacherTarget && (
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required style={{ flex: 1, minWidth: '160px' }}>
            <option value="">اختر المادة</option>
            {childSubjects.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.teacherName}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: 1, minWidth: '140px' }}>
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: '140px' }}>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {isComplaintToTeacher && (
        <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}><i className="ti ti-info-circle" /> الشكوى على معلّم توجّه تلقائيًا إلى إدارة المدرسة.</p>
      )}

      <input type="text" placeholder="عنوان مختصر" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      <textarea placeholder="التفاصيل" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} required />

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        <input type="checkbox" checked={requiresResponse} onChange={(e) => setRequiresResponse(e.target.checked)} /> تحتاج ردًا
      </label>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={sending} style={{ width: 'auto', alignSelf: 'flex-end' }}>
        {sending ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-send" /> إرسال</>}
      </button>
    </form>
  )
}

function ComposerInstructor({ onDone }) {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { createCase } = useFeedback()
  const mySubjects = subjects.filter((s) => s.teacherUid === session.uid)
  const [subjectId, setSubjectId] = useState('')
  const [students, setStudents] = useState([])
  const [studentUid, setStudentUid] = useState('')
  const [kind, setKind] = useState('observation')
  const [category, setCategory] = useState('academic')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [requiresResponse, setRequiresResponse] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const subject = mySubjects.find((s) => s.id === subjectId)

  useEffect(() => {
    if (!subject) { setStudents([]); setStudentUid(''); return }
    const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where('role', '==', 'student'), where('sectionId', '==', subject.sectionId))
    const unsub = onSnapshot(q, (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, session.schoolId])

  const student = students.find((s) => s.id === studentUid)
  const recipientUid = student?.parentUids?.[0] || null

  function applyTemplate(t) { setBody(t) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim() || !subject || !student) return
    if (!recipientUid) { setError('ما في ولي أمر مرتبط بهذا الطالب بعد'); return }
    setSending(true)
    setError('')
    try {
      await createCase({
        route: 'teacher_to_parent', recipientRole: 'parent', recipientUid,
        studentUid: student.id, subjectId: subject.id,
        kind, category, title, body, requiresResponse,
      })
      setTitle(''); setBody('')
      onDone()
    } catch (err) {
      setError(err.message || 'صار خطأ وقت الإرسال')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="panel" style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }} onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required style={{ flex: 1, minWidth: '160px' }}>
          <option value="">اختر المادة</option>
          {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={studentUid} onChange={(e) => setStudentUid(e.target.value)} required disabled={!subject} style={{ flex: 1, minWidth: '160px' }}>
          <option value="">اختر الطالب</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {student && !recipientUid && (
        <p style={{ fontSize: '12.5px', color: 'var(--sunset)' }}><i className="ti ti-alert-triangle" /> ما في ولي أمر مرتبط بهذا الطالب.</p>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: 1, minWidth: '140px' }}>
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: '140px' }}>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {QUICK_TEMPLATES.map((t) => (
          <button key={t} type="button" className="tag" style={{ cursor: 'pointer', border: 'none' }} onClick={() => applyTemplate(t)}>{t}</button>
        ))}
      </div>

      <input type="text" placeholder="عنوان مختصر" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      <textarea placeholder="التفاصيل" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} required />

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        <input type="checkbox" checked={requiresResponse} onChange={(e) => setRequiresResponse(e.target.checked)} /> تحتاج ردًا أو إجراءً
      </label>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={sending} style={{ width: 'auto', alignSelf: 'flex-end' }}>
        {sending ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-send" /> إرسال</>}
      </button>
    </form>
  )
}

function CaseDetails({ feedbackCase }) {
  const { session } = useSession()
  const { replies, addReply, escalateCase, changeStatus } = useFeedback()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const canEscalate = !feedbackCase.escalatedToAdmin && (feedbackCase.route === 'parent_to_teacher' || feedbackCase.route === 'teacher_to_parent')
  const isOpen = feedbackCase.status === 'open' || feedbackCase.status === 'in_progress'

  async function handleReply(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      await addReply(feedbackCase.id, draft)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="messages-chat panel">
      <div className="messages-chat-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{feedbackCase.title}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
            {KIND_LABELS[feedbackCase.kind]} · {CATEGORY_LABELS[feedbackCase.category]}
          </div>
        </div>
        <StatusBadge status={feedbackCase.status} />
      </div>

      <div className="messages-thread">
        <div className="messages-bubble">
          <div className="messages-bubble-text">{feedbackCase.body}</div>
        </div>
        {replies.map((r) => (
          <div key={r.id} className={`messages-bubble${r.authorUid === session.uid ? ' mine' : ''}`}>
            {r.visibility === 'admin_internal' && <div style={{ fontSize: '11px', color: 'var(--sunset)', marginBottom: '2px' }}><i className="ti ti-lock" /> ملاحظة داخلية</div>}
            <div className="messages-bubble-text">{r.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 0' }}>
        {canEscalate && isOpen && (
          <button type="button" className="btn" onClick={() => escalateCase(feedbackCase.id)}><i className="ti ti-corner-up-right" /> تصعيد للإدارة</button>
        )}
        {isOpen ? (
          <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'resolved')}><i className="ti ti-check" /> تم الحل</button>
        ) : (
          <button type="button" className="btn" onClick={() => changeStatus(feedbackCase.id, 'open')}><i className="ti ti-refresh" /> إعادة فتح</button>
        )}
      </div>

      <form className="messages-input-row" onSubmit={handleReply}>
        <input type="text" placeholder="اكتب ردك..." value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending}><i className="ti ti-send" /></button>
      </form>
    </div>
  )
}

const TABS = [
  { key: 'needsReply', label: 'بحاجة لردّي' },
  { key: 'inbox', label: 'الوارد' },
  { key: 'sent', label: 'المرسل' },
  { key: 'resolved', label: 'تم حلها' },
]

export default function FeedbackPage() {
  const { session } = useSession()
  const { myCases, activeCaseId, openCase } = useFeedback()
  const [tab, setTab] = useState('needsReply')
  const [composerOpen, setComposerOpen] = useState(false)

  function needsMyReply(c) {
    if (!c.requiresResponse || !['open', 'in_progress'].includes(c.status)) return false
    return (c.lastReplyByUid || c.createdByUid) !== session.uid
  }

  const filtered = myCases.filter((c) => {
    if (tab === 'needsReply') return needsMyReply(c)
    if (tab === 'inbox') return c.createdByUid !== session.uid
    if (tab === 'sent') return c.createdByUid === session.uid
    if (tab === 'resolved') return c.status === 'resolved' || c.status === 'closed'
    return true
  })

  const activeCase = myCases.find((c) => c.id === activeCaseId)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">الملاحظات والمتابعة</div>
          <h2 className="page-title">تواصل موثّق مع {session.role === 'parent' ? 'المعلّمين والإدارة' : 'أولياء الأمور'}</h2>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setComposerOpen((o) => !o)}>
          <i className="ti ti-plus" /> ملاحظة جديدة
        </button>
      </div>

      {composerOpen && (
        session.role === 'parent'
          ? <ComposerParent onDone={() => setComposerOpen(false)} />
          : <ComposerInstructor onDone={() => setComposerOpen(false)} />
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key} type="button"
            className={`nav-pill${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
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
                  <div className="messages-contact-preview">{CATEGORY_LABELS[c.category]} · {IMPORTANCE_LABELS[c.importance]}</div>
                </div>
                <StatusBadge status={c.status} />
              </button>
            ))
          )}
        </div>

        {activeCase ? <CaseDetails feedbackCase={activeCase} /> : (
          <div className="messages-chat panel">
            <div className="messages-empty"><i className="ti ti-message-circle-2" /> اختر ملاحظة من القائمة</div>
          </div>
        )}
      </div>
    </div>
  )
}
