import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskImportExport } from '@/composables/useTaskImportExport'
import type { tauriApi } from '@/api/tauri'
import type { useTaskStore } from '@/stores/taskStore'
import type { AppConfig, ImportPreview, TaskTemplate } from '@/types/domain'
import type { MessageApi } from 'naive-ui'

type TaskStore = ReturnType<typeof useTaskStore>

function makePreview(): ImportPreview {
  return {
    schemaVersion: 1,
    validTaskCount: 1,
    templateCount: 0,
    totalActionCount: 1,
    riskSummary: { low: 1, medium: 0, high: 0, commandActions: 0 },
    conflictSummary: { taskIdsRegenerated: 0, actionIdsRegenerated: 0, templateIdsRegenerated: 0 },
    pathHints: [],
    tasks: [
      {
        id: 'task-imported',
        originalId: 'task-imported',
        name: '导入事项',
        actionTypes: ['delay'],
        actionCount: 1,
        riskLevel: 'low',
        commandActionCount: 0
      }
    ],
    templates: []
  }
}

function makeConfig(): AppConfig {
  return {
    version: 1,
    tasks: [],
    tags: [],
    templates: [],
    settings: {
      globalShortcut: 'Alt+Space',
      theme: 'system',
      launchOnStartup: false
    }
  }
}

function makeTemplate(id: string): TaskTemplate {
  return {
    id,
    name: `模板 ${id}`,
    category: '工作',
    keywords: [],
    description: '',
    actions: [
      {
        type: 'delay',
        name: '等待',
        params: { durationMs: 1000 },
        enabled: true,
        riskLevel: 'low'
      }
    ]
  }
}

function makeHarness(savedTemplates: TaskTemplate[] = []) {
  const message = {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn()
  } as unknown as MessageApi
  const taskStore = {
    savedTemplates,
    replaceConfig: vi.fn()
  } as unknown as TaskStore
  const api = {
    previewImportBundleFile: vi.fn(),
    confirmImportBundleFile: vi.fn(),
    saveTaskBundleFile: vi.fn()
  }
  const openDialog = vi.fn()
  const saveDialog = vi.fn()
  const reportUiError = vi.fn()
  const controller = useTaskImportExport(
    { taskStore, message, reportUiError },
    {
      tauriApi: api as unknown as typeof tauriApi,
      openDialog,
      saveDialog,
      isTauriRuntime: vi.fn(() => true)
    }
  )

  return {
    api,
    controller,
    message,
    openDialog,
    reportUiError,
    saveDialog,
    taskStore
  }
}

