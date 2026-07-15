import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function sendNotification(recipientUid, message, type = 'info') {
  await addDoc(collection(db, 'notifications'), {
    recipientUid,
    message,
    type,
    read: false,
    createdAt: serverTimestamp(),
  })
}