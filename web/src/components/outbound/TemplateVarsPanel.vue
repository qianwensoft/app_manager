<template>
  <div class="tvp-wrap">
    <div v-if="loading" class="tvp-loading">加载中…</div>
    <template v-else>
      <div class="tvp-section">
        <div class="tvp-title">占位符变量</div>
        <div v-for="v in vars" :key="v.key" class="tvp-row" @click="copy(wrap(v.key))">
          <code class="tvp-key">{{ wrap(v.key) }}</code>
          <span class="tvp-desc">{{ v.desc }}</span>
        </div>
      </div>
      <div class="tvp-section">
        <div class="tvp-title">模板函数</div>
        <div v-for="f in funcs" :key="f.label" class="tvp-row" @click="copy(wrap(f.apply))">
          <code class="tvp-key">{{ wrap(f.apply) }}</code>
          <span class="tvp-desc">{{ f.desc }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getOutboundTemplateVars } from '@/api/outbound'

const vars = ref([])
const funcs = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const r = await getOutboundTemplateVars()
    vars.value = r.data.variables || []
    funcs.value = r.data.functions || []
  } finally {
    loading.value = false
  }
})

function wrap(s) { return '\u007b\u007b' + s + '\u007d\u007d' }

import { copyText } from '@/utils/clipboard'

function copy(text) {
  copyText(text).then(() => ElMessage.success('已复制'))
}
</script>

<style scoped>
.tvp-wrap {
  font-size: 12px;
  max-height: 420px;
  overflow-y: auto;
}
.tvp-loading {
  color: var(--el-text-color-secondary);
  padding: 8px;
}
.tvp-section {
  margin-bottom: 12px;
}
.tvp-title {
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
  padding: 2px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.tvp-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 3px;
  cursor: pointer;
}
.tvp-row:hover {
  background: var(--el-fill-color-light);
}
.tvp-key {
  flex-shrink: 0;
  color: var(--el-color-primary);
  font-size: 11px;
}
.tvp-desc {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
