import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { tauriApi } from '@/api/tauri'
import { createDefaultConfig } from '@/domain/taskFactory'
import { deriveTaskRisk } from '@/domain/risk'
import type { AppConfig, AppSettings, TaskItem } from '@/types/domain'

const isTauri = () => Boolean('__TAURI_INTERNALS__' in window)

export const useTaskStore = defineStore('tasks', () => {
  const config = shallowRef<AppConfig>(createDefaultConfig())
  const selectedTaskId = shallowRef<string | null>(null)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const error = shallowRef<string | null>(null)

  const tasks = computed(() => config.value.tasks)
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
      config.value = isTauri() ? await tauriApi.loadConfig() : loadBrowserConfig()
      selectedTaskId.value = config.value.tasks[0]?.id || null
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
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
          riskLevel: deriveTaskRisk(task),
          updatedAt: new Date().toISOString()
        }))
      }
      config.value = isTauri() ? await tauriApi.saveConfig(nextConfig) : saveBrowserConfig(nextConfig)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function upsertTask(task: TaskItem) {
    const normalized = {
      ...task,
      category: task.category?.trim() || '未分类',
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

  async function updateSettings(settingsPatch: AppSettings) {
    const nextSettings = { ...settings.value, ...settingsPatch }
    config.value = isTauri()
      ? await tauriApi.updateSettings(nextSettings)
      : saveBrowserConfig({ ...config.value, settings: nextSettings })
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
    updateSettings,
    selectTask,
    replaceConfig
  }
})

function loadBrowserConfig() {
  const raw = localStorage.getItem('anything-fast-config')
  return raw ? (JSON.parse(raw) as AppConfig) : createDefaultConfig()
}

function saveBrowserConfig(config: AppConfig) {
  localStorage.setItem('anything-fast-config', JSON.stringify(config))
  return config
}
