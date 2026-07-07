<script setup lang="ts">
import type { TaskView } from '@/domain/taskViews'
import type { AppTheme, TaskTag } from '@/types/domain'

interface NavigationItem {
  key: TaskView
  icon: string
  label: string
  count: number
  active: boolean
  disabled: boolean
}

type SidebarTag = TaskTag & { tone: string }

defineProps<{
  logoUrl: string
  navigationItems: NavigationItem[]
  tags: SidebarTag[]
  selectedTagId: string | null
  shortcutWarning: string
  theme: AppTheme
}>()

const emit = defineEmits<{
  'create-task': []
  'set-view': [view: TaskView]
  'select-tag': [tagId: string | null]
  'create-tag': []
  'rename-tag': [tag: TaskTag]
  'delete-tag': [tag: TaskTag]
  'open-settings': []
  'open-help': []
  'cycle-theme': []
}>()
</script>

<template>
  <aside class="sidebar">
    <section class="brand">
      <div class="brand-mark" aria-hidden="true">
        <img :src="logoUrl" alt="" />
      </div>
      <div>
        <h1 class="brand-title">FlowTask</h1>
        <p class="brand-subtitle">事项管理器</p>
      </div>
      <span class="collapse-mark" aria-hidden="true">‹‹</span>
    </section>

    <button class="create-button" type="button" @click="emit('create-task')">
      <span aria-hidden="true">＋</span>
      创建事项
    </button>

    <nav class="nav-list" aria-label="主导航">
      <button
        v-for="item in navigationItems"
        :key="item.key"
        class="nav-item"
        :class="{ active: item.active, disabled: item.disabled }"
        type="button"
        :disabled="item.disabled"
        @click="!item.disabled && emit('set-view', item.key)"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
        <span class="nav-count">{{ item.count }}</span>
      </button>
    </nav>

    <section class="tag-block">
      <header class="tag-header">
        <span>标签</span>
        <button type="button" aria-label="新增标签" @click="emit('create-tag')">＋</button>
      </header>
      <div class="tag-list">
        <button class="tag-item all-tags" :class="{ active: selectedTagId === null }" type="button" @click="emit('select-tag', null)">
          <span class="tag-dot slate" aria-hidden="true"></span>
          <span>全部标签</span>
        </button>
        <div v-for="item in tags" :key="item.id" class="tag-item-row">
          <button class="tag-item" :class="{ active: selectedTagId === item.id }" type="button" @click="emit('select-tag', item.id)">
            <span class="tag-dot" :class="item.tone" aria-hidden="true"></span>
            <span>{{ item.name }}</span>
          </button>
          <button class="tag-inline-action" type="button" aria-label="编辑标签" @click="emit('rename-tag', item)">⌕</button>
          <button class="tag-inline-action" type="button" aria-label="删除标签" @click="emit('delete-tag', item)">×</button>
        </div>
        <p v-if="tags.length === 0" class="empty-tags">暂无标签</p>
      </div>
    </section>

    <section class="promo-card" aria-label="自动化提示">
      <div class="promo-logo" aria-hidden="true">
        <img :src="logoUrl" alt="" />
      </div>
      <h2>释放效率，从自动化开始</h2>
      <p>将重复的操作流程化，一键触发</p>
      <button type="button" @click="emit('open-help')">了解更多 →</button>
    </section>

    <footer class="sidebar-footer">
      <button type="button" aria-label="设置" @click="emit('open-settings')">⚙</button>
      <button type="button" aria-label="帮助" @click="emit('open-help')">?</button>
      <button type="button" aria-label="主题" :title="`当前主题：${theme}`" @click="emit('cycle-theme')">☼</button>
      <button class="orb-button" type="button" aria-label="状态"></button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 32px 22px 24px;
}

.brand {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.brand-mark,
.promo-logo {
  position: relative;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}

.brand-mark img,
.promo-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 8px 14px rgba(35, 101, 255, 0.28));
  pointer-events: none;
}

.brand-title,
.brand-subtitle,
.promo-card h2,
.promo-card p {
  margin: 0;
}

.brand-title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
}

:global([data-app-theme="light"]) .brand-title {
  color: #172033;
}

.brand-subtitle {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.collapse-mark {
  color: #b6c1df;
  font-size: 26px;
  letter-spacing: -7px;
}

.create-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 46px;
  margin-top: 42px;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, #3a9bff 0%, #4e4dff 100%);
  box-shadow: 0 14px 32px rgba(53, 91, 255, 0.36);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
}

.create-button span {
  font-size: 24px;
  font-weight: 400;
  line-height: 1;
}

.nav-list {
  display: grid;
  gap: 10px;
  margin-top: 38px;
}

.nav-item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  height: 49px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #b6c1df;
  cursor: pointer;
  padding: 0 15px;
  text-align: left;
}

