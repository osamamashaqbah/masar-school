import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useAttendance } from '../context/AttendanceContext'
import { useMarks } from '../context/MarksContext'
import { useHomework } from '../context/HomeworkContext'
import { useIntervention } from '../context/InterventionContext'
import { computeProcrastinationPattern } from '../utils/procrastination'
import { categoriesFor } from '../utils/gradeCategories'

const RISK_LABELS = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' }
const STATUS_LABELS = { open: 'مفتوح', in_progress: 'قيد المتابعة', resolved: 'تم الحل', closed: 'مغلق' }

function InterventionForm({ studentUid, studentName, defaultRisk, defaultReason, onCreated }) {
  const { allUsers } = useSchoolStructure()
  const { createIntervention } = useIntervention()
  const staff = allUsers.filter((u) => u.role === 'admin' || u.role === 'instructor')
  const [riskLevel, setRiskLevel] = useState(defaultRisk || 'medium')
  const [reason, setReason] = useState(defaultReason || '')
  const [assignedToUid, setAssignedToUid] = useState('')
  const [action, setAction] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const assignee = staff.find((s) => s.id === assignedToUid)
      await createIntervention({
        studentUid, studentName, riskLevel, reason,
        assignedToUid: assignedToUid || null, assignedToName: assignee?.name || null,
        action, followUpDate: followUpDate || null,
      })
      setReason(''); setAction(''); setFollowUpDate(''); setAssignedToUid('')
      onCreated?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '520px' }}>
      <div style={{ fontWeight: 700 }}><i className="ti ti-first-aid-kit" /> خطة تدخل جديدة</div>
      <div className="field">
        <label htmlFor="iv-risk">مستوى الخطر</label>
        <select id="iv-risk" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
          <option value="low">منخفض</option>
          <option value="medium">متوسط</option>
          <option value="high">مرتفع</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="iv-reason">السبب</label>
        <input id="iv-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="iv-action">الإجراء المطلوب</label>
        <input id="iv-action" type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="مثال: تواصل مع ولي الأمر + خطة واجبات علاجية" />
      </div>
      <div className="field">
        <label htmlFor="iv-assignee">مسؤول المتابعة</label>
        <select id="iv-assignee" value={assignedToUid} onChange={(e) => setAssignedToUid(e.target.value)}>
          <option value="">-- بدون تعيين --</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="iv-followup">موعد المتابعة</label>
        <input id="iv-followup" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: 'auto' }}>
        {busy ? <i className="ti ti-loader-2 spin" /> : 'إنشاء خطة التدخل'}
      </button>
    </form>
  )
}

function InterventionCard({ intervention }) {
  const { addNote, changeStatus, reassign } = useIntervention()
  const { allUsers } = useSchoolStructure()
  const staff = allUsers.filter((u) => u.role === 'admin' || u.role === 'instructor')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleNote(e) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    try { await addNote(intervention.id, note); setNote('') } finally { setBusy(false) }
  }

  return (
    <div className="panel" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span className="tag" style={{ marginLeft: '6px' }}>{RISK_LABELS[intervention.riskLevel] || intervention.riskLevel}</span>
          <strong>{intervention.reason}</strong>
        </div>
        <select value={intervention.status} onChange={(e) => changeStatus(intervention.id, e.target.value)} style={{ width: 'auto', fontSize: '12px' }}>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {intervention.action && <p style={{ fontSize: '12.5px', margin: '8px 0 0' }}><i className="ti ti-clipboard-check" /> {intervention.action}</p>}
      <div style={{ fontSize: '12px', color: 'var(--ink-faint)', margin: '6px 0' }}>
        مسؤول المتابعة: {intervention.assignedToName || '—'} · موعد المتابعة: {intervention.followUpDate || '—'}
      </div>
      <select
        value={intervention.assignedToUid || ''}
        onChange={(e) => {
          const s = staff.find((x) => x.id === e.target.value)
          if (s) reassign(intervention.id, s.id, s.name)
        }}
        style={{ fontSize: '11.5px', marginBottom: '8px' }}
      >
        <option value="">-- تغيير مسؤول المتابعة --</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '8px', marginTop: '4px' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>السجل الزمني</div>
        {(intervention.timeline || []).slice().reverse().map((t, i) => (
          <div key={i} style={{ fontSize: '11.5px', color: 'var(--ink-soft)', padding: '3px 0' }}>
            {new Date(t.atMs).toLocaleString('ar-EG')} — {t.byName}: {t.text || t.kind}
          </div>
        ))}
        <form onSubmit={handleNote} style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="أضف ملاحظة متابعة..." style={{ flex: 1, fontSize: '12px' }} />
          <button className="btn" type="submit" disabled={busy || !note.trim()} style={{ width: 'auto' }}>إضافة</button>
        </form>
      </div>
    </div>
  )
}

