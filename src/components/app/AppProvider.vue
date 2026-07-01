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
  const scrollbarColor = dark ? 'rgba(84, 99, 126, 0.72)' : 'rgba(102, 119, 148, 0.46)'
  const scrollbarColorHover = dark ? 'rgba(98, 116, 148, 0.84)' : 'rgba(88, 106, 137, 0.64)'
  const scrollbarRailColor = 'transparent'

  return {
    common: {
      scrollbarColor,
      scrollbarColorHover,
      scrollbarWidth: '7px',
      scrollbarHeight: '7px',
      scrollbarBorderRadius: '999px'
    },
    Scrollbar: {
      color: scrollbarColor,
      colorHover: scrollbarColorHover,
      width: '7px',
      height: '7px',
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
