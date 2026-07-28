// افتراضي — ممكن يصير قابل للتخصيص لكل مدرسة لاحقًا (schools/{id}.earlyWarningThresholds)
export const DEFAULT_THRESHOLDS = {
  unexcusedMax: 15,
  excusedMax: 5,
  averageMin: 60,
  subjectFailMin: 50,
}

// منطق الإنذار المبكر الثلاثي: غياب، رسوب بمادة معينة (بعد اكتمال الاختبار الأول+الثاني+النهائي)، معدل عام
export function evaluateEarlyWarning({ unexcusedCount, excusedCount, average, subjectTotals }, thresholds = DEFAULT_THRESHOLDS) {
  const attendanceAlert = unexcusedCount > thresholds.unexcusedMax || excusedCount > thresholds.excusedMax
  const averageAlert = average !== null && average < thresholds.averageMin
  const subjectAlerts = subjectTotals.filter(
    (t) => t.coreExamsEntered && t.totalMax > 0 && t.totalScore < thresholds.subjectFailMin
  )
  return { attendanceAlert, averageAlert, subjectAlerts }
}

// أعلى n عنصر بترتيب تنازلي حسب average (يستخدم للوحتي الشرف: طلاب وشعب)
export function rankTop(entries, n) {
  return entries
    .filter((e) => e.average !== null && e.average !== undefined)
    .slice()
    .sort((a, b) => b.average - a.average)
    .slice(0, n)
}
