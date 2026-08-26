import { createContext, useContext, useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  function buildSession(uid, email, data) {
    return {
      uid, email, role: data.role,
      schoolId: data.schoolId,
      name: data.name,
      avatarId: data.avatarId || null,
      sectionId: data.sectionId || null,
      childUids: data.childUids || [],
      consentGivenAt: data.consentGivenAt || null,
      status: data.status || 'active',
      mustChangePassword: data.mustChangePassword === true,
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (!profileSnap.exists() || profileSnap.data().status === 'inactive') {
            await signOut(auth)
            setSession(null)
          } else {
            setSession(buildSession(firebaseUser.uid, firebaseUser.email, profileSnap.data()))
          }
        } else {
          setSession(null)
        }
      } catch (err) {
        console.error('[الجلسة] فشل تحميل ملف المستخدم:', err)
        setSession(null)
      } finally {
        setAuthLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const profileSnap = await getDoc(doc(db, 'users', credential.user.uid))
    if (!profileSnap.exists()) {
      // حساب Firebase Auth صحيح بس ما إله وثيقة users مطابقة (محذوف/معطّل من الإدارة مثلاً) —
      // لازم نطلع خطأ واضح، وإلا Login.jsx كان بينتقل لـ /app/dashboard واللي بترجّعه Layout فورًا
      // لـ / بدون أي تفسير، فالمستخدم بيحس إنه تسجيل الدخول "ما ضل يشتغل" بدون سبب
      await signOut(auth)
      const err = new Error('signed in but no matching user profile')
      err.code = 'app/no-profile'
      throw err
    }
    if (profileSnap.data().status === 'inactive') {
      await signOut(auth)
      const err = new Error('user account is inactive')
      err.code = 'app/inactive-account'
      throw err
    }
    const nextSession = buildSession(credential.user.uid, credential.user.email, profileSnap.data())
    setSession(nextSession)
    return nextSession
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

  // موافقة ولي الأمر على معالجة بيانات ابنه/ابنته (قانون حماية البيانات الشخصية رقم 24 لسنة 2023)
  async function giveConsent() {
    await updateDoc(doc(db, 'users', session.uid), { consentGivenAt: serverTimestamp() })
    setSession((prev) => ({ ...prev, consentGivenAt: new Date() }))
  }

  async function clearMustChangePassword() {
    // الحقل يُمسح من Worker بعد تغيير كلمة السر بنجاح؛ هنا نحدّث حالة الواجهة فقط.
    setSession((prev) => ({ ...prev, mustChangePassword: false }))
  }

  return (
    <SessionContext.Provider value={{ session, login, logout, authLoading, updateProfile, giveConsent, clearMustChangePassword }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
