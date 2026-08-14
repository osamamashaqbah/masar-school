import { useState, useEffect } from 'react'
import { collection, query, where, documentId, onSnapshot, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMessages } from '../context/MessagesContext'
import { chunkArray } from '../utils/chunk'

export default function MessagesPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { threads, activeThreadId, messages, openThreadWith, sendMessage, markThreadRead } = useMessages()

  const [contacts, setContacts] = useState([])
  const [draft, setDraft] = useState('')

  // جهات الاتصال: لولي الأمر معلّمو أبنائه (من المواد المرتبطة بشعبة كل ابن)،
  // للمعلّم أولياء أمور طلاب الشعب يلي بيدرّسها
  useEffect(() => {
    if (!session) return

    if (session.role === 'parent') {
      if (!session.childUids?.length) { setContacts([]); return }
      const chunks = chunkArray(session.childUids)
      const childrenByChunk = chunks.map(() => [])
      function updateContacts() {
        const children = childrenByChunk.flat()
        const sectionIds = new Set(children.map((c) => c.sectionId))
        const teacherMap = new Map()
        subjects.filter((s) => sectionIds.has(s.sectionId) && s.teacherUid).forEach((s) => {
          teacherMap.set(s.teacherUid, s.teacherName || 'معلّم')
        })
        setContacts([...teacherMap.entries()].map(([uid, name]) => ({ uid, name })))
      }
      const unsubs = chunks.map((chunk, index) => {
        const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where(documentId(), 'in', chunk))
        return onSnapshot(q, (snap) => {
          childrenByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          updateContacts()
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }

    if (session.role === 'instructor') {
      const myTaughtSectionIds = [...new Set(subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.sectionId))]
      if (myTaughtSectionIds.length === 0) { setContacts([]); return }
      const sectionChunks = chunkArray(myTaughtSectionIds)
      const studentsByChunk = sectionChunks.map(() => [])
      async function updateContacts() {
        const students = studentsByChunk.flat()
        const parentUids = [...new Set(students.flatMap((s) => s.parentUids || []))]
        if (parentUids.length === 0) { setContacts([]); return }
        const parentChunks = chunkArray(parentUids)
        const chunkSnaps = await Promise.all(
          parentChunks.map((chunk) => getDocs(query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where(documentId(), 'in', chunk))))
        )
        const parents = chunkSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
        setContacts(parents.map((p) => ({
          uid: p.id,
          name: p.name,
          sub: students.filter((s) => (s.parentUids || []).includes(p.id)).map((s) => s.name).join('، '),
        })))
      }
      const unsubs = sectionChunks.map((chunk, index) => {
        const q = query(collection(db, 'users'), where('schoolId', '==', session.schoolId), where('role', '==', 'student'), where('sectionId', 'in', chunk))
        return onSnapshot(q, (snap) => {
          studentsByChunk[index] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          updateContacts()
        })
      })
      return () => unsubs.forEach((unsub) => unsub())
    }
  }, [session, subjects])

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const activeContact = activeThread && contacts.find((c) => c.uid === activeThread.participantUids.find((u) => u !== session.uid))

  useEffect(() => {
    if (activeThreadId) markThreadRead(activeThreadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, messages.length])

  function contactThread(uid) {
    return threads.find((t) => t.participantUids.includes(uid))
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim() || !activeThread) return
    const recipientUid = activeThread.participantUids.find((u) => u !== session.uid)
    setDraft('')
    await sendMessage(activeThreadId, recipientUid, draft)
  }

  return (
    <div>
      <div className="eyebrow">الرسائل</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>
        تواصل {session.role === 'parent' ? 'مع معلّمي أبنائك' : 'مع أولياء أمور طلابك'}
      </h2>

      {contacts.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في جهات تواصل متاحة حالياً.</p>
      ) : (
        <div className="messages-layout">
          <div className="messages-contacts panel">
            {contacts.map((c) => {
              const th = contactThread(c.uid)
              const unread = th && th.lastSenderUid !== session.uid && !(th.readBy || []).includes(session.uid)
              return (
                <button
                  key={c.uid}
                  type="button"
                  className={`messages-contact-item${th?.id === activeThreadId ? ' active' : ''}${unread ? ' unread' : ''}`}
                  onClick={() => openThreadWith(c.uid)}
                >
                  <div className="avatar-mini" style={{ background: 'var(--accent)' }}>{c.name?.trim().charAt(0) || '؟'}</div>
                  <div className="messages-contact-info">
                    <div className="messages-contact-name">{c.name}{c.sub ? ` · ${c.sub}` : ''}</div>
                    <div className="messages-contact-preview">{th?.lastMessage || 'ابدأ محادثة'}</div>
                  </div>
                  {unread && <span className="messages-unread-dot" />}
                </button>
              )
            })}
          </div>

          <div className="messages-chat panel">
            {!activeThreadId ? (
              <div className="messages-empty"><i className="ti ti-message-circle-2" /> اختر جهة تواصل من القائمة</div>
            ) : (
              <>
                <div className="messages-chat-head">{activeContact?.name}</div>
                <div className="messages-thread">
                  {messages.length === 0 ? (
                    <p className="messages-empty-thread">ابدأ المحادثة، ابعت أول رسالة.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`messages-bubble${m.senderUid === session.uid ? ' mine' : ''}`}>
                        <div className="messages-bubble-text">{m.text}</div>
                        <div className="messages-bubble-time">
                          {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <form className="messages-input-row" onSubmit={handleSend}>
                  <input
                    type="text"
                    placeholder="اكتب رسالتك..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={2000}
                  />
                  <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                    <i className="ti ti-send" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
