const LAST_MINUTE_HOURS = 2 // أقل من ساعتين قبل الموعد النهائي = "بآخر لحظة"
const MIN_SUBMISSIONS = 3 // ما منحكم على نمط من واجب أو اثنين، لازم عيّنة معقولة
const LAST_MINUTE_RATIO = 0.6 // 60% أو أكتر من التسليمات بآخر لحظة = نمط، مش مصادفة

// بياخد لستة {deadline, submittedAt} (Date أو ms) ويرجع {isPattern, lastMinuteCount, total, ratio}
export function computeProcrastinationPattern(pairs) {
  const withBoth = pairs.filter((p) => p.deadline && p.submittedAt)
  if (withBoth.length < MIN_SUBMISSIONS) return { isPattern: false, lastMinuteCount: 0, total: withBoth.length, ratio: 0 }

  const lastMinuteCount = withBoth.filter((p) => {
    const deadlineMs = p.deadline instanceof Date ? p.deadline.getTime() : p.deadline
    const submittedMs = p.submittedAt instanceof Date ? p.submittedAt.getTime() : p.submittedAt
    const hoursBefore = (deadlineMs - submittedMs) / (1000 * 60 * 60)
    return hoursBefore >= 0 && hoursBefore <= LAST_MINUTE_HOURS
  }).length

  const ratio = lastMinuteCount / withBoth.length
  return { isPattern: ratio >= LAST_MINUTE_RATIO, lastMinuteCount, total: withBoth.length, ratio }
}
