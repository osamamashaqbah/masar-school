import { useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../context/SessionContext'
import { useSchoolStructure } from '../context/SchoolStructureContext'
import { useMarks } from '../context/MarksContext'
import { useQuizStats } from '../context/QuizStatsContext'
import { useAttendance } from '../context/AttendanceContext'
import { aggregateMark, computeSubjectTotal, computeStudentAverage, hasCoreExamsEntered } from '../utils/gradeCategories'
import { evaluateEarlyWarning, rankTop } from '../utils/earlyWarningRules'

export default function AdminInsightsPage() {
  const { session } = useSession()
  const { grades, sections, subjects, allUsers, currentAcademicYear } = useSchoolStructure()
  const { refreshAdminMarks } = useMarks()
  const { getStudentStats } = useQuizStats()
  const { refreshSchoolAbsences } = useAttendance()

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const students = allUsers.filter((u) => u.role === 'student')

  async function handleRecompute() {
    setRunning(true)
    setError('')
    try {
      // علامات وغياب المدرسة ما عادت real-time (توفير قراءات) — نجيب أحدث نسخة قبل الحساب مباشرة.
      // منستخدم الصفوف المرجعة هون مباشرة (مش state تبع الـ context) لأنه setState بعد await
      // ما بينعكس بنفس التشغيلة الحالية — الاعتماد عليه كان رح يحسب على بيانات قديمة
      const [freshMarks, freshAbsences] = await Promise.all([refreshAdminMarks(), refreshSchoolAbsences()])

      const workerUrl = import.meta.env.VITE_ADMIN_OPS_WORKER_URL?.replace(/\/$/, '')
      const idToken = await auth.currentUser?.getIdToken()
      if (!workerUrl || !idToken) throw new Error('خدمة المؤشرات الموثوقة غير مضبوطة')
      const statsResponse = await fetch(`${workerUrl}/refresh-platform-stats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!statsResponse.ok) throw new Error(`refresh-platform-stats ${statsResponse.status}`)

      function localGetMark(uid, subjectId, categoryId) {
        return aggregateMark(freshMarks.filter((m) => m.studentUid === uid && m.subjectId === subjectId
          && (!m.academicYear || m.academicYear === currentAcademicYear)), categoryId)
      }
      function localGetAbsenceCounts(uid) {
        const rows = freshAbsences.filter((a) => a.studentUid === uid && (!a.academicYear || a.academicYear === currentAcademicYear))
        return { unexcused: rows.filter((a) => !a.excused).length, excused: rows.filter((a) => a.excused).length }
      }

      // لكل طالب: نحسب معدله، تحاليل الغياب، وحالة كل مادة — ونكتب النتيجة (بدون علامات خام) بـ earlyWarnings
      const perStudent = students.map((student) => {
        const studentSubjects = subjects.filter((s) => s.sectionId === student.sectionId)
        const subjectTotals = studentSubjects.map((s) => {
          const { totalScore, totalMax } = computeSubjectTotal(s, student.id, localGetMark, getStudentStats)
          return { subjectId: s.id, subjectName: s.name, totalScore, totalMax, coreExamsEntered: hasCoreExamsEntered(s, student.id, localGetMark) }
        })
        const average = computeStudentAverage(studentSubjects, student.id, localGetMark, getStudentStats)
        const { unexcused, excused } = localGetAbsenceCounts(student.id)
        const { attendanceAlert, subjectAlerts } = evaluateEarlyWarning({
          unexcusedCount: unexcused, excusedCount: excused, subjectTotals,
        })
        const instructorUids = [...new Set(studentSubjects.map((subject) => subject.teacherUid).filter(Boolean))]
        return { student, average, unexcused, excused, attendanceAlert, subjectAlerts, instructorUids }
      })

      await Promise.all(
        perStudent.map(({ student, average, unexcused, excused, attendanceAlert, subjectAlerts, instructorUids }) =>
          setDoc(doc(db, 'earlyWarnings', student.id), {
            studentUid: student.id,
            schoolId: session.schoolId,
            sectionId: student.sectionId || null,
            instructorUids,
            attendanceAlert, unexcusedCount: unexcused, excusedCount: excused,
            averageAlert: false, average,
            subjectAlerts,
            updatedAt: Date.now(),
          })
        )
      )

      // لوحة شرف كل شعبة — أعلى 14 طالب
      const sectionBoards = sections.map((section) => {
        const sectionStudents = perStudent
          .filter((p) => p.student.sectionId === section.id)
          .map((p) => ({ studentUid: p.student.id, studentName: p.student.name, average: p.average }))
        return { section, top: rankTop(sectionStudents, 14) }
      })
      await Promise.all(
        sectionBoards.map(({ section, top }) =>
          setDoc(doc(db, 'honorBoards', `${session.schoolId}_section_${section.id}`), { schoolId: session.schoolId, sectionId: section.id, top, updatedAt: Date.now() })
        )
      )

      // لوحة شرف الطلاب على مستوى المدرسة كلها — أعلى 10
      const schoolStudentsBoard = rankTop(
        perStudent.map((p) => ({
          studentUid: p.student.id,
          studentName: p.student.name,
          sectionName: sections.find((s) => s.id === p.student.sectionId)?.name || '',
          average: p.average,
        })),
        10
      )
      await setDoc(doc(db, 'honorBoards', `${session.schoolId}_top_students`), { schoolId: session.schoolId, top: schoolStudentsBoard, updatedAt: Date.now() })

      // لوحة شرف الشعب على مستوى المدرسة — أعلى 5 (معدل الشعبة = متوسط معدلات طلابها يلي عندهم علامات)
      const schoolSectionsBoard = rankTop(
        sections.map((section) => {
          const sectionStudentsAvgs = perStudent
            .filter((p) => p.student.sectionId === section.id && p.average !== null)
            .map((p) => p.average)
          const sectionAverage = sectionStudentsAvgs.length > 0
            ? sectionStudentsAvgs.reduce((a, b) => a + b, 0) / sectionStudentsAvgs.length
            : null
          return {
            sectionId: section.id,
            sectionName: section.name,
            gradeName: grades.find((g) => g.id === section.gradeId)?.name || '',
            average: sectionAverage,
          }
        }),
        5
      )
      await setDoc(doc(db, 'honorBoards', `${session.schoolId}_top_sections`), { schoolId: session.schoolId, top: schoolSectionsBoard, updatedAt: Date.now() })

      setResult({
        flaggedCount: perStudent.filter((p) => p.attendanceAlert || p.subjectAlerts.length > 0).length,
        totalCount: perStudent.length,
        flagged: perStudent.filter((p) => p.attendanceAlert || p.subjectAlerts.length > 0),
      })
    } catch (err) {
      setError(`صار خطأ وقت التحديث: ${err.code || err.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">لوحات الشرف والإنذار المبكر</div>
          <h2 className="page-title">تحديث المؤشرات</h2>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleRecompute} disabled={running}>
          {running ? <i className="ti ti-loader-2 spin" /> : <><i className="ti ti-refresh" /> تحديث الآن</>}
        </button>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: '13px', maxWidth: '560px' }}>
        اضغط "تحديث الآن" بنهاية كل فصل (أو أي وقت بدك تشوف الوضع الحالي) — بيحسب معدلات كل الطلاب،
        لوحات الشرف الثلاث، ويحدّث الإنذار المبكر لكل طالب معرّض للخطر.
      </p>

      {error && <p className="auth-error">{error}</p>}

      {result && (
        <div className="panel card-hover-lift animate-stagger" style={{ marginTop: '18px', maxWidth: '640px' }}>
          <div style={{ fontWeight: 800, marginBottom: '10px' }}>
            {result.flaggedCount} من {result.totalCount} طالب عندهم إنذار
          </div>
          {result.flagged.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>ولا طالب عنده إنذار حاليًا. 🎉</p>
          ) : (
            result.flagged.map(({ student, attendanceAlert, subjectAlerts, unexcused, excused }) => (
              <div key={student.id} className="analytics-row" style={{ marginBottom: '10px' }}>
                <div className="analytics-title">
                  {student.name}{' '}
                  <Link to={`/app/admin/students/${student.id}`} style={{ fontSize: '11.5px', fontWeight: 400 }}>
                    <i className="ti ti-external-link" /> عرض الملف الكامل
                  </Link>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {attendanceAlert && <span><i className="ti ti-calendar-x" /> غياب: {unexcused} بدون عذر، {excused} بعذر</span>}
                  {subjectAlerts.map((s) => (
                    <span key={s.subjectId}><i className="ti ti-alert-triangle" /> خطر رسوب بمادة {s.subjectName}: {s.totalScore}/{s.totalMax}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
