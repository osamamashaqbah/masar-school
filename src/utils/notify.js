import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function sendNotification(recipientUid, message, type = 'info', schoolId) {
  await addDoc(collection(db, 'notifications'), {
    recipientUid,
    message,
    type,
    schoolId,
    read: false,
    createdAt: serverTimestamp(),
  })
}