import { useState, useEffect } from 'react'
import { onSnapshotsInSync } from 'firebase/firestore'
import { db } from '../firebase'

// online: حالة الشبكة الفعلية (navigator.onLine + أحداث online/offline).
// syncing: true بس بالفترة القصيرة بعد رجوع النت، لحد ما Firestore يأكد إنه رجع بالمزامنة —
// يغطي حالة "كتابات صارت وقت الانقطاع (حضور مثلاً) وعم تنطبّر هلق" بدون طابور IndexedDB يدوي،
// لأن persistentLocalCache بـ firebase.js أصلًا بيطبّرها تلقائيًا.
export function useConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    function handleOnline() { setOnline(true); setSyncing(true) }
    function handleOffline() { setOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const unsub = onSnapshotsInSync(db, () => setSyncing(false))
    return () => unsub()
  }, [])

  return { online, syncing }
}
