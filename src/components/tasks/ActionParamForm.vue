<script setup lang="ts">
import { computed } from 'vue'
import type { TaskAction } from '@/types/domain'

const action = defineModel<TaskAction>({ required: true })
type MutableParams = Record<string, any>

const commandShellOptions = [
  { label: 'PowerShell', value: 'powershell' },
  { label: 'cmd', value: 'cmd' }
]

const actionTypeOptions = [
  { label: '打开程序', value: 'openProgram' },
  { label: '打开 URL', value: 'openUrl' },
  { label: '打开文件', value: 'openFile' },
  { label: '打开文件夹', value: 'openFolder' },
  { label: '执行命令', value: 'runCommand' },
  { label: '延时等待', value: 'delay' }
]

const pathLabel = computed(() => (action.value.type === 'openProgram' ? '程序路径' : action.value.type === 'openFolder' ? '文件夹路径' : '文件路径'))
const params = computed(() => action.value.params as MutableParams)

function resetParams() {
  switch (action.value.type) {
    case 'openProgram':
      action.value.params = { path: '', args: [], workingDir: '' }
      break
    case 'openUrl':
      action.value.params = { url: 'https://' }
      break
    case 'openFile':
    case 'openFolder':
      action.value.params = { path: '' }
      break
    case 'runCommand':
      action.value.params = { command: '', workingDir: '', env: {}, showTerminal: false, shell: 'powershell' }
      break
    case 'delay':
      action.value.params = { durationMs: 1000 }
      break
  }
}
</script>

<template>
  <NForm class="param-form" label-placement="top">
    <NGrid :cols="3" :x-gap="12" :y-gap="8" responsive="screen">
      <NGi>
        <NFormItem label="动作类型">
          <NSelect v-model:value="action.type" :options="actionTypeOptions" @update:value="resetParams" />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="超时时间 ms">
          <NInputNumber v-model:value="action.timeoutMs" clearable :min="1" placeholder="可选" />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="失败后继续">
          <NSwitch v-model:value="action.continueOnError" />
        </NFormItem>
      </NGi>
    </NGrid>

    <template v-if="action.type === 'openProgram' && 'path' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem :label="pathLabel" required>
            <NInput v-model:value="params.path" placeholder="C:\\Program Files\\..." />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="启动参数">
            <NInput
              :value="params.args?.join(' ')"
              placeholder="按空格分隔"
              @update:value="(value: string) => params.args = value.split(' ').filter(Boolean)"
            />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="工作目录">
            <NInput v-model:value="params.workingDir" placeholder="可选" />
          </NFormItem>
        </NGi>
      </NGrid>
    </template>

    <template v-else-if="action.type === 'openUrl' && 'url' in action.params">
      <NFormItem label="URL" required>
        <NInput v-model:value="params.url" placeholder="https://example.com" />
      </NFormItem>
    </template>

    <template v-else-if="(action.type === 'openFile' || action.type === 'openFolder') && 'path' in action.params">
      <NFormItem :label="pathLabel" required>
        <NInput v-model:value="params.path" placeholder="C:\\Users\\..." />
      </NFormItem>
    </template>

    <template v-else-if="action.type === 'runCommand' && 'command' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi :span="2">
          <NFormItem label="命令内容" required>
            <NInput v-model:value="params.command" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="Shell">
            <NSelect v-model:value="params.shell" :options="commandShellOptions" />
          </NFormItem>
          <NFormItem label="显示终端窗口">
            <NSwitch v-model:value="params.showTerminal" />
          </NFormItem>
        </NGi>
      </NGrid>
      <NFormItem label="工作目录" required>
        <NInput v-model:value="params.workingDir" placeholder="C:\\Project\\anythingFast" />
      </NFormItem>
    </template>

    <template v-else-if="action.type === 'delay' && 'durationMs' in action.params">
      <NFormItem label="等待时长 ms" required>
        <NInputNumber v-model:value="params.durationMs" :min="1" />
      </NFormItem>
    </template>
  </NForm>
</template>

<style scoped>
.param-form {
  padding-top: 4px;
}
</style>
