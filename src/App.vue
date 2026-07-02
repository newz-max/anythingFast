<script setup lang="ts">
import AppProvider from '@/components/app/AppProvider.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import QuickSearchPanel from '@/components/quick/QuickSearchPanel.vue'
import { computed, onMounted, watchEffect } from 'vue'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()
const isQuickPanel = computed(() => new URLSearchParams(window.location.search).get('window') === 'quick')

onMounted(() => {
  void taskStore.load()
})

watchEffect(() => {
  document.documentElement.dataset.appWindow = isQuickPanel.value ? 'quick' : 'main'
})
</script>

<template>
  <AppProvider>
    <QuickSearchPanel v-if="isQuickPanel" />
    <MainLayout v-else />
  </AppProvider>
</template>
