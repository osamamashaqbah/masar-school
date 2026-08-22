import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../context/SessionContext'
import { useSchoolStructure } from '../../context/SchoolStructureContext'
import { useHomework } from '../../context/HomeworkContext'
import { useMarks } from '../../context/MarksContext'
import { firestoreErrorMessage } from '../../utils/firestoreErrors'
import { safeHttpUrl } from '../../utils/parseMaterialUrl'

const STATUS_LABELS = {
  submitted: 'بانتظار المراجعة',
  returned: 'رجّعتها للطالب',
  resubmitted: 'أعاد الطالب التسليم',
  graded: 'تم التقييم',
}

export default function InstructorGradeHomeworkPage() {
  const { session } = useSession()
  const { subjects } = useSchoolStructure()
  const { homework, returnHomework, markSubmissionGraded } = useHomework()
  const { setMarkValue } = useMarks()

  const [submissions, setSubmissions] = useState([])
  const [scores, setScores] = useState({})       // sub.id -> الدرجة
  const [maxScores, setMaxScores] = useState({}) // sub.id -> من كم
  const [comments, setComments] = useState({})   // sub.id -> ملاحظة الإرجاع
  const [busyIds, setBusyIds] = useState({})
  const [actionErrors, setActionErrors] = useState({}) // sub.id -> رسالة خطأ آخر عملية فشلت عليه

  const mySubjectIds = subjects.filter((s) => s.teacherUid === session.uid).map((s) => s.id)
  const myHomework = homework.filter((h) => mySubjectIds.includes(h.courseId))
  const myHomeworkIds = myHomework.map((h) => h.id)

  // بدون where() هون Firestore بيرفض الاستعلام كامل (permission-denied) لأي معلّم عادي — القاعدة
  // بتعتمد على homeworkId/studentUid لكل وثيقة، فمستحيل تتأكد القاعدة إنه الاستعلام المفتوح آمن.
  // فبنحدد الاستعلام بـ homeworkId ضمن واجبات هالمعلّم فقط — نفس الحقل إلي القاعدة أصلاً بتتحقق منه.
  // 'in' فيها حد أقصى 30 قيمة بـ Firestore، فبنقسّم القائمة لدفعات ومنستمع لكل دفعة لحالها.
  useEffect(() => {
    if (myHomeworkIds.length === 0) { setSubmissions([]); return }

    const chunks = []
    for (let i = 0; i < myHomeworkIds.length; i += 30) chunks.push(myHomeworkIds.slice(i, i + 30))

    const resultsByChunk = chunks.map(() => [])
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(query(collection(db, 'submissions'), where('homeworkId', 'in', chunk)), (snap) => {
        resultsByChunk[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setSubmissions(resultsByChunk.flat())
      })
    )
    return () => unsubs.forEach((unsub) => unsub())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHomeworkIds.join(',')])

  async function handleGrade(sub, hw) {
    const score = scores[sub.id]
    const max = maxScores[sub.id]
    if (score === '' || score === undefined || max === '' || max === undefined) return
    const numericScore = Number(score)
    const numericMax = Number(max)
    if (!Number.isFinite(numericScore) || !Number.isFinite(numericMax) || numericMax <= 0 || numericScore < 0 || numericScore > numericMax) {
      setActionErrors((p) => ({ ...p, [sub.id]: 'الدرجة لازم تكون بين صفر والحد الأعلى.' }))
      return
    }
    setBusyIds((p) => ({ ...p, [sub.id]: true }))
    setActionErrors((p) => ({ ...p, [sub.id]: null }))
    try {
      await setMarkValue(hw.courseId, sub.studentUid, 'homework', numericScore, numericMax, hw.id)
      await markSubmissionGraded(sub.id)
    } catch (err) {
      // بدون catch هون: لو فشلت setMarkValue أو markSubmissionGraded (صلاحية/شبكة)، السبينر كان
      // بس بيوقف من finally بدون أي رسالة — المعلّم بيفتكر الدرجة انحفظت وهي ممكن ما تكون انحفظت أصلاً
      setActionErrors((p) => ({ ...p, [sub.id]: firestoreErrorMessage(err, 'صار خطأ وقت حفظ الدرجة. تأكد وحاول مرة ثانية.') }))
    } finally {
      setBusyIds((p) => ({ ...p, [sub.id]: false }))
    }
  }

  async function handleReturn(sub) {
    const comment = (comments[sub.id] || '').trim()
    if (!comment) return
    setBusyIds((p) => ({ ...p, [sub.id]: true }))
    setActionErrors((p) => ({ ...p, [sub.id]: null }))
    try {
      await returnHomework(sub.id, comment)
      setComments((p) => ({ ...p, [sub.id]: '' }))
    } catch (err) {
      setActionErrors((p) => ({ ...p, [sub.id]: firestoreErrorMessage(err, 'صار خطأ وقت إرجاع الواجب. حاول مرة ثانية.') }))
    } finally {
      setBusyIds((p) => ({ ...p, [sub.id]: false }))
    }
  }

  return (
    <div>
      <div className="eyebrow">تقييم الواجبات</div>
      <h2 className="page-title" style={{ marginBottom: '16px' }}>راجع تسليمات طلابك</h2>

      {submissions.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>ما في تسليمات بعد.</p>
      ) : (
        <div className="analytics-list">
          {submissions.map((sub) => {
            const hw = myHomework.find((h) => h.id === sub.homeworkId)
            const graded = sub.status === 'graded'
            const busy = !!busyIds[sub.id]
            return (
              <div className="analytics-row" key={sub.id}>
                <div className="analytics-title">
                  {hw?.title}{' '}
                  <span className="tag" style={{ fontSize: '11px', marginRight: '6px' }}>{STATUS_LABELS[sub.status] || sub.status}</span>
                  {sub.attemptCount > 1 && <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}> — محاولة {sub.attemptCount}</span>}
                </div>
                {hw?.rubric && (
                  <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', margin: '2px 0', whiteSpace: 'pre-wrap' }}>
                    <i className="ti ti-list-check" /> {hw.rubric}
                  </p>
                )}
                <p style={{ fontSize: '13px', margin: '4px 0' }}>
                  {safeHttpUrl(sub.url) ? <a href={safeHttpUrl(sub.url)} target="_blank" rel="noopener noreferrer">شوف الإجابة المسلّمة</a> : <span style={{ color: 'var(--ink-faint)' }}>رابط الإجابة غير صالح</span>}
                </p>
                {graded ? (
                  <span className="tag tag-pine">تم التقييم</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number" min="0" placeholder="الدرجة"
                        style={{ width: '80px' }}
                        value={scores[sub.id] || ''}
                        onChange={(e) => setScores((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <span>/</span>
                      <input
                        type="number" min="1" placeholder="من كم"
                        style={{ width: '80px' }}
                        value={maxScores[sub.id] || ''}
                        onChange={(e) => setMaxScores((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <button className="btn btn-accent" disabled={busy} onClick={() => handleGrade(sub, hw)}>حفظ الدرجة</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text" placeholder="ملاحظة لإرجاع الواجب للطالب لإعادة التسليم..."
                        style={{ minWidth: '220px', flex: 1 }}
                        value={comments[sub.id] || ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                      />
                      <button className="btn" disabled={busy || !(comments[sub.id] || '').trim()} onClick={() => handleReturn(sub)}>
                        <i className="ti ti-arrow-back-up" /> إرجاع لإعادة التسليم
                      </button>
                    </div>
                    {actionErrors[sub.id] && <p className="auth-error" style={{ fontSize: '12px', margin: 0 }}>{actionErrors[sub.id]}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
