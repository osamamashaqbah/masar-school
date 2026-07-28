import { useState } from 'react'
import { useSession } from '../context/SessionContext'

// موافقة ولي الأمر على معالجة بيانات ابنه/ابنته — مطلوبة قانونيًا (قانون حماية البيانات الشخصية
// الأردني رقم 24 لسنة 2023)، تُسجَّل مرة وحدة بالتاريخ والوقت على حساب ولي الأمر نفسه
export default function ConsentGate() {
  const { session, giveConsent, logout } = useSession()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  if (session.role !== 'parent' || session.consentGivenAt) return null

  async function handleAgree() {
    setSaving(true)
    try {
      await giveConsent()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-overlay" style={{ zIndex: 200 }}>
      <div className="panel animate-pop" style={{ maxWidth: '460px', margin: '80px auto', padding: '28px' }}>
        <h3 style={{ marginTop: 0, fontFamily: "'Alexandria', sans-serif" }}><i className="ti ti-shield-check" /> موافقة على معالجة البيانات</h3>
        <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          حسابك كولي أمر بيقدر يشوف علامات وحضور وواجبات ابنك/ابنتك داخل المنصة، وبيستقبل إشعارات متعلقة فيهم.
          هاي البيانات محفوظة ومعزولة لمدرستكم بس، وما تُشارك مع أي طرف خارجي. موافقتك مطلوبة مرة وحدة قبل ما تكمل استخدام المنصة.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', margin: '16px 0' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>أوافق على معالجة بيانات ابني/ابنتي داخل منصة مسار لأغراض إدارة العملية التعليمية.</span>
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn btn-primary" onClick={handleAgree} disabled={!checked || saving} style={{ width: 'auto', padding: '10px 22px' }}>
            {saving ? <i className="ti ti-loader-2 spin" /> : 'أوافق وأكمل'}
          </button>
          <button type="button" className="btn" onClick={logout} style={{ width: 'auto', padding: '10px 22px' }}>تسجيل الخروج</button>
        </div>
      </div>
    </div>
  )
}
