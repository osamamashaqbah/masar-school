import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, setDoc, getDoc, doc, updateDoc, query, where, onSnapshot, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'
import { useSchoolStructure } from './SchoolStructureContext'
import { sendNotification } from '../utils/notify'

const MessagesContext = createContext(null)

function threadIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_')
}

export function MessagesProvider({ children }) {
  const { session } = useSession()
  const { features } = useSchoolStructure()
  const messagingEnabled = features.messaging !== false
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!session || !messagingEnabled) { setThreads([]); setActiveThreadId(null); setMessages([]); return }
    const q = query(collection(db, 'threads'), where('participantUids', 'array-contains', session.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.lastMessageAt?.toMillis?.() ?? 0) - (a.lastMessageAt?.toMillis?.() ?? 0))
      setThreads(list)
    })
    return () => unsub()
  }, [session, messagingEnabled])

  // منفصلة لصادر/وارد بدل استعلام وحدة بـ threadId بس — قاعدة Firestore الأمنية بتتحقق من
  // senderUid/recipientUid، وقواعد الـ list queries بتتطلب إنه الحقول يلي الرول بتفحصها تكون
  // ضمن فلاتر الاستعلام نفسه، وإلا بترجع permission-denied (تأكدنا منها بتجربة فعلية على الإنتاج)
  useEffect(() => {
    if (!activeThreadId || !session || !messagingEnabled) { setMessages([]); return }
    const sentQ = query(collection(db, 'messages'), where('threadId', '==', activeThreadId), where('senderUid', '==', session.uid))
    const receivedQ = query(collection(db, 'messages'), where('threadId', '==', activeThreadId), where('recipientUid', '==', session.uid))
    let sent = [], received = []
    function mergeAndSet() {
      const list = [...sent, ...received]
      list.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      setMessages(list)
    }
    const unsub1 = onSnapshot(sentQ, (snap) => { sent = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() })
    const unsub2 = onSnapshot(receivedQ, (snap) => { received = snap.docs.map((d) => ({ id: d.id, ...d.data() })); mergeAndSet() })
    return () => { unsub1(); unsub2() }
  }, [activeThreadId, session, messagingEnabled])

  // بيفتح محادثة مع طرف تاني (تنشئها لو أول مرة)، وبيرجع threadId
  async function openThreadWith(otherUid) {
    const id = threadIdFor(session.uid, otherUid)
    const ref = doc(db, 'threads', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        participantUids: [session.uid, otherUid],
        schoolId: session.schoolId,
        lastMessage: '', lastMessageAt: serverTimestamp(), lastSenderUid: session.uid,
        readBy: [session.uid],
        createdAt: serverTimestamp(),
      })
    } else {
      await updateDoc(ref, { readBy: arrayUnion(session.uid) })
    }
    setActiveThreadId(id)
    return id
  }

  async function sendMessage(threadId, recipientUid, text) {
    const trimmed = text.trim()
    if (!trimmed) return
    await addDoc(collection(db, 'messages'), {
      threadId, senderUid: session.uid, recipientUid, text: trimmed, schoolId: session.schoolId,
      read: false, createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'threads', threadId), {
      lastMessage: trimmed, lastMessageAt: serverTimestamp(), lastSenderUid: session.uid, readBy: [session.uid],
    })
    // إشعار للطرف التاني، best-effort متل باقي أماكن التطبيق — ما بده يوقف الإرسال لو فشل
    try {
      await sendNotification(recipientUid, `رسالة جديدة من ${session.name}`, 'info', session.schoolId)
    } catch { /* best-effort */ }
  }

  async function markThreadRead(threadId) {
    await updateDoc(doc(db, 'threads', threadId), { readBy: arrayUnion(session.uid) })
    const unread = messages.filter((m) => m.threadId === threadId && m.recipientUid === session.uid && !m.read)
    await Promise.all(unread.map((m) => updateDoc(doc(db, 'messages', m.id), { read: true })))
  }

  return (
    <MessagesContext.Provider value={{ threads, activeThreadId, setActiveThreadId, messages, openThreadWith, sendMessage, markThreadRead, threadIdFor }}>
      {children}
    </MessagesContext.Provider>
  )
}

export function useMessages() {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider')
  return ctx
}
