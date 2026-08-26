export function taughtSectionsForInstructors(users, subjects) {
  const sectionsByInstructor = new Map()
  subjects.forEach((subject) => {
    if (!subject.teacherUid || !subject.sectionId) return
    const sections = sectionsByInstructor.get(subject.teacherUid) || new Set()
    sections.add(subject.sectionId)
    sectionsByInstructor.set(subject.teacherUid, sections)
  })

  return users
    .filter((user) => user.role === 'instructor')
    .map((user) => ({ uid: user.id, sectionIds: [...(sectionsByInstructor.get(user.id) || [])].sort() }))
}
