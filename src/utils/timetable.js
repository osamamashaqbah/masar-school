export function replaceTimetableSlot(slots, day, period, subjectId) {
  const nextSlots = slots.filter((slot) => !(slot.day === day && slot.period === period))
  if (subjectId) nextSlots.push({ day, period, subjectId })
  return nextSlots
}
