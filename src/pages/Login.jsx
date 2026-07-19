import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { useSession } from '../context/SessionContext'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useSession()
  const navigate = useNavigate()

  function switchMode(next) {
    setMode(next)
    setError('')
    setResetMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/app/dashboard')
    } catch (err) {
      setError(translateFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setResetMsg('')
    if (!email.trim()) {
      setError('اكتب بريدك الإلكتروني أول عشان نبعتلك رابط الاسترجاع.')
      return
    }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setResetMsg('بعتنالك رابط استرجاع كلمة السر على بريدك.')
    } catch (err) {
      setError(translateFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <svg className="login-logo-svg" width="56" height="56" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        <path className="login-logo-path" d="M14 32 C18 20, 24 20, 26 26 C28 32, 34 32, 38 20" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <h1 className="login-title-anim">مسار</h1>
      <p className="sub login-sub-anim">منصة مدرسية</p>

      {mode === 'login' ? (
        <form key="login" className="login-card login-card-anim animate-scale-in" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" type="email" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">كلمة السر</label>
            <input id="password" type="password" placeholder="كلمة السر" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-arrow-left" /> تسجيل الدخول</>)}
          </button>
          <button type="button" className="link-btn" onClick={() => switchMode('reset')}>
            نسيت كلمة السر؟
          </button>
          <p className="login-note">الحسابات تُنشأ من إدارة المدرسة فقط.</p>
        </form>
      ) : (
        <form key="reset" className="login-card login-card-anim animate-scale-in" onSubmit={handleReset}>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: '0 0 16px', lineHeight: '1.8' }}>
            اكتب بريدك الإلكتروني، ورح نبعتلك رابط تغيّر منه كلمة سرك.
          </p>
          <div className="field">
            <label htmlFor="reset-email">البريد الإلكتروني</label>
            <input id="reset-email" type="email" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="auth-error">{error}</p>}
          {resetMsg && <p style={{ color: 'var(--pine)', fontSize: '13px', margin: '0 0 14px' }}><i className="ti ti-mail-check" /> {resetMsg}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <i className="ti ti-loader-2 spin" /> : (<><i className="ti ti-send" /> إرسال رابط الاسترجاع</>)}
          </button>
          <button type="button" className="link-btn" onClick={() => switchMode('login')}>
            <i className="ti ti-arrow-right" /> الرجوع لتسجيل الدخول
          </button>
        </form>
      )}
    </div>
  )
}

function translateFirebaseError(code) {
  const map = {
    'auth/invalid-credential': 'البريد أو كلمة السر غلط.',
    'auth/user-not-found': 'ما في حساب مسجّل بهاد البريد.',
    'auth/wrong-password': 'كلمة السر غلط.',
    'auth/invalid-email': 'صيغة البريد الإلكتروني مو صحيحة.',
    'auth/too-many-requests': 'محاولات كتير. جرب بعد شوي.',
  }
  return map[code] || 'صار خطأ غير متوقع. جرب مرة ثانية.'
}