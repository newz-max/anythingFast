<script setup lang="ts">
defineProps<{
  logoUrl: string
  title: string
}>()

const emit = defineEmits<{
  minimize: []
  'toggle-maximize': []
  close: []
}>()
</script>

<template>
  <header class="app-titlebar" data-tauri-drag-region>
    <div class="window-brand" data-tauri-drag-region>
      <div class="titlebar-mark" aria-hidden="true" data-tauri-drag-region>
        <img :src="logoUrl" alt="" data-tauri-drag-region />
      </div>
      <span data-tauri-drag-region>{{ title }}</span>
    </div>
    <div class="window-controls" aria-label="窗口操作">
      <button class="window-control" type="button" aria-label="最小化" @click.stop="emit('minimize')">
        <span aria-hidden="true"></span>
      </button>
      <button class="window-control" type="button" aria-label="最大化" @click.stop="emit('toggle-maximize')">
        <span aria-hidden="true"></span>
      </button>
      <button class="window-control window-control-close" type="button" aria-label="关闭" @click.stop="emit('close')">
        <span aria-hidden="true"></span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-titlebar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: 56px;
  border-bottom: 1px solid rgba(82, 106, 171, 0.16);
  background: rgba(5, 11, 27, 0.42);
  color: #f4f7ff;
  user-select: none;
}

:global([data-app-theme="light"]) .app-titlebar {
  background: rgba(238, 243, 251, 0.72);
}

.window-brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding-left: 30px;
  font-size: 16px;
  font-weight: 700;
}

.window-brand > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global([data-app-theme="light"]) .window-brand {
  color: #172033;
}

.titlebar-mark {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
}

.titlebar-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.window-controls {
  display: flex;
  height: 56px;
  align-items: stretch;
}

.window-control {
  position: relative;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #d5def7;
  cursor: pointer;
}

.window-control:hover {
  background: rgba(82, 106, 171, 0.18);
}

.window-control span {
  position: relative;
  display: block;
  width: 16px;
  height: 16px;
}

.window-control:first-child span::before {
  position: absolute;
  right: 1px;
  bottom: 3px;
  left: 1px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.window-control:nth-child(2) span::before {
  position: absolute;
  inset: 2px;
  border: 2px solid currentColor;
  border-radius: 2px;
  content: "";
}

.window-control-close {
  margin: 8px 14px 8px 0;
  width: 48px;
  height: 40px;
  border-radius: 13px;
  color: #ff6b7b;
}

.window-control-close:hover {
  background: rgba(255, 72, 96, 0.18);
}

.window-control-close span::before,
.window-control-close span::after {
  position: absolute;
  top: 7px;
  left: 1px;
  width: 15px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.window-control-close span::before {
  transform: rotate(45deg);
}

.window-control-close span::after {
  transform: rotate(-45deg);
}

@media (max-width: 640px) {
  .app-titlebar {
    height: auto;
    min-height: 56px;
  }

  .window-brand {
    padding-left: 14px;
    font-size: 14px;
  }

  .titlebar-mark {
    width: 28px;
    height: 28px;
    flex-basis: 28px;
  }

  .window-control {
    width: 44px;
  }

  .window-control-close {
    width: 42px;
    margin-right: 8px;
  }
}
</style>
