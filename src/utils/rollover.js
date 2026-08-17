export function normalizeSectionName(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function buildRolloverKey({ schoolId, currentAcademicYear, newYear, sourceSectionId, newGradeId, name }) {
  return [
    schoolId,
    currentAcademicYear || '',
    newYear.trim(),
    sourceSectionId,
    newGradeId,
    normalizeSectionName(name),
  ].join('|')
}

export function rolloverSectionDocId(idempotencyKey) {
  return `rollover_${encodeURIComponent(idempotencyKey)}`
}
