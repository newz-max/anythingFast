import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { tauriApi } from '@/api/tauri'
import { createDefaultConfig, normalizeConfig } from '@/domain/taskFactory'
import { deriveTaskRisk } from '@/domain/risk'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { AppConfig, AppSettings, TaskItem, TaskTag } from '@/types/domain'

const isTauri = () => Boolean('__TAURI_INTERNALS__' in window)

export const useTaskStore = defineStore('tasks', () => {
  const config = shallowRef<AppConfig>(createDefaultConfig())
  const selectedTaskId = shallowRef<string | null>(null)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const error = shallowRef<string | null>(null)

  const tasks = computed(() => config.value.tasks)
  const tags = computed(() => config.value.tags)
  const settings = computed(() => config.value.settings)
  const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) || null)
  const categories = computed(() => {
    const values = new Set(tasks.value.map((task) => task.category?.trim() || '未分类'))
    return ['全部', ...Array.from(values).sort((left, right) => left.localeCompare(right, 'zh-CN'))]
  })

  async function load() {
    loading.value = true
    error.value = null
    try {
      config.value = normalizeConfig(isTauri() ? await tauriApi.loadConfig() : loadBrowserConfig())
      selectedTaskId.value = config.value.tasks[0]?.id || null
    } catch (err) {
      logDevError('Load task config failed', err)
      error.value = getErrorMessage(err)
      config.value = createDefaultConfig()
    } finally {
      loading.value = false
    }
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
        }))
      }
      config.value = normalizeConfig(isTauri() ? await tauriApi.saveConfig(nextConfig) : saveBrowserConfig(nextConfig))
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
      config.value = isTauri()
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

  function replaceConfig(nextConfig: AppConfig) {
    config.value = nextConfig
    selectedTaskId.value = nextConfig.tasks[0]?.id || null
  }

  return {
    config,
    tasks,
    tags,
    settings,
    categories,
    selectedTaskId,
    selectedTask,
    loading,
    saving,
    error,
    load,
    persist,
    upsertTask,
    removeTask,
    updateTaskEnabled,
    toggleFavorite,
    createTag,
    renameTag,
    deleteTag,
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
