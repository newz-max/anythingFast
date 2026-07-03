<script setup lang="ts">
import { computed } from 'vue'
import { usePathPicker } from '@/composables/usePathPicker'
import type { ActionParams, ActionType, TaskAction } from '@/types/domain'

const action = defineModel<TaskAction>({ required: true })
type MutableParams = Record<string, any>
const { pickDirectory, pickScriptFile } = usePathPicker()

const commandShellOptions = [
  { label: 'PowerShell 7', value: 'pwsh' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'cmd', value: 'cmd' }
]

const commandSourceOptions = [
  { label: '命令文本', value: 'inline' },
  { label: '脚本文件', value: 'script' }
]

const actionTypeOptions = [
  { label: '打开程序', value: 'openProgram' as const },
  { label: '打开 URL', value: 'openUrl' as const },
  { label: '打开文件', value: 'openFile' as const },
  { label: '打开文件夹', value: 'openFolder' as const },
  { label: '执行命令', value: 'runCommand' as const },
  { label: '延时等待', value: 'delay' as const }
]

const pathLabel = computed(() => (action.value.type === 'openProgram' ? '程序路径' : action.value.type === 'openFolder' ? '文件夹路径' : '文件路径'))
const params = computed(() => action.value.params as MutableParams)
const commandSource = computed({
  get: () => params.value.source || 'inline',
  set: (value: string) => {
    patchParams({ source: value })
  }
})

function patchAction(patch: Partial<TaskAction>) {
  action.value = {
    ...action.value,
    ...patch
  }
}

function patchParams(patch: MutableParams) {
  patchAction({
    params: {
      ...params.value,
      ...patch
    } as ActionParams
  })
}

function setActionType(type: ActionType) {
  patchAction({
    type,
    params: defaultParams(type)
  })
}

function defaultParams(type: ActionType): ActionParams {
  switch (type) {
    case 'openProgram':
      return { path: '', args: [], workingDir: '' }
    case 'openUrl':
      return { url: 'https://' }
    case 'openFile':
    case 'openFolder':
      return { path: '' }
    case 'runCommand':
      return { source: 'inline', command: '', workingDir: '', env: {}, showTerminal: false, shell: 'powershell', scriptPath: '', scriptArgs: [] }
    case 'delay':
      return { durationMs: 1000 }
  }
}

async function chooseWorkingDir() {
  const selected = await pickDirectory(textParam('workingDir'))
  if (selected) {
    patchParams({ workingDir: selected })
  }
}

async function chooseScriptFile() {
  const selected = await pickScriptFile(textParam('scriptPath'))
  if (selected) {
    patchParams({ scriptPath: selected })
  }
}

function textParam(key: string) {
  const value = params.value[key]
  return typeof value === 'string' ? value : ''
}

function numberParam(key: string) {
  const value = params.value[key]
  return typeof value === 'number' ? value : null
}

