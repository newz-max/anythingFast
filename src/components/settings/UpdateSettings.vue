<script setup lang="ts">
import { computed } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { useUpdateStore } from '@/stores/updateStore'
import { getErrorMessage } from '@/utils/errors'

const updateStore = useUpdateStore()
const message = useMessage()
const dialog = useDialog()

const statusText = computed(() => {
  if (updateStore.state === 'checking') return '正在检查更新'
  if (updateStore.state === 'available') return `发现新版本 ${updateStore.availableVersion}`
  if (updateStore.state === 'downloading') return `正在下载更新 ${updateStore.progress.percent}%`
  if (updateStore.state === 'downloaded') return '更新已下载，重启后安装'
  if (updateStore.state === 'installing') return '正在安装更新'
  if (updateStore.state === 'upToDate') return '当前已是最新版本'
  if (updateStore.state === 'error') return '检查更新失败，请稍后重试'
  return '尚未检查更新'
})

const progressLabel = computed(() => {
  const { downloadedBytes, contentLength } = updateStore.progress
  if (!contentLength) return formatBytes(downloadedBytes)
  return `${formatBytes(downloadedBytes)} / ${formatBytes(contentLength)}`
})

const lastCheckLabel = computed(() => formatDateTime(updateStore.lastCheckAt))
const publishedAtLabel = computed(() => formatDateTime(updateStore.publishedAt))

async function checkManually() {
  try {
    await updateStore.checkForUpdate('manual')
    if (updateStore.state === 'upToDate') {
      message.success('当前已是最新版本')
    }
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

async function downloadUpdate() {
  try {
    await updateStore.downloadUpdate()
    message.success('更新已下载')
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

function confirmInstall() {
  if (!updateStore.canInstallNow) {
    message.warning(updateStore.installBlockedReason || '当前不能安装更新')
    return
  }

  dialog.warning({
    title: '重启安装更新',
    content: `将重启应用并安装 ${updateStore.availableVersion}。`,
    positiveText: '重启安装',
    negativeText: '稍后',
    onPositiveClick: async () => {
      try {
        await updateStore.installDownloadedUpdateAndRelaunch()
      } catch (err) {
        message.error(getErrorMessage(err))
      }
    }
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatBytes(value: number) {
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let amount = value
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
</script>

<template>
  <section class="update-settings">
    <header class="update-settings-header">
      <div class="update-settings-copy">
        <h3>应用更新</h3>
        <p>{{ statusText }}</p>
        <small v-if="lastCheckLabel">上次检查：{{ lastCheckLabel }}</small>
      </div>
      <div class="update-settings-actions">
        <NButton size="small" secondary :disabled="updateStore.busy" @click="checkManually">检查更新</NButton>
        <NButton size="small" type="primary" :disabled="!updateStore.canDownload" @click="downloadUpdate">下载</NButton>
        <NButton size="small" type="primary" :disabled="updateStore.state !== 'downloaded' || !updateStore.canInstallNow" @click="confirmInstall">
          重启安装
        </NButton>
      </div>
    </header>

    <NAlert v-if="updateStore.state === 'error' && updateStore.error" type="error" :show-icon="false">
      {{ updateStore.error }}
    </NAlert>

    <NAlert v-if="updateStore.installBlockedReason" type="warning" :show-icon="false">
      {{ updateStore.installBlockedReason }}
    </NAlert>

    <section v-if="updateStore.state === 'available' || updateStore.state === 'downloaded' || updateStore.state === 'downloading' || updateStore.state === 'installing'" class="update-detail">
      <dl>
        <div>
          <dt>当前版本</dt>
          <dd>{{ updateStore.currentVersion || '未知' }}</dd>
        </div>
        <div>
          <dt>新版本</dt>
          <dd>{{ updateStore.availableVersion }}</dd>
        </div>
        <div v-if="publishedAtLabel">
          <dt>发布时间</dt>
          <dd>{{ publishedAtLabel }}</dd>
        </div>
      </dl>

      <div v-if="updateStore.state === 'downloading'" class="update-progress">
        <NProgress type="line" :percentage="updateStore.progress.percent" :show-indicator="false" />
        <span>{{ progressLabel }}</span>
      </div>

      <p v-if="updateStore.releaseNotes" class="update-notes">{{ updateStore.releaseNotes }}</p>
    </section>
  </section>
</template>

<style scoped>
.update-settings {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--app-field-border);
  padding-top: 16px;
}

.update-settings-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
}

.update-settings-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.update-settings-copy h3,
.update-settings-copy p {
  margin: 0;
}

.update-settings-copy h3 {
  color: var(--app-text);
}

.update-settings-copy p,
.update-settings-copy small {
  color: var(--app-muted);
}

.update-settings-copy p {
  font-size: 13px;
  line-height: 1.5;
}

.update-settings-copy small {
  font-size: 12px;
}

.update-settings-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.update-detail {
  display: grid;
  gap: 10px;
}

.update-detail dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.update-detail dl div {
  display: grid;
  gap: 2px;
  min-width: 0;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 9px 10px;
}

.update-detail dt {
  color: var(--app-muted);
  font-size: 12px;
}

.update-detail dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--app-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.update-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  color: var(--app-muted);
  font-size: 12px;
}

.update-notes {
  max-height: 120px;
  margin: 0;
  overflow: auto;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .update-settings-header,
  .update-detail dl,
  .update-progress {
    grid-template-columns: 1fr;
  }

  .update-settings-actions {
    justify-content: flex-start;
  }
}
</style>
