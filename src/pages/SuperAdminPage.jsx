import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '../firebase'
import { logAudit } from '../utils/audit'

// صفحة مستقلة تمامًا عن /app — ما بتعتمد على SessionContext لأنه حساب صاحب المنصة
// مش مرتبط بأي مدرسة أصلاً (ما إله وثيقة users/schoolId متل باقي الأدوار)
export default function SuperAdminPage() {
  const [authUser, setAuthUser] = useState(undefined) // undefined = لسا ما تحقق، null = مش مسجّل دخول
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

  const [schools, setSchools] = useState([])
  const [drilldown, setDrilldown] = useState(null) // { schoolId, schoolName, users }
  const [reason, setReason] = useState('')
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillError, setDrillError] = useState('')
  const [brandEdits, setBrandEdits] = useState({}) // { [schoolId]: { platformName, logoUrl, primaryColor } }
  const [uploadingFor, setUploadingFor] = useState(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user)
      if (user) {
        const snap = await getDoc(doc(db, 'platformAdmins', user.uid))
        setIsPlatformAdmin(snap.exists())
      } else {
        setIsPlatformAdmin(false)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isPlatformAdmin) return
    const unsub = onSnapshot(collection(db, 'platformStats'), (snap) => {
      setSchools(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [isPlatformAdmin])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setLoginError('بيانات الدخول غلط.')
    } finally {
      setLoading(false)
    }
  }

  function brandFor(school) {
    return { platformName: '', logoUrl: '', primaryColor: '', ...school.branding, ...brandEdits[school.id] }
  }

  async function saveBranding(school) {
    const info = brandFor(school)
    await updateDoc(doc(db, 'schools', school.id), { branding: info })
    await logAudit(school.id, authUser.uid, authUser.email, 'set_branding', 'school', school.id, JSON.stringify(info))
  }

  async function handleLogoFile(school, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    if (!file.type.startsWith('image/')) { setUploadError('لازم تختار صورة.'); return }
    if (file.size > 3 * 1024 * 1024) { setUploadError('حجم الصورة أكبر من 3 ميغا.'); return }
    setUploadingFor(school.id)
    try {
      const ext = file.name.split('.').pop()
      const path = `schools/${school.id}/branding/logo.${ext}`
      const fileRef = ref(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      const next = { ...brandFor(school), logoUrl: url }
      setBrandEdits({ ...brandEdits, [school.id]: next })
      await updateDoc(doc(db, 'schools', school.id), { branding: next })
      await logAudit(school.id, authUser.uid, authUser.email, 'set_branding', 'school', school.id, JSON.stringify(next))
    } catch {
      setUploadError('صار خطأ برفع الصورة، حاول مرة ثانية.')
    } finally {
      setUploadingFor(null)
    }
  }

  async function openDrilldown(school) {
    setDrillError('')
    if (!reason.trim()) { setDrillError('لازم تكتب سبب الوصول قبل ما تفتح بيانات المدرسة كاملة.'); return }
    setDrillLoading(true)
    try {
      await logAudit(school.id, authUser.uid, authUser.email, 'platform_admin_full_access', 'school', school.id, reason.trim())
      const [usersSnap, marksSnap, attendanceSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('schoolId', '==', school.id))),
        getDocs(query(collection(db, 'marks'), where('schoolId', '==', school.id))),
        getDocs(query(collection(db, 'attendance'), where('schoolId', '==', school.id))),
      ])

      const marks = marksSnap.docs.map((d) => d.data())
      const scored = marks.filter((m) => typeof m.score === 'number' && typeof m.maxScore === 'number' && m.maxScore > 0)
      const avgPct = scored.length
        ? Math.round((scored.reduce((sum, m) => sum + m.score / m.maxScore, 0) / scored.length) * 100)
        : null

      const attendance = attendanceSnap.docs.map((d) => d.data())
      const excusedCount = attendance.filter((a) => a.excused).length

      setDrilldown({
        schoolId: school.id,
        schoolName: school.schoolName,
        users: usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        summary: {
          marksCount: marks.length,
          avgPct,
          absencesCount: attendance.length,
          excusedCount,
          unexcusedCount: attendance.length - excusedCount,
        },
      })
    } catch (err) {
      setDrillError(`صار خطأ: ${err.code || err.message}`)
    } finally {
      setDrillLoading(false)
    }
  }

  if (authUser === undefined) return null

  if (!authUser) {
    return (
      <div className="auth-loading-screen" style={{ flexDirection: 'column', gap: '18px' }}>
        <form className="panel" style={{ maxWidth: '360px', width: '100%' }} onSubmit={handleLogin}>
          <h3 style={{ marginTop: 0 }}><i className="ti ti-shield-lock" /> دخول صاحب المنصة</h3>
          <div className="field">
            <label htmlFor="sa-email">البريد الإلكتروني</label>
            <input id="sa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="sa-password">كلمة السر</label>
            <input id="sa-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {loginError && <p className="auth-error">{loginError}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <i className="ti ti-loader-2 spin" /> : 'دخول'}</button>
        </form>
      </div>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <div className="auth-loading-screen" style={{ flexDirection: 'column', gap: '14px' }}>
        <p>هاد الحساب مش صاحب منصة.</p>
        <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => signOut(auth)}>تسجيل خروج</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحة صاحب المنصة</div>
          <h2 className="page-title">كل مدارس مسار</h2>
        </div>
        <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => signOut(auth)}>تسجيل خروج</button>
      </div>

      <div className="panel" style={{ marginBottom: '18px' }}>
        <div className="field">
          <label htmlFor="sa-reason">سبب الوصول الكامل (مطلوب قبل فتح بيانات أي مدرسة بالتفصيل)</label>
          <input id="sa-reason" type="text" placeholder="مثال: طلب دعم فني من المدرسة رقم تذكرة #123" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {drillError && <p className="auth-error">{drillError}</p>}
      </div>

      <div className="analytics-list">
        {schools.map((s) => (
          <div className="analytics-row" key={s.id}>
            <div className="analytics-title">{s.schoolName || s.id}</div>
            <div className="analytics-stats-grid">
              <div className="analytics-stat"><i className="ti ti-users" /><span>{s.studentCount} طالب</span></div>
              <div className="analytics-stat"><i className="ti ti-chalkboard" /><span>{s.instructorCount} معلّم</span></div>
              <div className="analytics-stat"><i className="ti ti-user-heart" /><span>{s.parentCount} ولي أمر</span></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', margin: '6px 0' }}>
              السنة: {s.currentAcademicYear || '—'} · آخر نشاط: {s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleDateString('ar-EG') : '—'}
            </div>
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => openDrilldown(s)} disabled={drillLoading}>
              <i className="ti ti-eye" /> عرض بيانات كاملة (مسجّل بسجل التدقيق)
            </button>

            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>تخصيص المنصة</div>
              <div className="field">
                <input type="text" placeholder="اسم المنصة (مسار)" value={brandFor(s).platformName}
                  onChange={(e) => setBrandEdits({ ...brandEdits, [s.id]: { ...brandFor(s), platformName: e.target.value } })} />
              </div>
              <div className="field" style={{ marginTop: '6px' }}>
                <input type="file" accept="image/*" onChange={(e) => handleLogoFile(s, e)} disabled={uploadingFor === s.id} />
                {uploadingFor === s.id && <p style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>جاري الرفع...</p>}
              </div>
              <div className="field" style={{ marginTop: '6px' }}>
                <input type="text" placeholder="أو رابط الشعار (URL)" value={brandFor(s).logoUrl}
                  onChange={(e) => setBrandEdits({ ...brandEdits, [s.id]: { ...brandFor(s), logoUrl: e.target.value } })} />
              </div>
              {uploadError && <p className="auth-error" style={{ fontSize: '11px' }}>{uploadError}</p>}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                <input type="color" style={{ width: '48px', height: '28px', padding: '2px' }} value={brandFor(s).primaryColor || '#2f5d50'}
                  onChange={(e) => setBrandEdits({ ...brandEdits, [s.id]: { ...brandFor(s), primaryColor: e.target.value } })} />
                <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => saveBranding(s)}>
                  <i className="ti ti-check" /> حفظ
                </button>
              </div>
            </div>
          </div>
        ))}
        {schools.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>ما في أي مدرسة حسبت مؤشراتها بعد.</p>}
      </div>

      {drilldown && (
        <div className="panel card-hover-lift animate-stagger" style={{ marginTop: '18px' }}>
          <div style={{ fontWeight: 800, marginBottom: '10px' }}>مستخدمو {drilldown.schoolName}</div>

          <div className="analytics-stats-grid" style={{ marginBottom: '16px' }}>
            <div className="analytics-stat"><i className="ti ti-report" /><span>{drilldown.summary.marksCount} علامة مسجّلة{drilldown.summary.avgPct !== null ? ` · معدّل ${drilldown.summary.avgPct}%` : ''}</span></div>
            <div className="analytics-stat"><i className="ti ti-calendar-x" /><span>{drilldown.summary.absencesCount} غياب ({drilldown.summary.excusedCount} بعذر / {drilldown.summary.unexcusedCount} بدون عذر)</span></div>
          </div>

          <div className="gradebook-table">
            <div className="gradebook-header"><span>الاسم</span><span>الدور</span><span>البريد</span></div>
            {drilldown.users.map((u) => (
              <div className="gradebook-row" key={u.id}>
                <span className="gradebook-student"><i className="ti ti-user" /> {u.name}</span>
                <span>{u.role}</span>
                <span>{u.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