export default function StudentProfilePage() {
  const { studentUid } = useParams()
  const { session } = useSession()
  const { allUsers, sections, grades, subjects } = useSchoolStructure()
  const { getAbsenceCounts } = useAttendance()
  const { getMarksForStudentSubject } = useMarks()
  const { homework } = useHomework()
  const { watchStudent, interventionsFor } = useIntervention()

  const [earlyWarning, setEarlyWarning] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingExtra, setLoadingExtra] = useState(true)

  const student = allUsers.find((u) => u.id === studentUid)

  useEffect(() => {
    if (studentUid) watchStudent(studentUid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUid])

  useEffect(() => {
    if (!studentUid || !session) return
    setLoadingExtra(true)
    Promise.all([
      getDoc(doc(db, 'earlyWarnings', studentUid)),
      getDocs(query(collection(db, 'submissions'), where('schoolId', '==', session.schoolId), where('studentUid', '==', studentUid))),
    ]).then(([ewSnap, subSnap]) => {
      setEarlyWarning(ewSnap.exists() ? ewSnap.data() : null)
      setSubmissions(subSnap.docs.map((d) => d.data()))
    }).finally(() => setLoadingExtra(false))
  }, [studentUid, session])

  if (session.role !== 'admin') {
    return <p style={{ color: 'var(--ink-soft)' }}>هاي الصفحة للإدارة بس.</p>
  }
  if (!student) {
    return <p style={{ color: 'var(--ink-soft)' }}>{loadingExtra ? 'عم نحمّل...' : 'ما لقينا هيدا الطالب.'}</p>
  }

  const section = sections.find((s) => s.id === student.sectionId)
  const grade = grades.find((g) => g.id === section?.gradeId)
  const sectionSubjects = subjects.filter((s) => s.sectionId === student.sectionId)
  const { unexcused, excused } = getAbsenceCounts(studentUid)
  const interventions = interventionsFor(studentUid)

  const studentHomework = homework.filter((h) => sectionSubjects.some((s) => s.id === h.courseId))
  const submittedIds = new Set(submissions.map((s) => s.homeworkId))
  const missingHomework = studentHomework.filter((h) => {
    const deadlineMs = h.deadline?.toMillis?.() ?? new Date(h.deadline).getTime()
    return !submittedIds.has(h.id) && deadlineMs < Date.now()
  })
  const procrastination = computeProcrastinationPattern(
    submissions.map((s) => {
      const hw = studentHomework.find((h) => h.id === s.homeworkId)
      return { deadline: hw?.deadline?.toMillis?.(), submittedAt: s.submittedAt?.toMillis?.() }
    })
  )

  return (
    <div>
      <Link to="/app/admin/insights" style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}><i className="ti ti-arrow-right" /> رجوع للوحات الشرف والإنذار</Link>
      <div className="eyebrow" style={{ marginTop: '10px' }}>ملف طالب</div>
      <h2 className="page-title" style={{ marginBottom: '4px' }}>{student.name}</h2>
      <p style={{ color: 'var(--ink-faint)', fontSize: '13px', marginBottom: '20px' }}>
        {grade?.name} — {section?.name}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="panel">
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>المعدل العام</div>
          <div style={{ fontSize: '20px', fontWeight: 800 }}>{earlyWarning?.average != null ? `${Math.round(earlyWarning.average)}%` : '—'}</div>
        </div>
        <div className="panel">
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>الغياب</div>
          <div style={{ fontSize: '20px', fontWeight: 800 }}>{unexcused} بدون عذر / {excused} بعذر</div>
        </div>
        <div className="panel">
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>واجبات متأخرة</div>
          <div style={{ fontSize: '20px', fontWeight: 800 }}>{missingHomework.length}</div>
        </div>
        <div className="panel">
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>نمط التسويف</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: procrastination.isPattern ? 'var(--berry)' : undefined }}>
            {procrastination.isPattern ? 'ملحوظ' : 'ما في'}
          </div>
        </div>
      </div>

      {earlyWarning && (earlyWarning.attendanceAlert || earlyWarning.averageAlert || earlyWarning.subjectAlerts?.length > 0) && (
        <div className="panel" style={{ marginBottom: '20px', borderColor: 'var(--berry)' }}>
          <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--berry)' }}><i className="ti ti-alert-triangle" /> إنذار مبكر نشط</div>
          <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {earlyWarning.attendanceAlert && <span>غياب مرتفع</span>}
            {earlyWarning.averageAlert && <span>معدل عام منخفض</span>}
            {(earlyWarning.subjectAlerts || []).map((s) => <span key={s.subjectId}>خطر رسوب بمادة {s.subjectName}: {s.totalScore}/{s.totalMax}</span>)}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, marginBottom: '10px' }}>العلامات المسجّلة</div>
        {sectionSubjects.length === 0 ? <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>ما في مواد لهاي الشعبة بعد.</p> : (
          sectionSubjects.map((subj) => {
            const marks = getMarksForStudentSubject(studentUid, subj.id)
            const cats = categoriesFor(subj)
            return (
              <div key={subj.id} style={{ fontSize: '12.5px', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <strong>{subj.name}</strong>{' '}
                {marks.length === 0 ? <span style={{ color: 'var(--ink-faint)' }}>— بدون علامات مسجّلة يدويًا بعد</span> : (
                  marks.map((m) => (
                    <span key={m.id} style={{ marginInlineStart: '10px' }}>
                      {cats.find((c) => c.id === m.categoryId)?.label || m.categoryId}: {m.score}/{m.maxScore}
                    </span>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="eyebrow" style={{ marginTop: '8px' }}>خطط التدخل</div>
      <h3 className="page-title" style={{ fontSize: '18px', marginBottom: '14px' }}>المتابعة والتدخلات</h3>

      {interventions.map((iv) => <InterventionCard key={iv.id} intervention={iv} />)}

      <InterventionForm
        studentUid={studentUid} studentName={student.name}
        defaultRisk={earlyWarning?.averageAlert || earlyWarning?.subjectAlerts?.length > 0 ? 'high' : earlyWarning?.attendanceAlert ? 'medium' : 'low'}
        defaultReason={earlyWarning?.attendanceAlert ? 'غياب متكرر' : earlyWarning?.averageAlert ? 'معدل عام منخفض' : ''}
      />
    </div>
  )
}
