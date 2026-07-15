import { createContext, useContext, useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { session } = useSession()
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!session) {
      setNotifications([])
      return
    }
    const q = query(collection(db, 'notifications'), where('recipientUid', '==', session.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      // نرتب بالزمن يدوياً بالـ JavaScript، بدل ما نطلب من Firestore ترتيب جاهز
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0
        const bt = b.createdAt?.toMillis?.() ?? 0
        return bt - at
      })
      setNotifications(list)
    })
    return () => unsubscribe()
  }, [session])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAsRead(id) {
    await updateDoc(doc(db, 'notifications', id), { read: true })
  }

  async function markAllAsRead() {
    const unread = notifications.filter((n) => !n.read)
    await Promise.all(unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true })))
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}