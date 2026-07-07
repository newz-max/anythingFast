import { shallowRef, type Ref } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { MessageApi } from 'naive-ui'
import { tauriApi } from '@/api/tauri'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'
import type { useTaskStore } from '@/stores/taskStore'
import type { ImportPreview } from '@/types/domain'

type TaskStore = ReturnType<typeof useTaskStore>

export interface TaskImportExportController {
  importPreviewVisible: Ref<boolean>
  importPreview: Ref<ImportPreview | null>
  importFilePath: Ref<string>
  importConfirming: Ref<boolean>
  openImportFile: () => Promise<void>
  confirmImport: () => Promise<void>
  exportTaskBundle: (taskIds: string[]) => Promise<void>
  exportSavedTemplates: () => Promise<void>
}

export interface UseTaskImportExportOptions {
  taskStore: TaskStore
  message: MessageApi
  reportUiError: (context: string, err: unknown, details?: Record<string, unknown>) => void
}

export interface TaskImportExportDeps {
  tauriApi?: typeof tauriApi
  openDialog?: typeof open
  saveDialog?: typeof save
  isTauriRuntime?: () => boolean
}

export function useTaskImportExport(
  options: UseTaskImportExportOptions,
  deps: TaskImportExportDeps = {}
): TaskImportExportController {
  const api = deps.tauriApi ?? tauriApi
  const openDialog = deps.openDialog ?? open
  const saveDialog = deps.saveDialog ?? save
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime

  const importPreviewVisible = shallowRef(false)
  const importPreview = shallowRef<ImportPreview | null>(null)
  const importFilePath = shallowRef('')
  const importConfirming = shallowRef(false)

  async function openImportFile() {
    if (!isTauriRuntime()) {
      options.message.warning('导入文件需要在桌面应用中使用')
      return
    }
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!selected || Array.isArray(selected)) return
    importFilePath.value = selected
    importPreview.value = await api.previewImportBundleFile(selected)
    importPreviewVisible.value = true
  }

  async function confirmImport() {
    if (!importFilePath.value) return
    importConfirming.value = true
    try {
      const nextConfig = await api.confirmImportBundleFile(importFilePath.value)
      options.taskStore.replaceConfig(nextConfig)
      importPreviewVisible.value = false
      importPreview.value = null
      importFilePath.value = ''
      options.message.success('已导入配置')
    } catch (err) {
      options.reportUiError('Confirm import failed', err)
    } finally {
      importConfirming.value = false
    }
  }

  async function exportTaskBundle(taskIds: string[]) {
    if (!isTauriRuntime()) {
      options.message.warning('导出文件需要在桌面应用中使用')
      return
    }
    if (taskIds.length === 0) {
      options.message.warning('没有可导出的事项')
      return
    }
    const targetPath = await saveDialog({
      defaultPath: `anything-fast-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!targetPath) return
    await api.saveTaskBundleFile({ taskIds, templateIds: [] }, targetPath)
    options.message.success('已导出 JSON')
  }

  async function exportSavedTemplates() {
    if (!isTauriRuntime()) {
      options.message.warning('导出文件需要在桌面应用中使用')
      return
    }
    if (options.taskStore.savedTemplates.length === 0) {
      options.message.warning('没有可导出的已保存模板')
      return
    }
    const targetPath = await saveDialog({
      defaultPath: `anything-fast-templates-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!targetPath) return
    await api.saveTaskBundleFile(
      { taskIds: [], templateIds: options.taskStore.savedTemplates.map((template) => template.id) },
      targetPath
    )
    options.message.success('已导出模板 JSON')
  }

  return {
    importPreviewVisible,
    importPreview,
    importFilePath,
    importConfirming,
    openImportFile,
    confirmImport,
    exportTaskBundle,
    exportSavedTemplates
  }
}
