import { createContext, useContext, useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { OWNER_EMAIL } from '../config/owner'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  function buildSession(uid, email, data) {
    const role = email === OWNER_EMAIL ? 'owner' : data.role
    return {
      uid, email, role,
      name: data.name,
      avatarId: data.avatarId || null,
      sectionId: data.sectionId || null,
      childUids: data.childUids || [],
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
        setSession(profileSnap.exists() ? buildSession(firebaseUser.uid, firebaseUser.email, profileSnap.data()) : null)
      } else {
        setSession(null)
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const profileSnap = await getDoc(doc(db, 'users', credential.user.uid))
    if (profileSnap.exists()) {
      setSession(buildSession(credential.user.uid, credential.user.email, profileSnap.data()))
    }
  }

  async function logout() {
    await signOut(auth)
    setSession(null)
  }

  async function updateProfile({ name, avatarId }) {
    const updates = {}
    if (name !== undefined) updates.name = name
    if (avatarId !== undefined) updates.avatarId = avatarId
    await updateDoc(doc(db, 'users', session.uid), updates)
    setSession((prev) => ({ ...prev, ...updates }))
  }

  return (
    <SessionContext.Provider value={{ session, login, logout, authLoading, updateProfile }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}