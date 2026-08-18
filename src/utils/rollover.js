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

export function rolloverOperationDocId({ schoolId, currentAcademicYear, newYear }) {
  return `operation_${encodeURIComponent(buildRolloverKey({
    schoolId,
    currentAcademicYear,
    newYear,
    sourceSectionId: 'all-sections',
    newGradeId: 'all-grades',
    name: 'student-move',
  }))}`
}
