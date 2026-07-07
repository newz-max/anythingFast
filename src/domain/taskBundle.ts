import type { TaskExportBundle, TaskItem, TaskTemplate } from '@/types/domain'

export function createTaskBundleFallback(
  tasks: TaskItem[],
  templates: TaskTemplate[] = [],
  now: () => Date = () => new Date()
): TaskExportBundle {
  return {
    schemaVersion: 1,
    exportedAt: now().toISOString(),
    sourceApp: 'anything-fast',
    tasks,
    templates
  }
}
