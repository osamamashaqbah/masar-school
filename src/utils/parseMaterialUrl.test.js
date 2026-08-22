import { describe, expect, it } from 'vitest'
import { parseMaterialUrl, safeHttpUrl } from './parseMaterialUrl'

describe('parseMaterialUrl', () => {
  it('accepts HTTP(S) URLs and recognizes supported embeds', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(parseMaterialUrl('https://youtu.be/abc123_')).toEqual({ type: 'youtube', embedUrl: 'https://www.youtube.com/embed/abc123_' })
  })

  it('rejects executable, relative, and malformed URLs', () => {
    expect(parseMaterialUrl('javascript:alert(1)').type).toBe('invalid')
    expect(parseMaterialUrl('data:text/html,<script>alert(1)</script>').type).toBe('invalid')
    expect(parseMaterialUrl('/uploads/file.pdf').type).toBe('invalid')
  })
})
