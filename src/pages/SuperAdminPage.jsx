import { useState, useEffect } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '../firebase'
import { logAudit } from '../utils/audit'
import { safeHttpUrl } from '../utils/parseMaterialUrl'

const workerUrl = (import.meta.env.VITE_ADMIN_OPS_WORKER_URL || '').replace(/\/$/, '')

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
  const [brandSaveState, setBrandSaveState] = useState({}) // { [schoolId]: 'saving' | 'saved' | 'error' }
  const [createSchoolForm, setCreateSchoolForm] = useState({ schoolName: '', adminName: '', adminEmail: '' })
  const [createSchoolLoading, setCreateSchoolLoading] = useState(false)
  const [createSchoolError, setCreateSchoolError] = useState('')
  const [createdSchoolCredential, setCreatedSchoolCredential] = useState(null)
  const [reauthPassword, setReauthPassword] = useState('')
  const [createRequestId, setCreateRequestId] = useState(null)
  const [credentialsCopied, setCredentialsCopied] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user)
      setCreatedSchoolCredential(null)
      setReauthPassword('')
      setCreateRequestId(null)
      setCredentialsCopied(false)
      setCreateSchoolError('')
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

  async function handleCreateSchool(e) {
    e.preventDefault()
    setCreateSchoolError('')
    setCredentialsCopied(false)
    const schoolName = createSchoolForm.schoolName.trim()
    const adminName = createSchoolForm.adminName.trim()
    const adminEmail = createSchoolForm.adminEmail.trim().toLowerCase()
    if (!workerUrl) { setCreateSchoolError('خدمة الإدارة غير مضبوطة. أضف رابط Worker قبل إنشاء المدارس.'); return }
    if (!schoolName || schoolName.length > 120) { setCreateSchoolError('اسم المدرسة مطلوب وبحد أقصى 120 حرفًا.'); return }
    if (!adminName || adminName.length > 80) { setCreateSchoolError('اسم المدير مطلوب وبحد أقصى 80 حرفًا.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { setCreateSchoolError('اكتب بريد المدير الإلكتروني بصيغة صحيحة.'); return }
    if (!reauthPassword) { setCreateSchoolError('اكتب كلمة سر صاحب المنصة للتأكيد.'); return }
    if (!window.confirm(`سيتم إنشاء مدرسة "${schoolName}" وحساب مدير جديد. متأكد؟`)) return

    setCreateSchoolLoading(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser?.email) { setCreateSchoolError('انتهت الجلسة، سجّل دخول صاحب المنصة من جديد.'); return }
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, reauthPassword))
      setReauthPassword('')
      const requestId = createRequestId || crypto.randomUUID()
      if (!createRequestId) setCreateRequestId(requestId)
      const idToken = await currentUser.getIdToken(true)
      const res = await fetch(`${workerUrl}/create-school`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ requestId, schoolName, adminName, adminEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateSchoolError(translateCreateSchoolError(data)); return }

      setCreatedSchoolCredential(data)
      setCreateSchoolForm({ schoolName: '', adminName: '', adminEmail: '' })
      setCreateRequestId(null)
    } catch (err) {
      setReauthPassword('')
      setCreateSchoolError(translateCreateSchoolError(err))
    } finally {
      setCreateSchoolLoading(false)
    }
  }

  async function copyCredentials() {
    if (!createdSchoolCredential) return
    const text = `المدرسة: ${createdSchoolCredential.schoolName}\nمعرّف المدرسة: ${createdSchoolCredential.schoolId}\nالمدير: ${createdSchoolCredential.adminName}\nالبريد: ${createdSchoolCredential.adminEmail}\nكلمة السر المؤقتة: ${createdSchoolCredential.temporaryPassword}`
    try {
      await navigator.clipboard.writeText(text)
      setCredentialsCopied(true)
      setTimeout(() => setCredentialsCopied(false), 1800)
    } catch {
      setCreateSchoolError('تعذّر النسخ تلقائيًا. انسخ البيانات من البطاقة يدويًا.')
    }
  }

  function brandFor(school) {
    return { platformName: '', logoUrl: '', primaryColor: '', ...school.branding, ...brandEdits[school.id] }
  }

  async function saveBranding(school) {
    const info = brandFor(school)
    if (info.logoUrl && !safeHttpUrl(info.logoUrl)) {
      setBrandSaveState((p) => ({ ...p, [school.id]: 'error' }))
      return
    }
    setBrandSaveState((p) => ({ ...p, [school.id]: 'saving' }))
    try {
      await updateDoc(doc(db, 'schools', school.id), { branding: info })
      await logAudit(school.id, authUser.uid, authUser.email, 'set_branding', 'school', school.id, JSON.stringify(info))
      setBrandSaveState((p) => ({ ...p, [school.id]: 'saved' }))
      setTimeout(() => setBrandSaveState((p) => ({ ...p, [school.id]: undefined })), 1800)
    } catch {
      // بدون هالـ catch: الحقول بالنموذج بتضل عارضة القيمة الجديدة (brandFor بتدمج brandEdits) بغض
      // النظر عن نجاح الحفظ من عدمه — يعني حفظ فاشل بيبين بالضبط متل حفظ ناجح، بدون أي رسالة خطأ
      setBrandSaveState((p) => ({ ...p, [school.id]: 'error' }))
    }
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

      <form className="panel" style={{ marginBottom: '18px' }} onSubmit={handleCreateSchool}>
        <div className="eyebrow" style={{ marginBottom: '4px' }}>تهيئة جديدة</div>
        <h3 style={{ margin: '0 0 6px' }}>إضافة مدرسة جديدة</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginTop: 0 }}>
          سيتم إنشاء كلمة سر مؤقتة للمدير، ويجب تغييرها عند أول دخول.
        </p>
        <div className="field">
          <label htmlFor="create-school-name">اسم المدرسة</label>
          <input id="create-school-name" type="text" maxLength={120} value={createSchoolForm.schoolName} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, schoolName: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="create-school-admin-name">اسم مدير المدرسة</label>
          <input id="create-school-admin-name" type="text" maxLength={80} value={createSchoolForm.adminName} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, adminName: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="create-school-admin-email">البريد الإلكتروني لمدير المدرسة</label>
          <input id="create-school-admin-email" type="email" maxLength={254} value={createSchoolForm.adminEmail} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, adminEmail: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="create-school-reauth">كلمة سر صاحب المنصة للتأكيد</label>
          <input id="create-school-reauth" type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {createSchoolError && <p className="auth-error" role="alert">{createSchoolError}</p>}
        {!workerUrl && <p className="auth-error">خدمة الإدارة غير مضبوطة؛ لا يمكن إنشاء مدرسة حاليًا.</p>}
        <button type="submit" className="btn btn-primary" disabled={createSchoolLoading || !workerUrl}>
          {createSchoolLoading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-school" /> إنشاء المدرسة</>)}
        </button>
      </form>

      {createdSchoolCredential && (
        <div className="panel" style={{ marginBottom: '18px', borderColor: 'var(--sunset)' }} role="status">
          <strong><i className="ti ti-circle-check" /> تم إنشاء المدرسة بنجاح</strong>
          <p style={{ margin: '8px 0 0', fontSize: '13px' }}>المدرسة: {createdSchoolCredential.schoolName}</p>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>معرّف المدرسة: <code>{createdSchoolCredential.schoolId}</code></p>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>المدير: {createdSchoolCredential.adminName}</p>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>البريد: {createdSchoolCredential.adminEmail}</p>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>كلمة السر المؤقتة: <code>{createdSchoolCredential.temporaryPassword}</code></p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={copyCredentials}>
              <i className="ti ti-copy" /> {credentialsCopied ? 'تم النسخ' : 'نسخ بيانات الدخول'}
            </button>
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => { setCreatedSchoolCredential(null); setCredentialsCopied(false) }}>
              <i className="ti ti-eye-off" /> إخفاء البيانات
            </button>
          </div>
        </div>
      )}

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
                <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => saveBranding(s)} disabled={brandSaveState[s.id] === 'saving'}>
                  {brandSaveState[s.id] === 'saving' ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-check" />} حفظ
                </button>
                {brandSaveState[s.id] === 'saved' && <span style={{ fontSize: '11px', color: 'var(--pine)' }}><i className="ti ti-check" /> تم الحفظ</span>}
                {brandSaveState[s.id] === 'error' && <span className="auth-error" style={{ fontSize: '11px' }}>تعذّر الحفظ، حاول مرة ثانية.</span>}
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

function translateCreateSchoolError(error) {
  const code = typeof error === 'string' ? error : error?.error || error?.code
  const map = {
    unauthenticated: 'انتهت الجلسة، سجّل دخول صاحب المنصة من جديد.',
    permission_denied: 'حسابك لا يملك صلاحية إنشاء مدرسة.',
    recent_login_required: 'لأمان الحساب، أعد إدخال كلمة سر صاحب المنصة ثم حاول مجددًا.',
    invalid_input: 'تحقق من بيانات المدرسة والمدير وحاول مرة ثانية.',
    EMAIL_EXISTS: 'هذا البريد مستخدم مسبقًا في النظام. استخدم بريدًا آخر.',
    email_exists: 'هذا البريد مستخدم مسبقًا في النظام. استخدم بريدًا آخر.',
    provisioning_in_progress: 'العملية السابقة ما زالت قيد التنفيذ. انتظر قليلًا ثم أرسل بنفس البيانات.',
    idempotency_conflict: 'معرّف المحاولة مرتبط ببيانات مختلفة. أعد تحميل الصفحة وحاول مجددًا.',
    rate_limited: 'طلبات كثيرة خلال وقت قصير. حاول بعد قليل.',
    provisioning_failed: 'تعذّر إنشاء المدرسة. لم نعتبر العملية ناجحة؛ تحقق من الاتصال وحاول مجددًا.',
    provisioning_rollback_failed: 'تعذّر التراجع عن العملية بالكامل. أوقف المحاولة واطلب فحصًا يدويًا قبل الإعادة.',
    auth_error: 'تعذّر إنشاء حساب المدير. حاول مرة ثانية.',
  }
  if (map[code]) return map[code]
  if (error instanceof Error && error.code?.startsWith('auth/')) {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') return 'كلمة سر صاحب المنصة غير صحيحة.'
    if (error.code === 'auth/too-many-requests') return 'محاولات كثيرة خاطئة. حاول بعد قليل.'
  }
  return 'تعذّر الاتصال بخدمة الإدارة. تحقق من الاتصال وحاول مجددًا.'
}
