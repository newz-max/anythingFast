import type { DropdownOption, MessageApi } from 'naive-ui'
import type { Ref } from 'vue'
import { tauriApi } from '@/api/tauri'
import { createTaskBundleFallback } from '@/domain/taskBundle'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'
import type { TaskItem } from '@/types/domain'

export const taskShareActionKeys = {
  copySummary: 'copy-summary',
  copyJson: 'copy-json',
  exportCurrent: 'export-current',
  exportVisible: 'export-visible',
  importJson: 'import-json'
} as const

export type TaskShareActionKey = (typeof taskShareActionKeys)[keyof typeof taskShareActionKeys]

export const taskShareOptions: DropdownOption[] = [
  { label: '复制事项摘要', key: taskShareActionKeys.copySummary },
  { label: '复制事项配置 JSON', key: taskShareActionKeys.copyJson },
  { label: '导出当前事项 JSON', key: taskShareActionKeys.exportCurrent },
  { label: '导出当前列表 JSON', key: taskShareActionKeys.exportVisible },
  { label: '导入配置 JSON', key: taskShareActionKeys.importJson }
]

export interface UseTaskSharingOptions {
  selectedTask: Ref<TaskItem | null>
  getVisibleTasks: () => TaskItem[]
  exportTaskBundle: (taskIds: string[]) => Promise<void>
  openImportFile: () => Promise<void>
  message: MessageApi
}

export interface UseTaskSharingDeps {
  tauriApi?: Pick<typeof tauriApi, 'exportTaskBundle'>
  isTauriRuntime?: () => boolean
  copyText?: (text: string) => Promise<void>
  now?: () => Date
}

export function useTaskSharing(options: UseTaskSharingOptions, deps: UseTaskSharingDeps = {}) {
  const api = deps.tauriApi ?? tauriApi
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  const copyText = deps.copyText ?? copyTextToClipboard
  const now = deps.now ?? (() => new Date())

  async function handleShareSelect(key: string | number) {
    const task = options.selectedTask.value
    if (!task) return

    if (key === taskShareActionKeys.copySummary) {
      await copyText(createTaskSummary(task))
      options.message.success('已复制事项摘要')
      return
    }

    if (key === taskShareActionKeys.copyJson) {
      const bundle = isTauriRuntime()
        ? await api.exportTaskBundle({ taskIds: [task.id], templateIds: [] })
        : createTaskBundleFallback([task], [], now)
      await copyText(JSON.stringify(bundle, null, 2))
      options.message.success('已复制事项配置 JSON')
      return
    }

    if (key === taskShareActionKeys.exportCurrent) {
      await options.exportTaskBundle([task.id])
      return
    }

    if (key === taskShareActionKeys.exportVisible) {
      await options.exportTaskBundle(options.getVisibleTasks().map((item) => item.id))
      return
    }

    if (key === taskShareActionKeys.importJson) {
      await options.openImportFile()
    }
  }

  return {
    shareOptions: taskShareOptions,
    handleShareSelect
  }
}

export function createTaskSummary(task: TaskItem) {
  return [
    `事项：${task.name}`,
    `分类：${task.category || '未分类'}`,
    `描述：${task.description || '无'}`,
    `动作数：${task.actions.length}`,
    `风险等级：${task.riskLevel}`
  ].join('\n')
}

async function copyTextToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}
