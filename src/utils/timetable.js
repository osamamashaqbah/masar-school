export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']
export const PERIODS = [1, 2, 3, 4, 5, 6, 7]

export function replaceTimetableSlot(slots, day, period, subjectId) {
  const nextSlots = slots.filter((slot) => !(slot.day === day && slot.period === period))
  if (subjectId) nextSlots.push({ day, period, subjectId })
  return nextSlots
}
