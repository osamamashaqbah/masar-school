import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, doc, updateDoc, arrayUnion, onSnapshot, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const AnnouncementsContext = createContext(null)

export function AnnouncementsProvider({ children }) {
  const { session } = useSession()
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    if (!session) { setAnnouncements([]); return }
    const q = query(collection(db, 'announcements'), where('schoolId', '==', session.schoolId))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setAnnouncements(list)
    })
    return () => unsub()
  }, [session])

  async function postAnnouncement(title, body) {
    await addDoc(collection(db, 'announcements'), {
      title: title.trim(), body: body.trim(), schoolId: session.schoolId,
      authorUid: session.uid, authorName: session.name, readBy: [session.uid], createdAt: serverTimestamp(),
    })
  }

  async function markRead(id) {
    await updateDoc(doc(db, 'announcements', id), { readBy: arrayUnion(session.uid) })
  }

  const unreadCount = announcements.filter((a) => !(a.readBy || []).includes(session?.uid)).length

  return (
    <AnnouncementsContext.Provider value={{ announcements, postAnnouncement, markRead, unreadCount }}>
      {children}
    </AnnouncementsContext.Provider>
  )
}

export function useAnnouncements() {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncements must be used inside AnnouncementsProvider')
  return ctx
}
