import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'

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