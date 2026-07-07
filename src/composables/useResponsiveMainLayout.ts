import { computed, nextTick, onMounted, onUnmounted, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'

interface UseResponsiveMainLayoutOptions {
  showTemplateCenter: Ref<boolean>
  layoutRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
}

interface ResponsiveMainLayoutController {
  isStackedLayout: Ref<boolean>
  taskListExpanded: Ref<boolean>
  shouldShowTaskListToggle: ComputedRef<boolean>
  shouldCollapseTaskList: ComputedRef<boolean>
  taskListToggleLabel: ComputedRef<string>
  toggleTaskListPanel: () => void
}

export function useResponsiveMainLayout(options: UseResponsiveMainLayoutOptions): ResponsiveMainLayoutController {
  const isStackedLayout = shallowRef(false)
  const taskListExpanded = shallowRef(false)
  const shouldShowTaskListToggle = computed(() => isStackedLayout.value && !options.showTemplateCenter.value)
  const shouldCollapseTaskList = computed(() => shouldShowTaskListToggle.value && !taskListExpanded.value)
  const taskListToggleLabel = computed(() => (taskListExpanded.value ? '收起事项列表' : '展开事项列表'))

  let desktopMediaQuery: MediaQueryList | null = null
  let stackedLayoutMediaQuery: MediaQueryList | null = null

  onMounted(() => {
    setupResponsiveScrollReset()
  })

  onUnmounted(() => {
    desktopMediaQuery?.removeEventListener('change', handleDesktopBreakpointChange)
    stackedLayoutMediaQuery?.removeEventListener('change', handleStackedLayoutBreakpointChange)
  })

  function setupResponsiveScrollReset() {
    if (!window.matchMedia) return
    desktopMediaQuery = window.matchMedia('(min-width: 961px)')
    desktopMediaQuery.addEventListener('change', handleDesktopBreakpointChange)
    stackedLayoutMediaQuery = window.matchMedia('(max-width: 960px)')
    syncStackedLayout(stackedLayoutMediaQuery.matches)
    stackedLayoutMediaQuery.addEventListener('change', handleStackedLayoutBreakpointChange)
  }

  function handleDesktopBreakpointChange(event: MediaQueryListEvent) {
    if (!event.matches) return
    void resetLayoutScroll()
  }

  function handleStackedLayoutBreakpointChange(event: MediaQueryListEvent) {
    syncStackedLayout(event.matches)
    void resetLayoutScroll()
  }

  function syncStackedLayout(matches: boolean) {
    isStackedLayout.value = matches
    taskListExpanded.value = false
  }

  function toggleTaskListPanel() {
    taskListExpanded.value = !taskListExpanded.value
    void resetLayoutScroll()
  }

  async function resetLayoutScroll() {
    await nextTick()
    options.layoutRef.value?.scrollTo({ top: 0, left: 0 })
    options.contentRef.value?.scrollTo({ top: 0, left: 0 })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }

  return {
    isStackedLayout,
    taskListExpanded,
    shouldShowTaskListToggle,
    shouldCollapseTaskList,
    taskListToggleLabel,
    toggleTaskListPanel
  }
}
