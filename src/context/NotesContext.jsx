import { createContext, useContext, useState, useRef } from 'react'
import { collection, doc, setDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const NotesContext = createContext(null)

export function NotesProvider({ children }) {
  const { session } = useSession()
  const [notesMap, setNotesMap] = useState({})
  const loadedCourseRef = useRef(null)
  const unsubscribeRef = useRef(null)

  function loadCourseNotes(courseId) {
    if (!session || !courseId || loadedCourseRef.current === courseId) return
    if (unsubscribeRef.current) unsubscribeRef.current()

    loadedCourseRef.current = courseId
    const q = query(collection(db, 'notes'), where('courseId', '==', courseId))
    unsubscribeRef.current = onSnapshot(q, (snapshot) => {
      setNotesMap((prev) => {
        const updated = { ...prev }
        snapshot.docs.forEach((d) => {
          const data = d.data()
          updated[`${data.courseId}-${data.lessonIndex}`] = data.text
        })
        return updated
      })
    })
  }

  function getNote(courseId, lessonIndex) {
    return notesMap[`${courseId}-${lessonIndex}`] || ''
  }

  async function saveNote(courseId, lessonIndex, text) {
    const docId = `${courseId}_${lessonIndex}`
    await setDoc(doc(db, 'notes', docId), {
      courseId,
      lessonIndex,
      text,
      instructorUid: session.uid,
    })
  }

  return (
    <NotesContext.Provider value={{ getNote, saveNote, loadCourseNotes }}>
      {children}
    </NotesContext.Provider>
  )
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used inside NotesProvider')
  return ctx
}