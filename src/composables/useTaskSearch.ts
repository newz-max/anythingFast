import { computed, shallowRef, type Ref } from 'vue'
import { searchTasks } from '@/domain/search'
import type { TaskItem } from '@/types/domain'

export function useTaskSearch(tasks: Ref<TaskItem[]>) {
  const query = shallowRef('')
  const category = shallowRef<string | null>('全部')

  const results = computed(() => searchTasks(tasks.value, query.value, category.value))

  return {
    query,
    category,
    results
  }
}
