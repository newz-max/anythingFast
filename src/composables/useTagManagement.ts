import { computed, shallowRef, type Ref } from 'vue'
import type { DialogApi, MessageApi } from 'naive-ui'
import type { TaskView } from '@/domain/taskViews'
import type { useTaskStore } from '@/stores/taskStore'
import type { TaskItem, TaskTag } from '@/types/domain'

type TaskStore = ReturnType<typeof useTaskStore>

export interface TagItem extends TaskTag {
  tone: string
}

export interface UseTagManagementOptions {
  taskStore: TaskStore
  activeTaskView: Ref<TaskView>
  selectedTagId: Ref<string | null>
  getVisibleTasks: () => TaskItem[]
  message: MessageApi
  dialog: DialogApi
  reportUiError: (context: string, err: unknown, details?: Record<string, unknown>) => void
}

export function useTagManagement(options: UseTagManagementOptions) {
  const tagModalVisible = shallowRef(false)
  const tagDraftName = shallowRef('')
  const editingTag = shallowRef<TaskTag | null>(null)

  const tagModalMode = computed(() => (editingTag.value ? 'edit' : 'create'))
  const tagItems = computed(() => createTagItems(options.taskStore.tags))

  function selectTag(tagId: string | null) {
    options.selectedTagId.value = options.selectedTagId.value === tagId ? null : tagId
    if (options.activeTaskView.value === 'templates') {
      options.activeTaskView.value = 'all'
    }
    const nextTasks = options.getVisibleTasks()
    if (!nextTasks.some((task) => task.id === options.taskStore.selectedTaskId)) {
      options.taskStore.selectTask(nextTasks[0]?.id || null)
    }
  }

  function openCreateTag() {
    editingTag.value = null
    tagDraftName.value = ''
    tagModalVisible.value = true
  }

  function openRenameTag(tag: TaskTag) {
    editingTag.value = tag
    tagDraftName.value = tag.name
    tagModalVisible.value = true
  }

  async function saveTag() {
    const name = tagDraftName.value.trim()
    if (!name) {
      options.message.warning('请输入标签名称')
      return
    }

    try {
      if (editingTag.value) {
        await options.taskStore.renameTag(editingTag.value.id, name)
        options.message.success('已更新标签')
      } else {
        await options.taskStore.createTag(name)
        options.message.success('已新增标签')
      }
      tagModalVisible.value = false
    } catch (err) {
      options.reportUiError('Save tag failed', err, { tagId: editingTag.value?.id })
    }
  }

  function confirmDeleteTag(tag: TaskTag) {
    options.dialog.warning({
      title: '删除标签',
      content: `确认删除“${tag.name}”？标签会从已关联事项中移除，事项不会被删除。`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        await options.taskStore.deleteTag(tag.id)
        if (options.selectedTagId.value === tag.id) options.selectedTagId.value = null
        options.message.success('已删除标签')
      }
    })
  }

  return {
    tagItems,
    tagModalVisible,
    tagModalMode,
    tagDraftName,
    editingTag,
    selectTag,
    openCreateTag,
    openRenameTag,
    saveTag,
    confirmDeleteTag
  }
}

export function createTagItems(tags: TaskTag[]): TagItem[] {
  return tags.map((tag, index) => ({ ...tag, tone: getTagTone(index) }))
}

export function getTagTone(index: number) {
  return ['blue', 'green', 'amber', 'purple'][index % 4]
}
