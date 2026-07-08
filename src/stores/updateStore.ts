import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { updaterApi, type AppUpdate, type AppUpdateDownloadEvent } from '@/api/updater'
import { useExecutionStore } from '@/stores/executionStore'
import { getErrorMessage, logDevError } from '@/utils/errors'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'upToDate'
  | 'error'

export type UpdateCheckSource = 'manual' | 'startup'

export interface UpdateProgress {
  downloadedBytes: number
  contentLength: number | null
  percent: number
}

const initialProgress: UpdateProgress = {
  downloadedBytes: 0,
  contentLength: null,
  percent: 0
}

export const useUpdateStore = defineStore('update', () => {
  const executionStore = useExecutionStore()
  const state = shallowRef<UpdateState>('idle')
  const error = shallowRef<string | null>(null)
  const lastCheckAt = shallowRef<string | null>(null)
  const lastCheckSource = shallowRef<UpdateCheckSource | null>(null)
  const update = shallowRef<AppUpdate | null>(null)
  const downloadedUpdate = shallowRef<AppUpdate | null>(null)
  const progress = shallowRef<UpdateProgress>({ ...initialProgress })
  let checkPromise: Promise<void> | null = null
  let downloadPromise: Promise<void> | null = null

  const availableVersion = computed(() => update.value?.version ?? '')
  const currentVersion = computed(() => update.value?.currentVersion ?? '')
  const publishedAt = computed(() => update.value?.date ?? '')
  const releaseNotes = computed(() => update.value?.body ?? '')
  const checking = computed(() => state.value === 'checking')
  const downloading = computed(() => state.value === 'downloading')
  const installing = computed(() => state.value === 'installing')
  const busy = computed(() => checking.value || downloading.value || installing.value)
  const canDownload = computed(() => state.value === 'available' && Boolean(update.value) && !busy.value)
  const installBlockedReason = computed(() => {
    if (executionStore.running) return '当前有事项正在运行，完成后可重启安装'
    if (executionStore.runtimeInputPending) return '当前有运行变量输入窗口，处理后可重启安装'
    if (executionStore.riskConfirmationPending) return '当前有执行确认窗口，处理后可重启安装'
    return ''
  })
  const canInstallNow = computed(() => state.value === 'downloaded' && Boolean(downloadedUpdate.value) && !installBlockedReason.value)

  async function checkForUpdate(source: UpdateCheckSource) {
    if (checkPromise) return checkPromise

    checkPromise = runCheckForUpdate(source).finally(() => {
      checkPromise = null
    })
    return checkPromise
  }

  async function checkForUpdateAndDownload(source: UpdateCheckSource) {
    await checkForUpdate(source)
    if (state.value !== 'available' || !update.value) return

    try {
      await downloadUpdate()
    } catch (err) {
      if (source === 'manual') {
        throw err
      }
    }
  }

  async function runCheckForUpdate(source: UpdateCheckSource) {
    state.value = 'checking'
    error.value = null
    lastCheckSource.value = source
    downloadedUpdate.value = null
    progress.value = { ...initialProgress }

    try {
      const nextUpdate = await updaterApi.checkForUpdate()
      lastCheckAt.value = new Date().toISOString()
      update.value = nextUpdate
      state.value = nextUpdate ? 'available' : 'upToDate'
    } catch (err) {
      const message = getErrorMessage(err)
      logDevError(source === 'startup' ? 'Startup update check failed' : 'Manual update check failed', err)
      error.value = message
      state.value = 'error'
      if (source === 'manual') {
        throw new Error(message)
      }
    }
  }

  async function downloadUpdate() {
    if (downloadPromise) return downloadPromise
    if (!update.value) throw new Error('没有可下载的更新')

    downloadPromise = runDownloadUpdate(update.value).finally(() => {
      downloadPromise = null
    })
    return downloadPromise
  }

  async function runDownloadUpdate(nextUpdate: AppUpdate) {
    state.value = 'downloading'
    error.value = null
    downloadedUpdate.value = null
    progress.value = { ...initialProgress }

    try {
      await updaterApi.downloadUpdate(nextUpdate, applyDownloadEvent)
      downloadedUpdate.value = nextUpdate
      state.value = 'downloaded'
      progress.value = {
        ...progress.value,
        percent: 100
      }
    } catch (err) {
      const message = getErrorMessage(err)
      logDevError('Download update failed', err)
      error.value = message
      state.value = 'error'
      throw new Error(message)
    }
  }

  async function installDownloadedUpdateAndRelaunch() {
    if (!downloadedUpdate.value) throw new Error('没有已下载的更新')
    if (installBlockedReason.value) throw new Error(installBlockedReason.value)

    state.value = 'installing'
    error.value = null
    try {
      await updaterApi.installUpdate(downloadedUpdate.value)
      await updaterApi.relaunchApp()
    } catch (err) {
      const message = getErrorMessage(err)
      logDevError('Install update failed', err)
      error.value = message
      state.value = 'downloaded'
      throw new Error(message)
    }
  }

  function applyDownloadEvent(event: AppUpdateDownloadEvent) {
    if (event.event === 'Started') {
      progress.value = {
        downloadedBytes: 0,
        contentLength: event.data.contentLength ?? null,
        percent: 0
      }
      return
    }

    if (event.event === 'Progress') {
      const downloadedBytes = progress.value.downloadedBytes + event.data.chunkLength
      progress.value = {
        ...progress.value,
        downloadedBytes,
        percent: progressPercent(downloadedBytes, progress.value.contentLength)
      }
      return
    }

    progress.value = {
      ...progress.value,
      percent: 100
    }
  }

  function reset() {
    state.value = 'idle'
    error.value = null
    update.value = null
    downloadedUpdate.value = null
    progress.value = { ...initialProgress }
  }

  return {
    state,
    error,
    lastCheckAt,
    lastCheckSource,
    update,
    progress,
    availableVersion,
    currentVersion,
    publishedAt,
    releaseNotes,
    checking,
    downloading,
    installing,
    busy,
    canDownload,
    installBlockedReason,
    canInstallNow,
    checkForUpdate,
    checkForUpdateAndDownload,
    downloadUpdate,
    installDownloadedUpdateAndRelaunch,
    reset
  }
})

function progressPercent(downloadedBytes: number, contentLength: number | null) {
  if (!contentLength || contentLength <= 0) return 0
  return Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
}