function stringListParam(key: string) {
  const value = params.value[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function updateStringListParam(key: string, value: string) {
  patchParams({ [key]: value.split(' ').filter(Boolean) })
}

function updateScriptArgs(value: string) {
  updateStringListParam('scriptArgs', value)
}
</script>

<template>
  <NForm class="param-form" label-placement="top">
    <NGrid :cols="3" :x-gap="12" :y-gap="8" responsive="screen">
      <NGi>
        <NFormItem label="动作类型">
          <NSelect :value="action.type" :options="actionTypeOptions" @update:value="setActionType" />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="超时时间 ms">
          <NInputNumber
            :value="action.timeoutMs ?? null"
            clearable
            :min="1"
            placeholder="可选"
            @update:value="(value: number | null) => patchAction({ timeoutMs: value })"
          />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="失败后继续">
          <NSwitch
            :value="Boolean(action.continueOnError)"
            @update:value="(value: boolean) => patchAction({ continueOnError: value })"
          />
        </NFormItem>
      </NGi>
    </NGrid>

    <template v-if="action.type === 'openProgram' && 'path' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem :label="pathLabel" required>
            <NInput :value="textParam('path')" placeholder="C:\\Program Files\\..." @update:value="(value: string) => patchParams({ path: value })" />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="启动参数">
            <NInput
              :value="stringListParam('args').join(' ')"
              placeholder="按空格分隔"
              @update:value="(value: string) => updateStringListParam('args', value)"
            />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="工作目录">
            <NInput :value="textParam('workingDir')" placeholder="可选" @update:value="(value: string) => patchParams({ workingDir: value })" />
          </NFormItem>
        </NGi>
      </NGrid>
    </template>

    <template v-else-if="action.type === 'openUrl' && 'url' in action.params">
      <NFormItem label="URL" required>
        <NInput :value="textParam('url')" placeholder="https://example.com" @update:value="(value: string) => patchParams({ url: value })" />
      </NFormItem>
    </template>

    <template v-else-if="(action.type === 'openFile' || action.type === 'openFolder') && 'path' in action.params">
      <NFormItem :label="pathLabel" required>
        <NInput :value="textParam('path')" placeholder="C:\\Users\\..." @update:value="(value: string) => patchParams({ path: value })" />
      </NFormItem>
    </template>

    <template v-else-if="action.type === 'runCommand' && 'command' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem label="输入方式">
            <NRadioGroup v-model:value="commandSource">
              <NRadioButton v-for="option in commandSourceOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </NRadioButton>
            </NRadioGroup>
          </NFormItem>
        </NGi>
        <NGi v-if="commandSource === 'inline'">
          <NFormItem label="Shell">
            <NSelect :value="textParam('shell')" :options="commandShellOptions" @update:value="(value: string) => patchParams({ shell: value })" />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="显示终端窗口">
            <NSwitch :value="Boolean(params.showTerminal)" @update:value="(value: boolean) => patchParams({ showTerminal: value })" />
          </NFormItem>
        </NGi>
      </NGrid>
      <NGrid v-if="commandSource === 'inline'" :cols="3" :x-gap="12" responsive="screen">
        <NGi :span="3">
          <NFormItem label="命令内容" required>
            <NInput
              :value="textParam('command')"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              @update:value="(value: string) => patchParams({ command: value })"
            />
          </NFormItem>
        </NGi>
      </NGrid>
      <NGrid v-else :cols="3" :x-gap="12" responsive="screen">
        <NGi :span="2">
          <NFormItem label="脚本文件" required>
            <NInputGroup>
              <NInput :value="textParam('scriptPath')" placeholder="选择 .ps1、.cmd 或 .bat 文件" @update:value="(value: string) => patchParams({ scriptPath: value })" />
              <NButton secondary @click="chooseScriptFile">选择</NButton>
            </NInputGroup>
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="脚本参数">
            <NInput
              :value="stringListParam('scriptArgs').join(' ')"
              placeholder="按空格分隔"
              @update:value="updateScriptArgs"
            />
          </NFormItem>
        </NGi>
      </NGrid>
      <NFormItem label="工作目录" required>
        <NInputGroup>
          <NInput :value="textParam('workingDir')" placeholder="C:\\Project\\anythingFast" @update:value="(value: string) => patchParams({ workingDir: value })" />
          <NButton secondary @click="chooseWorkingDir">选择</NButton>
        </NInputGroup>
      </NFormItem>
    </template>

    <template v-else-if="action.type === 'delay'">
      <NFormItem label="等待时长 ms">
        <NInputNumber
          :value="numberParam('durationMs')"
          clearable
          :min="1"
          placeholder="可选，留空为 0ms"
          @update:value="(value: number | null) => patchParams({ durationMs: value })"
        />
      </NFormItem>
    </template>
  </NForm>
</template>

<style scoped>
.param-form {
  padding-top: 4px;
}
</style>
