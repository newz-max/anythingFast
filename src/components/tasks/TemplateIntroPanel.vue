<script setup lang="ts">
const emit = defineEmits<{
  'create-task': []
}>()
</script>

<template>
  <section class="template-intro" aria-label="模板说明">
    <div class="template-intro-copy">
      <span class="template-intro-icon" aria-hidden="true">▱</span>
      <h2>从模板创建事项</h2>
      <p>模板只会生成可编辑的事项草稿，不会直接运行任何动作。保存时仍会执行现有校验，后续运行也会保留风险确认。</p>
      <button class="create-button compact" type="button" @click="emit('create-task')">新建事项</button>
    </div>
  </section>
</template>

<style scoped>
:global([data-app-theme="light"]) .template-intro {
  background:
    radial-gradient(circle at 38% -8%, rgba(116, 152, 220, 0.12), transparent 38%),
    rgba(255, 255, 255, 0.78);
}

.template-intro {
  display: grid;
  align-content: center;
  gap: 30px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 24px;
  background:
    radial-gradient(circle at 100% 100%, rgba(63, 65, 188, 0.26), transparent 36%),
    radial-gradient(circle at 14% 0%, rgba(51, 92, 178, 0.18), transparent 42%),
    rgba(14, 19, 37, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 32px 80px rgba(0, 0, 0, 0.22);
  padding: 42px 36px 36px;
}

.template-intro-copy {
  display: grid;
  justify-items: start;
  gap: 16px;
  max-width: 560px;
}

.template-intro-icon {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  border: 1px solid rgba(81, 119, 255, 0.42);
  border-radius: 18px;
  background: linear-gradient(145deg, #2442a0, #162555);
  color: #dce9ff;
  font-size: 32px;
}

.template-intro-copy h2,
.template-intro-copy p {
  margin: 0;
}

.template-intro-copy h2 {
  color: #f4f7ff;
  font-size: 24px;
  font-weight: 800;
}

.template-intro-copy p {
  color: #9faad0;
  font-size: 14px;
  line-height: 1.7;
}

.create-button {
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #7c8cff, #5d7cff);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(81, 119, 255, 0.32);
}

.create-button.compact {
  padding: 10px 14px;
  font-size: 13px;
}

@media (max-width: 1279px) {
  .template-intro {
    gap: 24px;
    padding: 30px 22px;
  }
}

@media (max-width: 960px) {
  .template-intro {
    overflow: visible;
  }
}

@media (max-width: 640px) {
  .template-intro {
    border-radius: 18px;
    padding: 20px 16px;
  }
}
</style>
