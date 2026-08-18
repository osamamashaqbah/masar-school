export const DEFAULT_GRADE_CATEGORIES = [
  { id: 'quiz', label: 'اختبارات الدروس', weight: 10, auto: true },
  { id: 'homework', label: 'الواجبات', weight: 10, auto: true },
  { id: 'exam1', label: 'الاختبار الأول', weight: 15, auto: false },
  { id: 'exam2', label: 'الاختبار الثاني', weight: 15, auto: false },
  { id: 'continuous', label: 'التقويم المستمر', weight: 10, auto: false },
  { id: 'final', label: 'الاختبار النهائي', weight: 40, auto: false },
]

export function categoriesFor(subject) {
  return subject?.gradeCategories?.length ? subject.gradeCategories : DEFAULT_GRADE_CATEGORIES
}

// docId ثابت لكل طالب+مادة+فئة+سنة، إلا إذا الفئة جايه من واجب محدد (homeworkId) — عندها لازم يكون
// جزء من الـ docId حتى ما توصل درجات واجبات مختلفة لنفس الوثيقة وتكتب فوق بعض.
// academicYear اختياري فقط للتوافق مع العلامات القديمة التي لا تحتوي السنة داخل الـ docId.
export function markDocId(studentUid, subjectId, categoryId, homeworkId = null, academicYear = null) {
  const base = homeworkId
    ? `${studentUid}_${subjectId}_${categoryId}_${homeworkId}`
    : `${studentUid}_${subjectId}_${categoryId}`
  return academicYear ? `${base}_${academicYear}` : base
}

// بيجمع كل العلامات إلي إلها نفس categoryId (زي كل واجبات "الواجبات") لدرجة/من-كم إجمالية واحدة.
// فئة فيها سجل وحيد (متل exam1) بترجع نفس القيمة متل ما لو ما في تجميع أصلاً.
export function aggregateMark(marks, categoryId) {
  const valid = marks.filter((m) => m.categoryId === categoryId && typeof m.score === 'number' && typeof m.maxScore === 'number')
  if (valid.length === 0) return null
  return valid.reduce((acc, m) => ({ score: acc.score + m.score, maxScore: acc.maxScore + m.maxScore }), { score: 0, maxScore: 0 })
}

// {totalScore, totalMax} لمادة معينة لطالب معين — نفس حساب بطاقات الدرجات (مجرد جمع، بدون أوزان)
export function computeSubjectTotal(subject, studentUid, getMark, getStudentStats) {
  const categories = categoriesFor(subject)
  const { attempts, correct } = getStudentStats(studentUid, subject.id)
  let totalScore = 0
  let totalMax = 0
  categories.forEach((cat) => {
    if (cat.id === 'quiz') {
      if (attempts > 0) { totalScore += correct; totalMax += attempts }
      return
    }
    const mark = getMark(studentUid, subject.id, cat.id)
    if (mark) { totalScore += mark.score; totalMax += mark.maxScore }
  })
  return { totalScore, totalMax }
}

// معدل الطالب عبر مواده = متوسط نسبة كل المواد، والمادة التي لم تدخل علاماتها بعد تُحسب صفرًا.
export function computeStudentAverage(subjects, studentUid, getMark, getStudentStats) {
  if (subjects.length === 0) return null
  const pcts = subjects
    .map((s) => computeSubjectTotal(s, studentUid, getMark, getStudentStats))
    .map((t) => t.totalMax > 0 ? (t.totalScore / t.totalMax) * 100 : 0)
  return pcts.reduce((a, b) => a + b, 0) / pcts.length
}

export function computeAverageFromSubjectTotals(rows) {
  if (rows.length === 0) return null
  return rows.reduce((sum, row) => sum + (row.totalMax > 0 ? (row.totalScore / row.totalMax) * 100 : 0), 0) / rows.length
}

// هل انحطّت علامات الاختبار الأول والثاني والنهائي بمادة معينة — شرط تفعيل إنذار الرسوب بهاي المادة
export function hasCoreExamsEntered(subject, studentUid, getMark) {
  return ['exam1', 'exam2', 'final'].every((catId) => getMark(studentUid, subject.id, catId) !== null)
}
