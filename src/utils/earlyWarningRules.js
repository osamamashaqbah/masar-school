// افتراضي — ممكن يصير قابل للتخصيص لكل مدرسة لاحقًا (schools/{id}.earlyWarningThresholds)
export const DEFAULT_THRESHOLDS = {
  unexcusedMax: 15,
  excusedMax: 5,
  subjectFailMin: 65,
}

// الإنذار الأكاديمي مبني على كل مادة لوحدها، وليس على معدل الطالب العام.
// شرط المادة الحالي: اكتمال الاختبارات الأساسية ثم نزول النسبة الفعلية عن الحد المحدد.
export function evaluateEarlyWarning({ unexcusedCount, excusedCount, subjectTotals }, thresholds = DEFAULT_THRESHOLDS) {
  const attendanceAlert = unexcusedCount > thresholds.unexcusedMax || excusedCount > thresholds.excusedMax
  const subjectAlerts = subjectTotals.filter(
    (t) => t.coreExamsEntered && t.totalMax > 0 && (t.totalScore / t.totalMax) * 100 < thresholds.subjectFailMin
  )
  // Kept as false for compatibility with already stored early-warning documents.
  return { attendanceAlert, averageAlert: false, subjectAlerts }
}

// أعلى n عنصر بترتيب تنازلي حسب average (يستخدم للوحتي الشرف: طلاب وشعب)
export function rankTop(entries, n) {
  return entries
    .filter((e) => e.average !== null && e.average !== undefined)
    .slice()
    .sort((a, b) => b.average - a.average)
    .slice(0, n)
}
