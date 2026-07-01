<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watchEffect } from 'vue'
import { darkTheme, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()
const systemPrefersDark = shallowRef(false)

const resolvedTheme = computed<'dark' | 'light'>(() => {
  const preference = taskStore.settings.theme
  return preference === 'dark' || (preference === 'system' && systemPrefersDark.value) ? 'dark' : 'light'
})

const theme = computed(() => resolvedTheme.value === 'dark' ? darkTheme : undefined)

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = resolvedTheme.value === 'dark'
  const scrollbarColor = dark ? 'rgba(122, 143, 192, 0.34)' : 'rgba(107, 124, 163, 0.36)'
  const scrollbarColorHover = dark ? 'rgba(72, 119, 255, 0.7)' : 'rgba(49, 103, 220, 0.58)'
  const scrollbarRailColor = dark ? 'transparent' : 'rgba(236, 242, 250, 0.42)'

  return {
    common: {
      scrollbarColor,
      scrollbarColorHover,
      scrollbarWidth: '10px',
      scrollbarHeight: '10px',
      scrollbarBorderRadius: '999px'
    },
    Scrollbar: {
      color: scrollbarColor,
      colorHover: scrollbarColorHover,
      width: '10px',
      height: '10px',
      borderRadius: '999px',
      railColor: scrollbarRailColor
    }
  }
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
  document.documentElement.dataset.appTheme = resolvedTheme.value
})

function updateSystemTheme(event: MediaQueryListEvent) {
  systemPrefersDark.value = event.matches
}
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NDialogProvider>
      <NMessageProvider>
        <NNotificationProvider>
          <slot />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
