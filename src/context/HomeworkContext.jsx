import { createContext, useContext, useState, useEffect } from 'react'
import { collection, addDoc, onSnapshot, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from './SessionContext'

const HomeworkContext = createContext(null)

export function HomeworkProvider({ children }) {
  const { session } = useSession()
  const [homework, setHomework] = useState([])
  const [submissions, setSubmissions] = useState({})

  useEffect(() => {
    if (!session) {
      setHomework([])
      return
    }
    const unsubscribe = onSnapshot(collection(db, 'homework'), (snapshot) => {
      setHomework(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  useEffect(() => {
    if (!session) {
      setSubmissions({})
      return
    }
    const q = query(collection(db, 'submissions'), where('studentUid', '==', session.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map = {}
      snapshot.docs.forEach((d) => {
        const data = d.data()
        map[data.homeworkId] = { url: data.url, submittedAt: data.submittedAt }
      })
      setSubmissions(map)
    })
    return () => unsubscribe()
  }, [session])

  function getHomeworkForCourse(courseId) {
    return homework.filter((h) => h.courseId === courseId)
  }

  async function addHomework({ courseId, title, description, materialUrl, deadline }) {
    await addDoc(collection(db, 'homework'), {
      courseId,
      title,
      description,
      materialUrl: materialUrl || null,
      deadline: new Date(deadline),
      createdAt: serverTimestamp(),
    })
  }

  function getSubmission(homeworkId) {
    return submissions[homeworkId] || null
  }

  async function submitHomework(homeworkId, url) {
    const docId = `${session.uid}_${homeworkId}`
    await setDoc(doc(db, 'submissions', docId), {
      studentUid: session.uid,
      homeworkId,
      url,
      submittedAt: serverTimestamp(),
    })
  }

  return (
    <HomeworkContext.Provider value={{ homework, getHomeworkForCourse, addHomework, getSubmission, submitHomework }}>
      {children}
    </HomeworkContext.Provider>
  )
}

export function useHomework() {
  const ctx = useContext(HomeworkContext)
  if (!ctx) throw new Error('useHomework must be used inside HomeworkProvider')
  return ctx
}