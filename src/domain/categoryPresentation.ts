import { normalizeTaskCategory } from '@/domain/taskCategories'

export type CategoryTone = 'blue' | 'green' | 'amber' | 'purple' | 'slate'

export function categoryTone(categoryName?: string): CategoryTone {
  const normalized = normalizeTaskCategory(categoryName)
  if (normalized === '工作') return 'blue'
  if (normalized === '学习') return 'green'
  if (normalized === '生活') return 'amber'
  if (normalized === '其他') return 'purple'
  return 'slate'
}
