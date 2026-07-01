<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watchEffect } from 'vue'
import { darkTheme, zhCN, dateZhCN } from 'naive-ui'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()
const systemPrefersDark = shallowRef(false)
const theme = computed(() => {
  const preference = taskStore.settings.theme
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark.value)
  return dark ? darkTheme : undefined
})

let mediaQuery: MediaQueryList | null = null

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = mediaQuery.matches
  mediaQuery.addEventListener('change', updateSystemTheme)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', updateSystemTheme)
})

watchEffect(() => {
  const preference = taskStore.settings.theme
  const resolved = preference === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : preference
  document.documentElement.dataset.appTheme = resolved
})

function updateSystemTheme(event: MediaQueryListEvent) {
  systemPrefersDark.value = event.matches
}
</script>

<template>
  <NConfigProvider :theme="theme" :locale="zhCN" :date-locale="dateZhCN">
    <NDialogProvider>
      <NMessageProvider>
        <NNotificationProvider>
          <slot />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
