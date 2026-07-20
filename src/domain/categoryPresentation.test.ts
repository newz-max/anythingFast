import { describe, expect, it } from 'vitest'
import { categoryTone } from '@/domain/categoryPresentation'

describe('category presentation', () => {
  it.each([
    ['工作', 'blue'],
    [' 学习 ', 'green'],
    ['生活', 'amber'],
    ['其他', 'purple']
  ] as const)('maps built-in category %s to %s', (category, expected) => {
    expect(categoryTone(category)).toBe(expected)
  })

  it.each([undefined, '', '   ', '自定义'])('uses the fallback tone for category %j', (category) => {
    expect(categoryTone(category)).toBe('slate')
  })
})