.nav-item.disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.nav-item.active {
  border-color: rgba(63, 104, 255, 0.44);
  background: linear-gradient(135deg, rgba(32, 60, 132, 0.48), rgba(37, 32, 112, 0.46));
  color: #f4f7ff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 28px rgba(21, 50, 129, 0.18);
  font-weight: 700;
}

.nav-icon {
  color: #c7d3ee;
  font-size: 19px;
}

.nav-count {
  color: #7f8aaa;
  font-size: 12px;
}

.tag-block {
  margin-top: 28px;
}

.tag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  color: #65708f;
  font-size: 13px;
}

.tag-header button {
  border: 0;
  background: transparent;
  color: #9faad0;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.tag-list {
  display: grid;
  gap: 10px;
  max-height: min(24vh, 220px);
  margin-top: 20px;
  overflow-y: auto;
  padding: 0 8px;
}

.tag-item {
  display: grid;
  grid-template-columns: 11px minmax(0, 1fr);
  align-items: center;
  width: 100%;
  gap: 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #9faad0;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 8px;
  text-align: left;
}

.tag-item.active {
  border-color: rgba(82, 106, 171, 0.2);
  background: rgba(27, 35, 55, 0.54);
  color: #f4f7ff;
}

.tag-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px 26px;
  align-items: center;
  gap: 4px;
}

.tag-inline-action {
  display: grid;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #65708f;
  cursor: pointer;
  font-size: 14px;
}

.tag-inline-action:hover {
  background: rgba(82, 106, 171, 0.16);
  color: #dce9ff;
}

.empty-tags {
  margin: 4px 8px 0;
  color: #65708f;
  font-size: 12px;
}

.tag-dot {
  width: 11px;
  height: 11px;
  border-radius: 4px;
  background: #3a8bff;
}

.tag-dot.green {
  background: #29d6ad;
}

.tag-dot.amber {
  background: #ffb83e;
}

.tag-dot.purple {
  background: #ad66ff;
}

.tag-dot.slate {
  background: #8b96b8;
}

.promo-card {
  align-self: end;
  min-height: 228px;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 13px;
  background:
    radial-gradient(circle at 16% 10%, rgba(76, 89, 255, 0.5), transparent 36%),
    radial-gradient(circle at 82% 0%, rgba(34, 139, 255, 0.28), transparent 48%),
    rgba(16, 33, 68, 0.7);
  padding: 30px 18px 18px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.promo-logo {
  transform: scale(0.78);
  transform-origin: left top;
}

.promo-card h2 {
  margin-top: 26px;
  font-size: 15px;
}

.promo-card p {
  margin-top: 12px;
  color: #9faad0;
  font-size: 12px;
}

.promo-card button {
  height: 42px;
  margin-top: 18px;
  border: 0;
  border-radius: 10px;
  background: rgba(42, 54, 88, 0.86);
  color: #f4f7ff;
  cursor: pointer;
  padding: 0 18px;
  font-weight: 700;
}

.sidebar-footer {
  display: grid;
  grid-template-columns: repeat(3, 40px) minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 28px;
}

.sidebar-footer button {
  height: 32px;
  border: 0;
  background: transparent;
  color: #8290b7;
  cursor: pointer;
  font-size: 18px;
}

.orb-button {
  justify-self: end;
  width: 60px;
  height: 60px !important;
  border-radius: 50%;
  background:
    radial-gradient(circle at 60% 42%, #63c8ff 0 10%, #534bff 11% 34%, #1c2a58 35% 100%) !important;
  box-shadow: 0 12px 28px rgba(33, 64, 169, 0.3);
}

@media (max-width: 1279px) {
  .sidebar {
    justify-items: center;
    padding: 22px 12px 18px;
  }

  .brand {
    grid-template-columns: 44px;
    justify-items: center;
  }

  .brand > div:not(.brand-mark),
  .collapse-mark,
  .nav-item span:not(.nav-icon),
  .tag-block,
  .promo-card,
  .orb-button {
    display: none;
  }

  .nav-list {
    margin-top: 30px;
  }

  .create-button {
    width: 48px;
    height: 48px;
    margin-top: 26px;
    border-radius: 12px;
    font-size: 0;
    gap: 0;
    padding: 0;
  }

  .create-button span {
    font-size: 24px;
  }

  .nav-item {
    grid-template-columns: 1fr;
    width: 48px;
    height: 48px;
    justify-items: center;
    padding: 0;
  }

  .nav-icon {
    font-size: 20px;
  }

  .sidebar-footer {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
    margin-top: 18px;
  }
}

@media (max-width: 960px) {
  .sidebar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
  }

  .brand {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .brand > div:not(.brand-mark) {
    display: block;
  }

  .nav-list,
  .sidebar-footer {
    display: flex;
    margin-top: 0;
  }
}

@media (max-width: 640px) {
  .sidebar {
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
