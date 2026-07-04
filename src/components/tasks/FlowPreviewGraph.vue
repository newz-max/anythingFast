<script setup lang="ts">
import { computed } from 'vue'
import type { FlowPreviewEdge, FlowPreviewModel, FlowPreviewNode } from '@/domain/flowPreview'

const props = defineProps<{
  model: FlowPreviewModel
}>()

const rows = computed(() =>
  props.model.nodes.map((node) => ({
    node,
    outgoingEdges: props.model.edges.filter((edge) => edge.fromActionId === node.actionId)
  }))
)

function riskTagType(riskLevel: FlowPreviewNode['riskLevel']) {
  if (riskLevel === 'high') return 'error'
  if (riskLevel === 'medium') return 'warning'
  return 'success'
}

function edgeClass(edge: FlowPreviewEdge) {
  return {
    'flow-edge-met': edge.outcome === 'condition-met',
    'flow-edge-not-met': edge.outcome === 'condition-not-met'
  }
}
</script>

<template>
  <section class="flow-preview" aria-label="流程预览图">
    <div v-if="rows.length > 0" class="flow-scroll">
      <ol class="flow-sequence">
        <li v-for="row in rows" :key="row.node.id" class="flow-row">
          <article
            class="flow-node"
            :class="{
              'flow-node-disabled': !row.node.enabled,
              [`flow-node-${row.node.status?.status}`]: row.node.status
            }"
          >
            <div class="node-index">{{ row.node.order }}</div>
            <div class="node-main">
              <div class="node-title-row">
                <strong class="node-title">{{ row.node.title }}</strong>
                <NTag size="small" :type="riskTagType(row.node.riskLevel)">
                  {{ row.node.riskLevel }}
                </NTag>
                <NTag v-if="!row.node.enabled" size="small" type="default">停用</NTag>
                <NTag v-if="row.node.status" size="small" :type="row.node.status.type">
                  {{ row.node.status.label }}
                </NTag>
              </div>
              <div class="node-meta">{{ row.node.actionTypeLabel }} · {{ row.node.detail }}</div>
              <div v-if="row.node.conditionSummary" class="node-condition">
                {{ row.node.conditionSummary }}
              </div>
              <div v-if="row.node.status?.message" class="node-status-message">
                {{ row.node.status.message }}
              </div>
            </div>
          </article>

          <div v-if="row.outgoingEdges.length > 0" class="flow-edges" aria-hidden="true">
            <div v-for="edge in row.outgoingEdges" :key="edge.id" class="flow-edge" :class="edgeClass(edge)">
              <span class="edge-line"></span>
              <span class="edge-label">{{ edge.label }}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>

    <NEmpty v-else description="还没有动作可预览" />
  </section>
</template>

<style scoped>
.flow-preview {
  min-width: 0;
}

.flow-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.flow-sequence {
  display: grid;
  min-width: min(100%, 620px);
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow-row {
  display: grid;
  gap: 8px;
}

.flow-node {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 14px;
  min-height: 94px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 10px;
  background: rgba(27, 35, 55, 0.74);
  padding: 16px;
}

.flow-node-disabled {
  opacity: 0.55;
}

.flow-node-running {
  border-color: rgba(77, 135, 255, 0.5);
  background:
    radial-gradient(circle at 100% 0%, rgba(77, 135, 255, 0.16), transparent 42%),
    rgba(27, 35, 55, 0.8);
}

.flow-node-success {
  border-color: rgba(34, 197, 94, 0.34);
}

.flow-node-failed {
  border-color: rgba(239, 68, 68, 0.42);
}

.flow-node-skipped,
.flow-node-cancelled {
  border-color: rgba(245, 158, 11, 0.34);
}

.node-index {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: rgba(65, 89, 175, 0.42);
  color: #dce9ff;
  font-weight: 800;
}

.node-main {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.node-title-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.node-title {
  overflow: hidden;
  color: #f4f7ff;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-meta,
.node-condition,
.node-status-message {
  min-width: 0;
  color: #b3bddb;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.node-condition {
  color: #98a7d9;
}

.node-status-message {
  color: #d7def5;
}

.flow-edges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 0 8px 54px;
}

.flow-edge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  color: #98a7d9;
  font-size: 12px;
}

.edge-line {
  width: 34px;
  height: 1px;
  background: rgba(152, 167, 217, 0.5);
}

.edge-label {
  white-space: nowrap;
}

.flow-edge-met {
  color: #86efac;
}

.flow-edge-not-met {
  color: #facc15;
}

.flow-edge-met .edge-line {
  background: rgba(134, 239, 172, 0.62);
}

.flow-edge-not-met .edge-line {
  background: rgba(250, 204, 21, 0.62);
}

@media (max-width: 720px) {
  .flow-sequence {
    min-width: 0;
  }

  .flow-node {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    padding: 14px;
  }

  .node-index {
    width: 30px;
    height: 30px;
  }

  .node-title {
    white-space: normal;
  }

  .flow-edges {
    display: grid;
    padding-left: 42px;
  }

  .edge-label {
    white-space: normal;
  }
}
</style>
