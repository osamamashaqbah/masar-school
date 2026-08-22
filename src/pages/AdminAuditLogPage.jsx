import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'

const ACTION_LABELS = {
  set_mark: 'تعديل علامة',
  create_user: 'إنشاء حساب',
  archive_subject: 'أرشفة مادة',
  restore_subject: 'استرجاع مادة',
  create_feedback: 'إرسال ملاحظة',
  reply_feedback: 'رد على ملاحظة',
  escalate_feedback: 'تصعيد ملاحظة للإدارة',
  assign_feedback: 'تعيين مسؤول متابعة',
  resolve_feedback: 'حل ملاحظة',
  reopen_feedback: 'إعادة فتح ملاحظة',
  close_feedback: 'إغلاق ملاحظة',
  set_teacher_availability: 'تحديث توفر معلم',
  report_teacher_absence: 'تسجيل غياب معلم',
  assign_substitute: 'تعيين معلم بديل',
  cover_teacher_absence: 'إغلاق غياب معلم (مغطى)',
  create_intervention: 'إنشاء خطة تدخل',
  note_intervention: 'ملاحظة متابعة على خطة تدخل',
  reopen_intervention: 'إعادة فتح خطة تدخل',
  progress_intervention: 'خطة تدخل قيد المتابعة',
  resolve_intervention: 'حل خطة تدخل',
  close_intervention: 'إغلاق خطة تدخل',
  reassign_intervention: 'تغيير مسؤول متابعة خطة تدخل',
  create_exam_period: 'إنشاء فترة اختبارات',
  set_exam_period_status: 'تغيير حالة فترة اختبارات',
  add_exam_slot: 'إضافة حصة اختبار',
  delete_exam_slot: 'حذف حصة اختبار',
  set_attendance: 'تسجيل حضور أو غياب',
  update_attendance_excuse: 'تعديل عذر حضور',
  remove_attendance: 'حذف سجل حضور',
  set_feature: 'تغيير ميزة',
  set_ramadan_schedule: 'تغيير دوام رمضان',
  set_currency: 'تغيير العملة',
  set_payment_info: 'تعديل معلومات الدفع',
  set_branding: 'تعديل الهوية',
  lock_gradebook: 'قفل السجل الدراسي',
  unlock_gradebook: 'فتح السجل الدراسي',
  export_school_data: 'تصدير بيانات المدرسة',
}

export default function AdminAuditLogPage() {
  const { session } = useSession()
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'auditLog'), where('schoolId', '==', session.schoolId))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setEntries(list.slice(0, 200))
    })
    return () => unsub()
  }, [session])

  return (
    <div>
      <div className="eyebrow">سجل التدقيق</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>مين سوى شو ومتى</h2>

      {entries.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في أي عملية مسجّلة بعد.</p>
      ) : (
        <div className="gradebook-table">
          <div className="gradebook-header"><span>العملية</span><span>الفاعل</span><span>الوقت</span></div>
          {entries.map((e) => (
            <div className="gradebook-row" key={e.id}>
              <span className="gradebook-student">
                <i className="ti ti-history" /> {ACTION_LABELS[e.action] || e.action}
                {e.details ? ` — ${e.details}` : ''}
              </span>
              <span>{e.actorName}</span>
              <span>{e.createdAt?.toDate ? e.createdAt.toDate().toLocaleString('ar-EG') : typeof e.createdAt === 'string' ? new Date(e.createdAt).toLocaleString('ar-EG') : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
