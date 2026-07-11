<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { defaultQuickTaskName, quickIntentActionLabel, type QuickInputIntent } from '@/domain/quickInput'

interface QuickCreateSubmitPayload {
  name: string
  category: string
  keywords: string[]
  favorite: boolean
  runImmediately: boolean
}

const props = defineProps<{
  intent: QuickInputIntent
  categories?: string[]
  saving?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  submit: [payload: QuickCreateSubmitPayload]
  cancel: []
}>()

const form = reactive({
  name: '',
  category: '未分类',
  keywordsText: '',
  favorite: false,
  runImmediately: false
})

const categoryOptions = computed(() =>
  (props.categories || [])
    .filter((category) => category && category !== '全部')
    .map((category) => ({ label: category, value: category }))
)

const actionLabel = computed(() => quickIntentActionLabel(props.intent))
const tagNames = computed(() => props.intent.tokens.tagNames)

watch(
  () => props.intent,
  (intent) => {
    form.name = defaultQuickTaskName(intent)
    form.category = intent.tokens.category || '未分类'
    form.keywordsText = intent.tokens.keywords.join(', ')
    form.favorite = false
    form.runImmediately = intent.tokens.runImmediately
  },
  { immediate: true }
)

function submit() {
  if (props.saving) return
  const name = form.name.trim()
  if (!name) return
  emit('submit', {
    name,
    category: form.category.trim() || '未分类',
    keywords: parseKeywords(form.keywordsText),
    favorite: form.favorite,
    runImmediately: form.runImmediately
  })
}

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)))
}
</script>

<template>
  <section class="quick-create-confirm" aria-label="快速创建确认">
    <header class="confirm-header">
      <span class="confirm-kicker">{{ actionLabel }}</span>
      <strong>确认事项信息</strong>
    </header>

    <div class="confirm-form">
      <label class="confirm-field">
        <span>名称</span>
        <NInput
          v-model:value="form.name"
          size="small"
          placeholder="事项名称"
          :disabled="saving"
          @keydown.enter.prevent="submit"
        />
      </label>

      <label class="confirm-field">
        <span>分类</span>
        <NSelect
          v-model:value="form.category"
          size="small"
          filterable
          tag
          :options="categoryOptions"
          :disabled="saving"
        />
      </label>

      <label class="confirm-field">
        <span>关键词</span>
        <NInput
          v-model:value="form.keywordsText"
          size="small"
          placeholder="用逗号分隔"
          :disabled="saving"
          @keydown.enter.prevent="submit"
        />
      </label>
    </div>

    <div v-if="tagNames.length" class="tag-note">
      <span>@ 标签已识别但本次不会保存：</span>
      <NTag v-for="tag in tagNames" :key="tag" size="small">{{ tag }}</NTag>
    </div>

    <p v-if="error" class="confirm-error">{{ error }}</p>

    <footer class="confirm-actions">
      <NCheckbox v-model:checked="form.favorite" :disabled="saving">收藏</NCheckbox>
      <NCheckbox v-model:checked="form.runImmediately" :disabled="saving">保存后立即执行</NCheckbox>
      <span class="confirm-spacer"></span>
      <NButton size="small" quaternary :disabled="saving" @click="emit('cancel')">取消</NButton>
      <NButton size="small" type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">保存</NButton>
    </footer>
  </section>
</template>

<style scoped>
.quick-create-confirm {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(112, 154, 255, 0.32);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(38, 52, 86, 0.9), rgba(24, 33, 58, 0.9)),
    rgba(27, 35, 55, 0.76);
  padding: 14px;
}

.confirm-header {
  display: grid;
  gap: 2px;
}

.confirm-kicker {
  color: #8db4ff;
  font-size: 12px;
}

.confirm-header strong {
  color: #f4f7ff;
  font-size: 15px;
}

.confirm-form {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(120px, 0.8fr) minmax(0, 1fr);
  gap: 10px;
}

.confirm-field {
  display: grid;
  min-width: 0;
  gap: 5px;
  color: #b3bddb;
  font-size: 12px;
}

.tag-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: #8b96b8;
  font-size: 12px;
}

.confirm-error {
  margin: 0;
  color: #ff8d8d;
  font-size: 12px;
}

.confirm-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}

.confirm-spacer {
  flex: 1 1 auto;
}

@media (max-width: 560px) {
  .confirm-form {
    grid-template-columns: 1fr;
  }
}
</style>
