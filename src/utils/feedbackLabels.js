export const KIND_LABELS = {
  praise: 'إشادة',
  observation: 'ملاحظة عامة',
  concern: 'ملاحظة تحتاج انتباهًا',
  request: 'طلب متابعة',
  complaint: 'شكوى',
}

export const KIND_ICONS = {
  praise: 'ti-heart',
  observation: 'ti-eye',
  concern: 'ti-alert-triangle',
  request: 'ti-calendar-event',
  complaint: 'ti-flag',
}

export const CATEGORY_LABELS = {
  academic: 'أكاديمي',
  homework: 'واجبات',
  behavior: 'سلوك وانضباط',
  attendance: 'حضور وغياب',
  communication: 'تواصل',
  meeting: 'طلب اجتماع',
  administrative: 'إداري',
  complaint: 'شكوى',
  suggestion: 'اقتراح',
  safety: 'سلامة أو خصوصية',
  other: 'أخرى',
}

export const STATUS_LABELS = {
  open: 'جديدة',
  in_progress: 'قيد المتابعة',
  resolved: 'تم الحل',
  closed: 'مغلقة',
}

export const STATUS_COLORS = {
  open: 'var(--sunset)',
  in_progress: 'var(--gold, #b8860b)',
  resolved: 'var(--pine, #2e7d32)',
  closed: 'var(--ink-faint)',
}

export const IMPORTANCE_LABELS = {
  normal: 'عادية',
  important: 'مهمة',
}

export const QUICK_TEMPLATES = [
  'أظهر تحسنًا واضحًا هذا الأسبوع.',
  'أداء مميز في المشاركة الصفية.',
  'يحتاج متابعة الواجبات المنزلية.',
  'نرجو متابعة الغياب أو التأخر.',
  'نرغب بترتيب موعد للتواصل.',
]

export function routeLabel(route) {
  const map = {
    parent_to_teacher: 'إلى المعلّم',
    parent_to_admin: 'إلى الإدارة',
    teacher_to_parent: 'إلى ولي الأمر',
    admin_to_parent: 'إلى ولي الأمر',
  }
  return map[route] || route
}
