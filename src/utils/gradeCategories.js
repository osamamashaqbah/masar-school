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

// معدل الطالب عبر مواده = متوسط نسبة كل مادة فيها علامات فعلية، أو null إذا ما في أي مادة عندها علامات
export function computeStudentAverage(subjects, studentUid, getMark, getStudentStats) {
  const pcts = subjects
    .map((s) => computeSubjectTotal(s, studentUid, getMark, getStudentStats))
    .filter((t) => t.totalMax > 0)
    .map((t) => (t.totalScore / t.totalMax) * 100)
  if (pcts.length === 0) return null
  return pcts.reduce((a, b) => a + b, 0) / pcts.length
}

// هل انحطّت علامات الاختبار الأول والثاني والنهائي بمادة معينة — شرط تفعيل إنذار الرسوب بهاي المادة
export function hasCoreExamsEntered(subject, studentUid, getMark) {
  return ['exam1', 'exam2', 'final'].every((catId) => getMark(studentUid, subject.id, catId) !== null)
}