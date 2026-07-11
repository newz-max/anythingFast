import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { listenConfigUpdatedEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import { builtInTaskTemplates } from '@/domain/taskTemplates'
import { createDefaultConfig, normalizeConfig, normalizeTemplate } from '@/domain/taskFactory'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { getErrorMessage, logDevError } from '@/utils/errors'
import { isTauriRuntime } from '@/utils/tauriRuntime'
import type { AppConfig, AppSettings, TaskItem, TaskTag, TaskTemplate } from '@/types/domain'

export const useTaskStore = defineStore('tasks', () => {
  const config = shallowRef<AppConfig>(createDefaultConfig())
  const selectedTaskId = shallowRef<string | null>(null)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const error = shallowRef<string | null>(null)
  let configSyncUnlisten: UnlistenFn | null = null
  let configSyncReload: Promise<void> | null = null
  let configSyncQueued = false

  const tasks = computed(() => config.value.tasks)
  const tags = computed(() => config.value.tags)
  const savedTemplates = computed(() => config.value.templates)
  const templates = computed(() => [...builtInTaskTemplates, ...savedTemplates.value])
  const settings = computed(() => config.value.settings)
  const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) || null)
  const categories = computed(() => {
    const values = new Set(tasks.value.map((task) => task.category?.trim() || '未分类'))
    return ['全部', ...Array.from(values).sort((left, right) => left.localeCompare(right, 'zh-CN'))]
  })

  async function load() {
    await loadConfig({
      preserveSelectedTask: false,
      clearOnError: true,
      context: 'Load task config failed',
      throwOnError: false
    })
  }

  async function loadConfig(options: {
    preserveSelectedTask: boolean
    clearOnError: boolean
    context: string
    throwOnError: boolean
  }) {
    loading.value = true
    error.value = null
    const previousSelectedTaskId = selectedTaskId.value
    try {
      const nextConfig = normalizeConfig(isTauriRuntime() ? await tauriApi.loadConfig() : loadBrowserConfig())
      replaceConfig(nextConfig, options.preserveSelectedTask ? previousSelectedTaskId : undefined)
    } catch (err) {
      logDevError(options.context, err)
      error.value = getErrorMessage(err)
      if (options.clearOnError) {
        config.value = createDefaultConfig()
        selectedTaskId.value = null
      }
      if (options.throwOnError) {
        throw err
      }
    } finally {
      loading.value = false
    }
  }

  async function setupConfigSync() {
    if (!isTauriRuntime() || configSyncUnlisten) return
    try {
      configSyncUnlisten = await listenConfigUpdatedEvents(() => {
        void reloadFromConfigUpdate()
      })
    } catch (err) {
      logDevError('Setup config update listener failed', err)
      error.value = getErrorMessage(err)
      throw err
    }
  }

  function teardownConfigSync() {
    configSyncUnlisten?.()
    configSyncUnlisten = null
    configSyncQueued = false
  }

  function reloadFromConfigUpdate() {
    if (!isTauriRuntime()) return Promise.resolve()
    if (configSyncReload) {
      configSyncQueued = true
      return configSyncReload
    }

    configSyncReload = (async () => {
      do {
        configSyncQueued = false
        await loadConfig({
          preserveSelectedTask: true,
          clearOnError: false,
          context: 'Reload task config from update event failed',
          throwOnError: false
        })
      } while (configSyncQueued)
    })().finally(() => {
      configSyncReload = null
    })
    return configSyncReload
  }

  async function persist() {
    saving.value = true
    error.value = null
    try {
      const nextConfig = {
        ...config.value,
        tasks: config.value.tasks.map((task) => ({
          ...task,
          favorite: task.favorite ?? false,
          tagIds: task.tagIds || [],
          riskLevel: deriveTaskRisk(task),
          updatedAt: new Date().toISOString()
        })),
        templates: config.value.templates.map(normalizeTemplate)
      }
      config.value = normalizeConfig(isTauriRuntime() ? await tauriApi.saveConfig(nextConfig) : saveBrowserConfig(nextConfig))
    } catch (err) {
      logDevError('Persist task config failed', err)
      error.value = getErrorMessage(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function upsertTask(task: TaskItem) {
    const normalized = {
      ...task,
      category: task.category?.trim() || '未分类',
      favorite: task.favorite ?? false,
      tagIds: task.tagIds || [],
      riskLevel: deriveTaskRisk(task),
      updatedAt: new Date().toISOString()
    }
    const index = config.value.tasks.findIndex((item) => item.id === normalized.id)
    const tasks = [...config.value.tasks]
    if (index >= 0) {
      tasks[index] = normalized
    } else {
      tasks.unshift(normalized)
    }
    config.value = { ...config.value, tasks }
    selectedTaskId.value = normalized.id
    await persist()
    return config.value.tasks.find((item) => item.id === normalized.id) || normalized
  }

  async function removeTask(taskId: string) {
    config.value = {
      ...config.value,
      tasks: config.value.tasks.filter((task) => task.id !== taskId)
    }
    if (selectedTaskId.value === taskId) {
      selectedTaskId.value = config.value.tasks[0]?.id || null
    }
    await persist()
  }

  async function updateTaskEnabled(taskId: string, enabled: boolean) {
    const task = config.value.tasks.find((item) => item.id === taskId)
    if (!task) return
    await upsertTask({ ...task, enabled })
  }

  async function toggleFavorite(taskId: string) {
    const task = config.value.tasks.find((item) => item.id === taskId)
    if (!task) return
    await upsertTask({ ...task, favorite: !task.favorite })
  }

  async function createTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('标签名称不能为空')
    if (tags.value.some((tag) => tag.name === trimmed)) throw new Error('标签名称不能重复')
    const nextTag: TaskTag = {
      id: `tag-${crypto.randomUUID()}`,
      name: trimmed
    }
    config.value = {
      ...config.value,
      tags: [...tags.value, nextTag]
    }
    await persist()
    return nextTag
  }

  async function renameTag(tagId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('标签名称不能为空')
    if (tags.value.some((tag) => tag.id !== tagId && tag.name === trimmed)) throw new Error('标签名称不能重复')
    config.value = {
      ...config.value,
      tags: tags.value.map((tag) => (tag.id === tagId ? { ...tag, name: trimmed } : tag))
    }
    await persist()
  }

  async function deleteTag(tagId: string) {
    config.value = {
      ...config.value,
      tags: tags.value.filter((tag) => tag.id !== tagId),
      tasks: config.value.tasks.map((task) => ({
        ...task,
        tagIds: (task.tagIds || []).filter((id) => id !== tagId)
      }))
    }
    await persist()
  }

  async function saveTaskAsTemplate(task: TaskItem) {
    const template: TaskTemplate = normalizeTemplate({
      id: `template-${crypto.randomUUID()}`,
      name: task.name,
      category: task.category,
      keywords: task.keywords || [],
      description: task.description || '',
      variables: task.variables || [],
      actions: task.actions.map((action) => {
        const templateAction = actionWithoutId(action)
        const normalized = {
          ...templateAction,
          riskLevel: deriveActionRisk(action)
        }
        return normalized
      })
    })
    config.value = {
      ...config.value,
      templates: [template, ...config.value.templates]
    }
    await persist()
    return template
  }

  async function deleteTemplate(templateId: string) {
    config.value = {
      ...config.value,
      templates: config.value.templates.filter((template) => template.id !== templateId)
    }
    await persist()
  }

  function markTaskLastRun(taskId: string, lastRunAt: string) {
    config.value = {
      ...config.value,
      tasks: config.value.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              lastRunAt,
              updatedAt: lastRunAt
            }
          : task
      )
    }
  }

  async function updateSettings(settingsPatch: AppSettings) {
    const nextSettings = { ...settings.value, ...settingsPatch }
    try {
      config.value = isTauriRuntime()
        ? await tauriApi.updateSettings(nextSettings)
        : saveBrowserConfig({ ...config.value, settings: nextSettings })
    } catch (err) {
      logDevError('Update settings failed', err, { settingsPatch })
      error.value = getErrorMessage(err)
      throw err
    }
  }

  function selectTask(taskId: string | null) {
    selectedTaskId.value = taskId
  }

  function replaceConfig(nextConfig: AppConfig, preferredTaskId?: string | null) {
    config.value = normalizeConfig(nextConfig)
    selectedTaskId.value =
      preferredTaskId && config.value.tasks.some((task) => task.id === preferredTaskId)
        ? preferredTaskId
        : config.value.tasks[0]?.id || null
  }

  return {
    config,
    tasks,
    tags,
    savedTemplates,
    templates,
    settings,
    categories,
    selectedTaskId,
    selectedTask,
    loading,
    saving,
    error,
    load,
    setupConfigSync,
    teardownConfigSync,
    reloadFromConfigUpdate,
    persist,
    upsertTask,
    removeTask,
    updateTaskEnabled,
    toggleFavorite,
    createTag,
    renameTag,
    deleteTag,
    saveTaskAsTemplate,
    deleteTemplate,
    markTaskLastRun,
    updateSettings,
    selectTask,
    replaceConfig
  }
})

function loadBrowserConfig() {
  const raw = localStorage.getItem('anything-fast-config')
  return raw ? normalizeConfig(JSON.parse(raw) as AppConfig) : createDefaultConfig()
}

function saveBrowserConfig(config: AppConfig) {
  const normalized = normalizeConfig(config)
  localStorage.setItem('anything-fast-config', JSON.stringify(normalized))
  return normalized
}

function actionWithoutId(action: TaskItem['actions'][number]): TaskTemplate['actions'][number] {
  return {
    type: action.type,
    name: action.name,
    params: action.params,
    enabled: action.enabled,
    timeoutMs: action.timeoutMs,
    continueOnError: action.continueOnError,
    outputBinding: action.outputBinding,
    condition: action.condition,
    riskLevel: action.riskLevel
  }
}
