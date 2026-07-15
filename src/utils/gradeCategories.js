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