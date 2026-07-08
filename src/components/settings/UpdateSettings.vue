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
const statusTone = computed(() => {
  if (updateStore.state === 'error') return 'error'
  if (updateStore.state === 'available' || updateStore.state === 'downloaded') return 'action'
  if (updateStore.state === 'downloading' || updateStore.state === 'installing' || updateStore.state === 'checking') return 'busy'
  if (updateStore.state === 'upToDate') return 'success'
  return 'idle'
})

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
    <header class="update-hero" :class="`update-hero-${statusTone}`">
      <div class="update-settings-copy">
        <span class="update-kicker">更新状态</span>
        <h3>{{ statusText }}</h3>
        <p>更新检查、下载和安装会立即执行，不需要点击设置弹窗底部保存。</p>
        <small>{{ lastCheckLabel ? `上次检查：${lastCheckLabel}` : '尚无检查记录' }}</small>
      </div>
      <div class="update-settings-actions">
        <NButton size="small" secondary :disabled="updateStore.busy" @click="checkManually">检查更新</NButton>
        <NButton size="small" type="primary" :disabled="!updateStore.canDownload" @click="downloadUpdate">下载</NButton>
        <NButton size="small" type="primary" :disabled="updateStore.state !== 'downloaded' || !updateStore.canInstallNow" @click="confirmInstall">
          重启安装
        </NButton>
      </div>
    </header>

    <div v-if="updateStore.state === 'error' && updateStore.error || updateStore.installBlockedReason" class="update-alerts">
      <NAlert v-if="updateStore.state === 'error' && updateStore.error" type="error" :show-icon="false">
        {{ updateStore.error }}
      </NAlert>

      <NAlert v-if="updateStore.installBlockedReason" type="warning" :show-icon="false">
        {{ updateStore.installBlockedReason }}
      </NAlert>
    </div>

    <section class="update-detail">
      <dl>
        <div>
          <dt>当前版本</dt>
          <dd>{{ updateStore.currentVersion || '未知' }}</dd>
        </div>
        <div>
          <dt>可用版本</dt>
          <dd>{{ updateStore.availableVersion || '暂无' }}</dd>
        </div>
        <div>
          <dt>发布时间</dt>
          <dd>{{ publishedAtLabel || '暂无' }}</dd>
        </div>
      </dl>

      <div v-if="updateStore.state === 'downloading'" class="update-progress-panel">
        <div class="update-progress-header">
          <strong>下载进度</strong>
          <span>{{ progressLabel }}</span>
        </div>
        <NProgress type="line" :percentage="updateStore.progress.percent" :show-indicator="false" />
      </div>

      <section v-if="updateStore.releaseNotes" class="update-notes-panel">
        <h4>版本说明</h4>
        <p class="update-notes">{{ updateStore.releaseNotes }}</p>
      </section>
    </section>
  </section>
</template>

<style scoped>
.update-settings {
  display: grid;
  gap: 14px;
}

.update-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 16px;
}

.update-settings-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.update-kicker {
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
}

.update-settings-copy p {
  margin: 0;
}

.update-settings-copy h3 {
  margin: 0;
  color: var(--app-text);
  font-size: 18px;
  line-height: 1.25;
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

.update-alerts {
  display: grid;
  gap: 8px;
}

.update-detail {
  display: grid;
  gap: 12px;
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

.update-detail dt,
.update-progress-header span {
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

.update-progress-panel,
.update-notes-panel {
  display: grid;
  gap: 8px;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 12px;
}

.update-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.update-progress-header strong,
.update-notes-panel h4 {
  margin: 0;
  color: var(--app-text);
  font-size: 13px;
}

.update-notes {
  max-height: 150px;
  margin: 0;
  overflow: auto;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .update-hero,
  .update-detail dl {
    grid-template-columns: 1fr;
  }

  .update-settings-actions {
    justify-content: flex-start;
  }

  .update-progress-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
