<script setup lang="ts">
import { computed } from 'vue'
import type { ActionCondition, PreviousActionStatusConditionValue, TaskVariable } from '@/types/domain'

const condition = defineModel<ActionCondition | null | undefined>({ required: true })

const props = defineProps<{
  variables?: TaskVariable[]
}>()

type ConditionType = ActionCondition['type']

const conditionTypeOptions: Array<{ label: string; value: ConditionType }> = [
  { label: '始终执行', value: 'always' },
  { label: '文件存在', value: 'fileExists' },
  { label: '文件夹存在', value: 'folderExists' },
  { label: '变量等于', value: 'variableEquals' },
  { label: '变量非空', value: 'variableNotEmpty' },
  { label: '上一动作状态', value: 'previousActionStatus' }
]

const previousStatusOptions: Array<{ label: string; value: PreviousActionStatusConditionValue }> = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '已跳过', value: 'skipped' }
]

const variableOptions = computed(() =>
  (props.variables || []).map((variable) => ({
    label: `${variable.label || variable.key} (${variable.key})`,
    value: variable.key
  }))
)

const currentType = computed<ConditionType>(() => condition.value?.type || 'always')

function setConditionType(type: ConditionType) {
  condition.value = defaultCondition(type)
}

function patchCondition(patch: Partial<ActionCondition>) {
  condition.value = {
    ...defaultCondition(currentType.value),
    ...(condition.value || {}),
    ...patch
  } as ActionCondition
}

function defaultCondition(type: ConditionType): ActionCondition {
  switch (type) {
    case 'fileExists':
      return { type, path: '' }
    case 'folderExists':
      return { type, path: '' }
    case 'variableEquals':
      return { type, variable: '', value: '' }
    case 'variableNotEmpty':
      return { type, variable: '' }
    case 'previousActionStatus':
      return { type, status: 'success' }
    case 'always':
      return { type: 'always' }
  }
}
</script>

<template>
  <div class="condition-form">
    <NFormItem label="执行条件">
      <NSelect :value="currentType" :options="conditionTypeOptions" @update:value="setConditionType" />
    </NFormItem>

    <NFormItem v-if="condition?.type === 'fileExists'" label="文件路径">
      <NInput
        :value="condition.path"
        placeholder="C:\\Project\\input.txt，可使用 {{variable}}"
        @update:value="(value: string) => patchCondition({ path: value })"
      />
    </NFormItem>

    <NFormItem v-else-if="condition?.type === 'folderExists'" label="文件夹路径">
      <NInput
        :value="condition.path"
        placeholder="C:\\Project，可使用 {{variable}}"
        @update:value="(value: string) => patchCondition({ path: value })"
      />
    </NFormItem>

    <NGrid v-else-if="condition?.type === 'variableEquals'" :cols="2" :x-gap="12" responsive="screen">
      <NGi>
        <NFormItem label="变量">
          <NSelect
            :value="condition.variable"
            :options="variableOptions"
            filterable
            tag
            placeholder="选择或输入变量 key"
            @update:value="(value: string) => patchCondition({ variable: value })"
          />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="等于">
          <NInput :value="condition.value" placeholder="期望值，可使用 {{variable}}" @update:value="(value: string) => patchCondition({ value })" />
        </NFormItem>
      </NGi>
    </NGrid>

    <NFormItem v-else-if="condition?.type === 'variableNotEmpty'" label="变量">
      <NSelect
        :value="condition.variable"
        :options="variableOptions"
        filterable
        tag
        placeholder="选择或输入变量 key"
        @update:value="(value: string) => patchCondition({ variable: value })"
      />
    </NFormItem>

    <NFormItem v-else-if="condition?.type === 'previousActionStatus'" label="状态">
      <NSelect :value="condition.status" :options="previousStatusOptions" @update:value="(value: PreviousActionStatusConditionValue) => patchCondition({ status: value })" />
    </NFormItem>
  </div>
</template>

<style scoped>
.condition-form {
  display: grid;
  gap: 2px;
}
</style>
