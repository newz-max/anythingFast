import { computed, shallowRef, type Ref } from 'vue'
import { searchTasks, type SearchTasksOptions } from '@/domain/search'
import type { TaskItem } from '@/types/domain'

export function useTaskSearch(tasks: Ref<TaskItem[]>, options: SearchTasksOptions = {}) {
  const query = shallowRef('')
  const category = shallowRef<string | null>('全部')

  const results = computed(() => searchTasks(tasks.value, query.value, category.value, options))

  return {
    query,
    category,
    results
  }
}