describe('useTaskImportExport', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('warns instead of opening an import dialog outside the Tauri runtime', async () => {
    const harness = makeHarness()
    const controller = useTaskImportExport(
      {
        taskStore: harness.taskStore,
        message: harness.message,
        reportUiError: harness.reportUiError
      },
      {
        tauriApi: harness.api as unknown as typeof tauriApi,
        openDialog: harness.openDialog,
        saveDialog: harness.saveDialog,
        isTauriRuntime: vi.fn(() => false)
      }
    )

    await controller.openImportFile()

    expect(harness.message.warning).toHaveBeenCalledWith('导入文件需要在桌面应用中使用')
    expect(harness.openDialog).not.toHaveBeenCalled()
  })

  it('warns instead of opening export dialogs outside Tauri and for empty task exports', async () => {
    const nonTauri = makeHarness()
    const nonTauriController = useTaskImportExport(
      {
        taskStore: nonTauri.taskStore,
        message: nonTauri.message,
        reportUiError: nonTauri.reportUiError
      },
      {
        tauriApi: nonTauri.api as unknown as typeof tauriApi,
        openDialog: nonTauri.openDialog,
        saveDialog: nonTauri.saveDialog,
        isTauriRuntime: vi.fn(() => false)
      }
    )

    await nonTauriController.exportTaskBundle(['task-1'])

    expect(nonTauri.message.warning).toHaveBeenCalledWith('导出文件需要在桌面应用中使用')
    expect(nonTauri.saveDialog).not.toHaveBeenCalled()

    const emptyTasks = makeHarness()
    await emptyTasks.controller.exportTaskBundle([])

    expect(emptyTasks.message.warning).toHaveBeenCalledWith('没有可导出的事项')
    expect(emptyTasks.saveDialog).not.toHaveBeenCalled()
  })

  it('warns when exporting saved templates with no saved templates', async () => {
    const harness = makeHarness()

    await harness.controller.exportSavedTemplates()

    expect(harness.message.warning).toHaveBeenCalledWith('没有可导出的已保存模板')
    expect(harness.saveDialog).not.toHaveBeenCalled()
  })

  it('loads preview and opens the preview modal after selecting an import file', async () => {
    const harness = makeHarness()
    const preview = makePreview()
    harness.openDialog.mockResolvedValue('D:\\bundle.json')
    harness.api.previewImportBundleFile.mockResolvedValue(preview)

    await harness.controller.openImportFile()

    expect(harness.openDialog).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    expect(harness.api.previewImportBundleFile).toHaveBeenCalledWith('D:\\bundle.json')
    expect(harness.controller.importFilePath.value).toBe('D:\\bundle.json')
    expect(harness.controller.importPreview.value).toBe(preview)
    expect(harness.controller.importPreviewVisible.value).toBe(true)
  })

  it('does not change import state when file selection is cancelled', async () => {
    const harness = makeHarness()
    const preview = makePreview()
    harness.controller.importFilePath.value = 'D:\\previous.json'
    harness.controller.importPreview.value = preview
    harness.controller.importPreviewVisible.value = true
    harness.openDialog.mockResolvedValue(null)

    await harness.controller.openImportFile()

    expect(harness.controller.importFilePath.value).toBe('D:\\previous.json')
    expect(harness.controller.importPreview.value).toBe(preview)
    expect(harness.controller.importPreviewVisible.value).toBe(true)
    expect(harness.api.previewImportBundleFile).not.toHaveBeenCalled()
  })

  it('replaces config and clears import state after successful import confirmation', async () => {
    const harness = makeHarness()
    const preview = makePreview()
    const nextConfig = makeConfig()
    harness.controller.importFilePath.value = 'D:\\bundle.json'
    harness.controller.importPreview.value = preview
    harness.controller.importPreviewVisible.value = true
    harness.api.confirmImportBundleFile.mockResolvedValue(nextConfig)

    await harness.controller.confirmImport()

    expect(harness.api.confirmImportBundleFile).toHaveBeenCalledWith('D:\\bundle.json')
    expect(harness.taskStore.replaceConfig).toHaveBeenCalledWith(nextConfig)
    expect(harness.controller.importPreviewVisible.value).toBe(false)
    expect(harness.controller.importPreview.value).toBeNull()
    expect(harness.controller.importFilePath.value).toBe('')
    expect(harness.controller.importConfirming.value).toBe(false)
    expect(harness.message.success).toHaveBeenCalledWith('已导入配置')
  })

  it('reports errors and resets confirming state after failed import confirmation', async () => {
    const harness = makeHarness()
    const err = new Error('bad bundle')
    harness.controller.importFilePath.value = 'D:\\bundle.json'
    harness.api.confirmImportBundleFile.mockRejectedValue(err)

    await harness.controller.confirmImport()

    expect(harness.reportUiError).toHaveBeenCalledWith('Confirm import failed', err)
    expect(harness.controller.importConfirming.value).toBe(false)
  })

  it('exports saved templates with their template identifiers', async () => {
    const harness = makeHarness([makeTemplate('template-a'), makeTemplate('template-b')])
    harness.saveDialog.mockResolvedValue('D:\\templates.json')

    await harness.controller.exportSavedTemplates()

    expect(harness.api.saveTaskBundleFile).toHaveBeenCalledWith(
      { taskIds: [], templateIds: ['template-a', 'template-b'] },
      'D:\\templates.json'
    )
    expect(harness.message.success).toHaveBeenCalledWith('已导出模板 JSON')
  })
})
