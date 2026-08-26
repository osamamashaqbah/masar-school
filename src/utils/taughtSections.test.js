import { describe, expect, it } from 'vitest'
import { taughtSectionsForInstructors } from './taughtSections'

describe('taughtSectionsForInstructors', () => {
  it('derives the exact active section set and removes stale assignments', () => {
    expect(taughtSectionsForInstructors(
      [{ id: 'teacherA', role: 'instructor' }, { id: 'teacherB', role: 'instructor' }, { id: 'studentA', role: 'student' }],
      [{ teacherUid: 'teacherA', sectionId: 'sec2' }, { teacherUid: 'teacherA', sectionId: 'sec1' }, { teacherUid: 'teacherA', sectionId: 'sec1' }],
    )).toEqual([
      { uid: 'teacherA', sectionIds: ['sec1', 'sec2'] },
      { uid: 'teacherB', sectionIds: [] },
    ])
  })
})
