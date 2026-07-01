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

const scrollbarWidth = '7px'
const scrollbarHeight = '7px'
const scrollbarBorderRadius = '999px'
const scrollbarRailColor = 'transparent'

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = resolvedTheme.value === 'dark'
  const scrollbarColor = dark ? 'rgba(87, 100, 128, 0.8)' : 'rgba(87, 100, 128, 0.48)'
  const scrollbarColorHover = dark ? 'rgba(101, 116, 148, 0.9)' : 'rgba(87, 100, 128, 0.64)'

  return {
    common: {
      scrollbarColor,
      scrollbarColorHover,
      scrollbarWidth,
      scrollbarHeight,
      scrollbarBorderRadius
    },
    Scrollbar: {
      color: scrollbarColor,
      colorHover: scrollbarColorHover,
      width: scrollbarWidth,
      height: scrollbarHeight,
      borderRadius: scrollbarBorderRadius,
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
