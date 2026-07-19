import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, updateDoc, arrayUnion, collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'

export default function AdminPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()

  const [users, setUsers] = useState([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [selectedChildren, setSelectedChildren] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncedParentLinks, setSyncedParentLinks] = useState(false)

  useEffect(() => {
    if (session?.role !== 'owner') return
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [session])

  // إصلاح ذاتي لمرة وحدة: حسابات أولياء الأمور يلي انربطت بأبنائها (childUids) قبل ما نضيف
  // الربط العكسي (parentUids على وثيقة الطالب) ما راح يقدر المعلّم يوصّلها. نعيد بناءه هون.
  useEffect(() => {
    if (syncedParentLinks || session?.role !== 'owner' || users.length === 0) return
    setSyncedParentLinks(true)
    const parents = users.filter((u) => u.role === 'parent' && u.childUids?.length > 0)
    Promise.all(
      parents.flatMap((p) =>
        p.childUids.map((childUid) => {
          const child = users.find((u) => u.id === childUid)
          if (child?.parentUids?.includes(p.id)) return Promise.resolve()
          return updateDoc(doc(db, 'users', childUid), { parentUids: arrayUnion(p.id) }).catch(() => {})
        })
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, session, syncedParentLinks])

  if (session?.role !== 'owner') return <Navigate to="/app/dashboard" replace />

  const instructorCount = users.filter((u) => u.role === 'instructor').length
  const studentCount = users.filter((u) => u.role === 'student').length
  const parentCount = users.filter((u) => u.role === 'parent').length
  const students = users.filter((u) => u.role === 'student')

  function toggleChild(uid) {
    setSelectedChildren((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password)

      const profile = { name: name.trim(), role, email: email.trim() }
      if (role === 'parent') {
        profile.childUids = selectedChildren
      }

      await setDoc(doc(db, 'users', credential.user.uid), profile)
      if (role === 'parent' && selectedChildren.length > 0) {
        await Promise.all(
          selectedChildren.map((childUid) =>
            updateDoc(doc(db, 'users', childUid), { parentUids: arrayUnion(credential.user.uid) })
          )
        )
      }
      await signOut(secondaryAuth)

      const roleLabel = role === 'instructor' ? 'المعلّم' : role === 'parent' ? 'ولي الأمر' : 'الطالب'
      setSuccess(`تم إنشاء حساب ${roleLabel} بنجاح.`)
      setName('')
      setEmail('')
      setPassword('')
      setRole('student')
      setSelectedChildren([])
    } catch (err) {
      setError(translateFirebaseError(err.code))
    } finally {
      await deleteApp(secondaryApp)
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="eyebrow">لوحة إدارة المدرسة</div>
      <h2 className="page-title" style={{ marginBottom: '20px' }}>نظرة عامة على المدرسة</h2>

      <div className="owner-stats-grid">
        <div className="owner-stat-card">
          <i className="ti ti-books" />
          <div className="owner-stat-value">{subjects.length}</div>
          <div className="owner-stat-label">مادة</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-chalkboard" />
          <div className="owner-stat-value">{instructorCount}</div>
          <div className="owner-stat-label">معلّم</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-users" />
          <div className="owner-stat-value">{studentCount}</div>
          <div className="owner-stat-label">طالب</div>
        </div>
        <div className="owner-stat-card">
          <i className="ti ti-user-heart" />
          <div className="owner-stat-value">{parentCount}</div>
          <div className="owner-stat-label">ولي أمر</div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: '32px' }}>إدارة المستخدمين</div>
      <h2 className="page-title" style={{ marginBottom: '20px', fontSize: '20px' }}>
        أنشئ حساب معلّم، طالب، أو ولي أمر
      </h2>

      <form className="panel" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="admin-name">الاسم</label>
          <input id="admin-name" type="text" placeholder="اسم المستخدم الكامل" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="admin-email">البريد الإلكتروني</label>
          <input id="admin-email" type="email" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="admin-password">كلمة السر</label>
          <input id="admin-password" type="password" placeholder="6 أحرف على الأقل" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>

        <div className="field">
          <label htmlFor="admin-role">الدور</label>
          <select id="admin-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">طالب</option>
            <option value="instructor">معلّم</option>
            <option value="parent">ولي أمر</option>
          </select>
        </div>

        {role === 'parent' && (
          <div className="field">
            <label>اختار أبناءه (طالب أو أكثر)</label>
            {students.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>ما في طلاب مسجّلين بعد. أضف طالب أول.</p>
            ) : (
              <div className="children-checklist">
                {students.map((s) => (
                  <label key={s.id} className="child-check-row">
                    <input type="checkbox" checked={selectedChildren.includes(s.id)} onChange={() => toggleChild(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}
        {success && (
          <p style={{ color: 'var(--pine)', fontSize: '13px', margin: '0 0 14px' }}>
            <i className="ti ti-check" /> {success}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-user-plus" /> إنشاء الحساب</>)}
        </button>
      </form>

      <div className="eyebrow" style={{ marginTop: '32px' }}>كل المستخدمين</div>
      <h2 className="page-title" style={{ marginBottom: '16px', fontSize: '20px' }}>قائمة الحسابات المسجّلة</h2>

      <div className="users-list">
        {users.map((u) => (
          <div className="users-row" key={u.id}>
            <div className="avatar-mini" style={{ background: roleColor(u.role) }}>
              {u.name?.trim().charAt(0) || '؟'}
            </div>
            <div className="users-info">
              <div className="users-name">{u.name}</div>
              <div className="users-email">{u.email}</div>
              {u.role === 'parent' && u.childUids?.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>
                  الأبناء: {u.childUids.map((cid) => users.find((x) => x.id === cid)?.name || '؟').join('، ')}
                </div>
              )}
            </div>
            <span className="tag" style={{ background: roleColor(u.role) + '22', color: roleColor(u.role) }}>
              {roleLabel(u.role)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'owner') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}

function roleColor(role) {
  if (role === 'instructor') return 'var(--pine)'
  if (role === 'owner') return 'var(--sunset)'
  if (role === 'parent') return 'var(--sky)'
  return 'var(--berry)'
}

function translateFirebaseError(code) {
  const map = {
    'auth/email-already-in-use': 'هاد البريد مسجّل من قبل.',
    'auth/invalid-email': 'صيغة البريد الإلكتروني مو صحيحة.',
    'auth/weak-password': 'كلمة السر لازم تكون 6 أحرف على الأقل.',
  }
  return map[code] || 'صار خطأ غير متوقع. جرب مرة ثانية.'
}