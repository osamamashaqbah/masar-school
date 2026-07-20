import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { AVATAR_OPTIONS, getAvatar } from '../utils/avatars'

function roleLabel(role) {
  if (role === 'instructor') return 'معلّم'
  if (role === 'owner') return 'إدارة المدرسة'
  if (role === 'parent') return 'ولي أمر'
  return 'طالب'
}

function AccountSection() {
  const { session, logout } = useSession()
  const [confirming, setConfirming] = useState(false)
  const myAvatar = getAvatar(session.avatarId)

  return (
    <div style={{ marginBottom: '34px' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>الحساب</h3>
      <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', margin: '0 0 16px' }}>معلومات حسابك وتسجيل الخروج.</p>

      <div className="panel account-panel" style={{ maxWidth: '520px' }}>
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
    <div style={{ marginBottom: '34px' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>مظهر المنصة</h3>
      <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', margin: '0 0 16px' }}>اختر الثيم يلي بريحك أكثر. التغيير فوري.</p>
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
    <div style={{ marginBottom: '34px' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>الملف الشخصي</h3>
      <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', margin: '0 0 16px' }}>غيّر اسمك وصورتك الرمزية يلي بتظهر بالمنصة.</p>

      <div className="panel" style={{ maxWidth: '520px' }}>
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
      <div className="eyebrow">الإعدادات</div>
      <h2 className="page-title" style={{ marginBottom: '24px' }}>الإعدادات</h2>

      <AccountSection />

      <ProfileSection />

      <ThemePickerSection />

      <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>تغيير كلمة السر</h3>
      <form className="panel animate-stagger" style={{ maxWidth: '440px' }} onSubmit={handleSubmit}>
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