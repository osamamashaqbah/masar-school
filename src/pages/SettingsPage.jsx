import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { AVATAR_OPTIONS, getAvatar } from '../utils/avatars'

const FEATURE_KEYS = [
  { key: 'messaging', label: 'الرسائل (معلّم ↔ ولي أمر)' },
  { key: 'announcements', label: 'إعلانات المدرسة' },
  { key: 'honorBoards', label: 'لوحات الشرف والإنذار المبكر' },
  { key: 'scheduleOps', label: 'تعارضات الجدول وتغطية الغياب' },
  { key: 'examCenter', label: 'مركز الاختبارات' },
  // مغلقة افتراضيًا (عكس بقية الميزات) — تُفعّل يدويًا لمدرسة تجريبية أولًا قبل التعميم
  { key: 'feedback', label: 'الملاحظات والمتابعة', defaultOn: false },
]

function FeatureFlagsSection() {
  const { features, setFeature } = useSchoolStructure()

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3><i className="ti ti-toggle-left" /> ميزات المنصة</h3>
        <p>فعّل أو عطّل ميزات كاملة لمدرستك — التغيير فوري لكل المستخدمين.</p>
      </div>
      <div className="panel card-hover-lift" style={{ maxWidth: '480px' }}>
        {FEATURE_KEYS.map((f) => {
          const enabled = f.defaultOn === false ? features[f.key] === true : features[f.key] !== false
          return (
            <div key={f.key} className="account-panel-row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '13.5px' }}>{f.label}</span>
              <button
                type="button"
                style={{ background: enabled ? 'var(--pine)' : 'var(--paper-deep)', color: enabled ? '#fff' : 'var(--ink-faint)', border: 'none', borderRadius: '99px', padding: '5px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => setFeature(f.key, !enabled)}
              >
                {enabled ? 'مفعّل' : 'معطّل'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CURRENCIES = [
  { code: 'JOD', label: 'دينار أردني (JOD)' },
  { code: 'SAR', label: 'ريال سعودي (SAR)' },
  { code: 'AED', label: 'درهم إماراتي (AED)' },
  { code: 'USD', label: 'دولار أمريكي (USD)' },
]

function GulfReadinessSection() {
  const { session } = useSession()
  const { ramadanSchedule, currency, paymentInfo, branding, updateRamadanSchedule, updateCurrency, updatePaymentInfo, updateBranding } = useSchoolStructure()
  const [hours, setHours] = useState(ramadanSchedule.shortDayHours || '')
  const [payment, setPayment] = useState({ bankName: '', iban: '', cliqAlias: '', notes: '', ...paymentInfo })
  const [brand, setBrand] = useState({ logoUrl: '', primaryColor: '#2f5d50', ...branding })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function handleLogoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    if (!file.type.startsWith('image/')) { setUploadError('لازم تختار صورة.'); return }
    if (file.size > 3 * 1024 * 1024) { setUploadError('حجم الصورة أكبر من 3 ميغا.'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `schools/${session.schoolId}/branding/logo.${ext}`
      const fileRef = ref(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      const next = { ...brand, logoUrl: url }
      setBrand(next)
      await updateBranding(next)
    } catch {
      setUploadError('صار خطأ برفع الصورة، حاول مرة ثانية.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3><i className="ti ti-moon-stars" /> دوام رمضان والعملة</h3>
        <p>يظهر تنبيه لكل المستخدمين تلقائيًا وقت رمضان (حسب التقويم الهجري) لو فعّلته.</p>
      </div>
      <div className="panel card-hover-lift" style={{ maxWidth: '480px' }}>
        <div className="account-panel-row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontSize: '13.5px' }}>تفعيل دوام رمضان المختصر</span>
          <button
            type="button"
            style={{ background: ramadanSchedule.enabled ? 'var(--pine)' : 'var(--paper-deep)', color: ramadanSchedule.enabled ? '#fff' : 'var(--ink-faint)', border: 'none', borderRadius: '99px', padding: '5px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            onClick={() => updateRamadanSchedule(!ramadanSchedule.enabled, Number(hours) || null)}
          >
            {ramadanSchedule.enabled ? 'مفعّل' : 'معطّل'}
          </button>
        </div>
        {ramadanSchedule.enabled && (
          <div className="field" style={{ marginTop: '10px' }}>
            <label htmlFor="ramadan-hours">عدد ساعات الدوام المختصر</label>
            <input
              id="ramadan-hours" type="number" min="1" max="8" value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => updateRamadanSchedule(true, Number(hours) || null)}
              style={{ maxWidth: '120px' }}
            />
          </div>
        )}
        <div className="field" style={{ marginTop: '14px' }}>
          <label htmlFor="school-currency">عملة المدرسة</label>
          <select id="school-currency" value={currency} onChange={(e) => updateCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="settings-section-head" style={{ marginTop: '20px' }}>
        <h3><i className="ti ti-building-bank" /> بيانات الدفع للأهالي</h3>
        <p>تظهر هذه البيانات لأولياء الأمور كتعليمات دفع يدوي (تحويل بنكي / CliQ) — لا يوجد تحصيل إلكتروني فعلي.</p>
      </div>
      <div className="panel card-hover-lift" style={{ maxWidth: '480px' }}>
        <div className="field">
          <label htmlFor="payment-bank">اسم البنك</label>
          <input id="payment-bank" value={payment.bankName} onChange={(e) => setPayment({ ...payment, bankName: e.target.value })} onBlur={() => updatePaymentInfo(payment)} />
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="payment-iban">رقم الحساب/الآيبان (IBAN)</label>
          <input id="payment-iban" value={payment.iban} onChange={(e) => setPayment({ ...payment, iban: e.target.value })} onBlur={() => updatePaymentInfo(payment)} />
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="payment-cliq">اسم CliQ (اختياري)</label>
          <input id="payment-cliq" value={payment.cliqAlias} onChange={(e) => setPayment({ ...payment, cliqAlias: e.target.value })} onBlur={() => updatePaymentInfo(payment)} />
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="payment-notes">ملاحظات إضافية</label>
          <textarea id="payment-notes" rows={2} value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} onBlur={() => updatePaymentInfo(payment)} />
        </div>
      </div>

      <div className="settings-section-head" style={{ marginTop: '20px' }}>
        <h3><i className="ti ti-photo" /> تخصيص المنصة</h3>
        <p>اسم المنصة والشعار واللون يظهروا بالشريط العلوي وكشف العلامات المطبوع بعد تسجيل الدخول.</p>
      </div>
      <div className="panel card-hover-lift" style={{ maxWidth: '480px' }}>
        <div className="field">
          <label htmlFor="brand-platform-name">اسم المنصة</label>
          <input id="brand-platform-name" value={brand.platformName || ''} onChange={(e) => setBrand({ ...brand, platformName: e.target.value })} onBlur={() => updateBranding(brand)} placeholder="مسار" />
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="brand-logo-file">ارفع شعار المدرسة (من الجهاز)</label>
          <input id="brand-logo-file" type="file" accept="image/*" onChange={handleLogoFile} disabled={uploading} />
          {uploading && <p style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>جاري الرفع...</p>}
          {uploadError && <p className="auth-error">{uploadError}</p>}
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="brand-logo">أو رابط شعار المدرسة (URL لصورة)</label>
          <input id="brand-logo" value={brand.logoUrl} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} onBlur={() => updateBranding(brand)} placeholder="https://..." />
        </div>
        <div className="field" style={{ marginTop: '10px' }}>
          <label htmlFor="brand-color">اللون الأساسي</label>
          <input id="brand-color" type="color" style={{ width: '60px', height: '32px', padding: '2px' }} value={brand.primaryColor} onChange={(e) => { const next = { ...brand, primaryColor: e.target.value }; setBrand(next); updateBranding(next) }} />
        </div>
        {brand.logoUrl && <img src={brand.logoUrl} alt="شعار المدرسة" style={{ maxHeight: '48px', marginTop: '10px' }} />}
      </div>
    </div>
  )
}

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'admin') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}

function AccountSection() {
  const { session, logout } = useSession()
  const [confirming, setConfirming] = useState(false)
  const myAvatar = getAvatar(session.avatarId)

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3><i className="ti ti-id-badge-2" /> الحساب</h3>
        <p>معلومات حسابك وتسجيل الخروج.</p>
      </div>

      <div className="panel account-panel card-hover-lift" style={{ maxWidth: '520px' }}>
        <div className="account-panel-row">
          <div className="avatar-mini account-avatar" style={myAvatar ? { background: myAvatar.bg } : undefined}>
            {myAvatar ? myAvatar.emoji : (session.name.trim().charAt(0) || '؟')}
          </div>
          <div className="account-panel-info">
            <div className="account-panel-name">{session.name}</div>
            <div className="account-panel-role">{roleLabel(session.role)}{session.email ? ` · ${session.email}` : ''}</div>
          </div>
        </div>

        {!confirming ? (
          <button type="button" className="btn account-logout-btn" onClick={() => setConfirming(true)}>
            <i className="ti ti-logout" /> تسجيل الخروج
          </button>
        ) : (
          <div className="delete-confirm" style={{ marginTop: '14px' }}>
            <span>متأكد إنك بدك تسجل خروج؟</span>
            <button type="button" className="btn" style={{ padding: '7px 14px' }} onClick={() => setConfirming(false)}>لأ</button>
            <button type="button" className="btn account-logout-btn" style={{ padding: '7px 14px' }} onClick={logout}>
              <i className="ti ti-logout" /> نعم، خروج
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ThemePickerSection() {
  const { theme, setTheme, themes } = useTheme()

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3><i className="ti ti-palette" /> مظهر المنصة</h3>
        <p>اختر الثيم يلي بريحك أكثر. التغيير فوري.</p>
      </div>
      <div className="theme-picker-grid">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            data-theme={t.id}
            className={`theme-picker-card${theme === t.id ? ' selected' : ''}`}
            onClick={() => setTheme(t.id)}
            aria-pressed={theme === t.id}
          >
            <span className="theme-picker-check"><i className="ti ti-check" /></span>
            <div className="theme-picker-swatches">
              <span className="theme-picker-swatch" style={{ background: 'var(--accent)' }} />
              <span className="theme-picker-swatch" style={{ background: 'var(--paper-deep)' }} />
              <span className="theme-picker-swatch" style={{ background: 'var(--ink)' }} />
            </div>
            <div className="theme-picker-name">
              {t.label}
              <span className="theme-picker-mode-tag">{t.mode === 'dark' ? 'داكن' : 'فاتح'}</span>
            </div>
            <div className="theme-picker-desc">{t.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileSection() {
  const { session, updateProfile } = useSession()
  const [name, setName] = useState(session.name)
  const [avatarId, setAvatarId] = useState(session.avatarId || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const dirty = name.trim() !== session.name || avatarId !== (session.avatarId || '')

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('لازم تكتب اسم.'); return }
    setSaving(true)
    try {
      await updateProfile({ name: name.trim(), avatarId: avatarId || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      setError('صار خطأ وقت الحفظ: ' + (err.code || err.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3><i className="ti ti-user-circle" /> الملف الشخصي</h3>
        <p>غيّر اسمك وصورتك الرمزية يلي بتظهر بالمنصة.</p>
      </div>

      <div className="panel card-hover-lift" style={{ maxWidth: '520px' }}>
        <div className="field">
          <label htmlFor="profile-name">الاسم</label>
          <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>

        <label style={{ display: 'block', fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '10px', fontWeight: 600 }}>الصورة الرمزية</label>
        <div className="avatar-picker-grid">
          <button
            type="button"
            className={`avatar-picker-item${!avatarId ? ' selected' : ''}`}
            onClick={() => setAvatarId('')}
            style={{ background: 'var(--ink)' }}
            aria-label="بدون صورة رمزية، الحرف الأول من الاسم"
            title="افتراضي (الحرف الأول من الاسم)"
          >
            {name.trim().charAt(0) || '؟'}
          </button>
          {AVATAR_OPTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`avatar-picker-item${avatarId === a.id ? ' selected' : ''}`}
              onClick={() => setAvatarId(a.id)}
              style={{ background: a.bg }}
              aria-pressed={avatarId === a.id}
              aria-label={a.id}
            >
              {a.emoji}
            </button>
          ))}
        </div>

        {error && <p className="auth-error" style={{ marginTop: '14px' }}>{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '18px' }}>
          <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '11px 22px' }} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-device-floppy" /> حفظ التغييرات</>)}
          </button>
          {saved && <span className="notes-saved"><i className="ti ti-check" /> تم الحفظ</span>}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { session } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 6) {
      setError('كلمة السر الجديدة لازم تكون 6 أحرف على الأقل.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة السر الجديدة وتأكيدها مش متطابقين.')
      return
    }

    setLoading(true)
    try {
      const credential = EmailAuthProvider.credential(session.email, currentPassword)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, newPassword)

      setSuccess('تم تغيير كلمة السر بنجاح.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(translateError(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">الإعدادات</div>
          <h2 className="page-title">الإعدادات</h2>
        </div>
        <div className="role-badge"><i className="ti ti-settings" /> {roleLabel(session.role)}</div>
      </div>

      <AccountSection />

      <ProfileSection />

      <ThemePickerSection />

      {session.role === 'admin' && <FeatureFlagsSection />}
      {session.role === 'admin' && <GulfReadinessSection />}

      <div className="settings-section-head">
        <h3><i className="ti ti-lock" /> تغيير كلمة السر</h3>
        <p>حافظ على أمان حسابك بكلمة سر قوية.</p>
      </div>
      <form className="panel card-hover-lift animate-stagger" style={{ maxWidth: '440px' }} onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="current-password">كلمة السر الحالية</label>
          <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="new-password">كلمة السر الجديدة</label>
          <input id="new-password" type="password" placeholder="6 أحرف على الأقل" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
        </div>

        <div className="field">
          <label htmlFor="confirm-password">تأكيد كلمة السر الجديدة</label>
          <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>

        {error && <p className="auth-error">{error}</p>}
        {success && (
          <p style={{ color: 'var(--pine)', fontSize: '13px', margin: '0 0 14px' }}>
            <i className="ti ti-check" /> {success}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-lock" /> حفظ كلمة السر الجديدة</>)}
        </button>
      </form>
    </div>
  )
}

function translateError(code) {
  const map = {
    'auth/invalid-credential': 'كلمة السر الحالية غلط.',
    'auth/wrong-password': 'كلمة السر الحالية غلط.',
    'auth/weak-password': 'كلمة السر الجديدة ضعيفة، لازم 6 أحرف على الأقل.',
    'auth/too-many-requests': 'محاولات كتير خاطئة. جرب بعد شوي.',
  }
  return map[code] || 'صار خطأ غير متوقع. جرب مرة ثانية.'
}