import { describe, expect, it } from 'vitest'
import { chunkArray } from './chunk'

describe('chunkArray', () => {
  it('keeps every value across chunks', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
