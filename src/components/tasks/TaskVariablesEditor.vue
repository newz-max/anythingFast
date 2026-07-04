<script setup lang="ts">
import type { TaskVariable } from '@/types/domain'
import { isValidVariableKey } from '@/domain/variables'

const variables = defineModel<TaskVariable[]>({ required: true })

function createVariable() {
  const index = variables.value.length + 1
  variables.value = [
    ...variables.value,
    {
      key: `var${index}`,
      label: `变量 ${index}`,
      defaultValue: '',
      required: true,
      secret: false
    }
  ]
}

function patchVariable(index: number, patch: Partial<TaskVariable>) {
  variables.value = variables.value.map((variable, variableIndex) =>
    variableIndex === index ? { ...variable, ...patch } : variable
  )
}

function removeVariable(index: number) {
  variables.value = variables.value.filter((_, variableIndex) => variableIndex !== index)
}

function keyStatus(variable: TaskVariable, index: number) {
  const key = variable.key.trim()
  if (!isValidVariableKey(key)) return 'error'
  return variables.value.some((item, itemIndex) => itemIndex !== index && item.key.trim() === key) ? 'warning' : undefined
}
</script>

<template>
  <section class="variables-editor">
    <header class="variables-header">
      <div class="variables-copy">
        <strong>运行变量</strong>
        <span>用于在动作参数中复用 {{ '{' }}{{ '{' }}variable{{ '}' }}{{ '}' }}。</span>
      </div>
      <NButton secondary size="small" @click="createVariable">新增变量</NButton>
    </header>

    <NEmpty v-if="variables.length === 0" size="small" description="未配置变量" />

    <div v-else class="variables-list">
      <div v-for="(variable, index) in variables" :key="`${variable.key}-${index}`" class="variable-row">
        <NFormItem label="Key" :validation-status="keyStatus(variable, index)">
          <NInput
            :value="variable.key"
            placeholder="projectDir"
            @update:value="(value: string) => patchVariable(index, { key: value })"
          />
        </NFormItem>
        <NFormItem label="标签" :validation-status="variable.label.trim() ? undefined : 'error'">
          <NInput
            :value="variable.label"
            placeholder="项目目录"
            @update:value="(value: string) => patchVariable(index, { label: value })"
          />
        </NFormItem>
        <NFormItem label="默认值">
          <NInput
            :value="variable.defaultValue"
            :type="variable.secret ? 'password' : 'text'"
            :show-password-on="variable.secret ? 'click' : undefined"
            placeholder="运行时可覆盖"
            @update:value="(value: string) => patchVariable(index, { defaultValue: value })"
          />
        </NFormItem>
        <div class="variable-flags">
          <NCheckbox
            :checked="variable.required"
            @update:checked="(value: boolean) => patchVariable(index, { required: value })"
          >
            必填
          </NCheckbox>
          <NCheckbox
            :checked="variable.secret"
            @update:checked="(value: boolean) => patchVariable(index, { secret: value })"
          >
            敏感
          </NCheckbox>
          <NButton quaternary type="error" size="small" @click="removeVariable(index)">删除</NButton>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.variables-editor {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--app-divider);
  padding-top: 20px;
}

.variables-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.variables-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.variables-copy strong {
  color: var(--app-text);
  font-size: 16px;
}

.variables-copy span {
  color: var(--app-muted);
  font-size: 13px;
}

.variables-list {
  display: grid;
  gap: 10px;
}

.variable-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.9fr) minmax(112px, 1fr) minmax(140px, 1.2fr);
  gap: 10px;
  border: 1px solid var(--app-divider);
  border-radius: 8px;
  padding: 10px;
}

.variable-flags {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 560px) {
  .variables-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .variables-header :deep(.n-button) {
    width: 100%;
  }

  .variable-row {
    grid-template-columns: 1fr;
  }

  .variable-flags {
    justify-content: flex-start;
  }
}
</style>
