<template>
  <div class="ep-after-scripts">
    <div class="ep-as-toolbar">
      <el-button size="small" type="primary" plain @click="addRow">添加脚本</el-button>
      <span class="ep-as-hint">
        每次接口执行（调试 + 线上出站）会在<strong>应用级 after_response 之后</strong>按顺序执行已启用脚本；勾选「默认」的先执行。
        脚本须定义 <code>function main(ctx)</code>，可用 <code>ctx.getResponseBody()</code>/<code>ctx.setResponseBody()</code>、
        <code>ctx.getResponseStatus()</code>/<code>ctx.setResponseStatus()</code> 改写整个接口返回，及 <code>ctx.getContext/setContext</code> 等。
      </span>
    </div>

    <div v-if="!rows.length" class="ep-as-empty">暂无接口级响应后脚本，点「添加脚本」开始。</div>

    <div v-for="(row, idx) in rows" :key="row._key" class="ep-as-block">
      <div class="ep-as-head">
        <el-button size="small" link @click="toggleCollapse(idx)" class="ep-as-collapse-btn">
          {{ row._collapsed ? '▶' : '▼' }}
        </el-button>
        <span class="ep-as-idx">#{{ idx + 1 }}</span>
        <el-input v-model="row.name" placeholder="名称（可选）" class="ep-as-name" clearable @input="emitChange" />
        <el-checkbox v-model="row.enabled" @change="emitChange">启用</el-checkbox>
        <template v-if="!row._collapsed">
          <el-checkbox :model-value="row.default" @change="(v) => setDefault(idx, v)">默认（最优先）</el-checkbox>
          <span class="ep-as-timeout-label">超时 ms</span>
          <el-input-number v-model="row.timeout_ms" :min="100" :max="5000" :step="100" size="small" @change="emitChange" />
          <el-button size="small" :disabled="idx === 0" @click="move(idx, -1)">上移</el-button>
          <el-button size="small" :disabled="idx >= rows.length - 1" @click="move(idx, 1)">下移</el-button>
        </template>
        <el-button size="small" type="danger" link @click="remove(idx)">删除</el-button>
        <el-button v-if="row._aiPrev != null" size="small" type="warning" link @click="undoAI(idx)">撤销 AI</el-button>
      </div>
      <template v-if="!row._collapsed">
        <ExtensionScriptEditor
          v-model="row.code"
          phase="after"
          placeholder="function main(ctx) { ... }"
          :min-height="200"
          @update:modelValue="emitChange"
        />
        <ExtScriptAIAssistant
          phase="after"
          :app-id="appId"
          :current-code="row.code"
          @apply="(code) => applyAI(idx, code)"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ExtensionScriptEditor from '@/components/ExtensionScriptEditor.vue'
import ExtScriptAIAssistant from '@/components/ExtScriptAIAssistant.vue'

const props = defineProps({
  // 形如 { after_response: [{name,enabled,default,code,timeout_ms}...] }
  modelValue: { type: Object, default: () => ({}) },
  appId: { type: [Number, String], default: 0 }
})
const emit = defineEmits(['update:modelValue'])

const rows = ref([])

function rowKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fromModel(val) {
  const arr = (val && Array.isArray(val.after_response)) ? val.after_response : []
  return arr.map((item) => ({
    _key: rowKey(),
    _aiPrev: null,
    _collapsed: false,
    name: typeof item?.name === 'string' ? item.name : '',
    enabled: !!item?.enabled,
    default: !!item?.default,
    timeout_ms: item?.timeout_ms != null ? Number(item.timeout_ms) || 800 : 800,
    code: typeof item?.code === 'string' ? item.code : ''
  }))
}

function toggleCollapse(idx) {
  rows.value[idx]._collapsed = !rows.value[idx]._collapsed
}

function toModel() {
  return {
    after_response: rows.value.map((r) => ({
      name: String(r.name || '').trim(),
      enabled: !!r.enabled,
      default: !!r.default,
      timeout_ms: Number(r.timeout_ms) || 800,
      code: String(r.code || '')
    }))
  }
}

// 仅在外部赋值（如加载接口）时重建行；避免把自身 emit 的更新再次灌回导致光标/焦点丢失。
let suppressWatch = false
watch(
  () => props.modelValue,
  (v) => {
    if (suppressWatch) { suppressWatch = false; return }
    rows.value = fromModel(v)
  },
  { immediate: true, deep: false }
)

function emitChange() {
  suppressWatch = true
  emit('update:modelValue', toModel())
}

function addRow() {
  rows.value.push({
    _key: rowKey(),
    _aiPrev: null,
    _collapsed: false,
    name: '',
    enabled: true,
    default: false,
    timeout_ms: 800,
    code: 'function main(ctx) {\n  // 读取响应体并按需改写整个返回\n  var raw = ctx.getResponseBody();\n  // ctx.setResponseBody(JSON.stringify({ code: 0, data: JSON.parse(raw || "null") }));\n}\n'
  })
  emitChange()
}

function setDefault(idx, on) {
  const row = rows.value[idx]
  if (!row) return
  if (on) rows.value.forEach((r, i) => { r.default = i === idx })
  else row.default = false
  emitChange()
}

function move(idx, delta) {
  const j = idx + delta
  if (j < 0 || j >= rows.value.length) return
  const t = rows.value[idx]
  rows.value[idx] = rows.value[j]
  rows.value[j] = t
  emitChange()
}

function remove(idx) {
  rows.value.splice(idx, 1)
  emitChange()
}

async function applyAI(idx, code) {
  const row = rows.value[idx]
  if (!row) return
  const prev = String(row.code || '')
  if (prev.trim()) {
    try {
      await ElMessageBox.confirm('将用 AI 生成的代码替换当前脚本内容，是否继续？（可点「撤销 AI」恢复）', '确认替换', {
        type: 'warning',
        confirmButtonText: '替换',
        cancelButtonText: '取消'
      })
    } catch (e) {
      return
    }
  }
  row._aiPrev = prev
  row.code = code
  emitChange()
  ElMessage.success('已应用 AI 脚本，可点「撤销 AI」恢复')
}

function undoAI(idx) {
  const row = rows.value[idx]
  if (!row || row._aiPrev == null) return
  row.code = row._aiPrev
  row._aiPrev = null
  emitChange()
  ElMessage.success('已恢复为应用前的脚本')
}
</script>

<style scoped>
.ep-after-scripts {
  width: 100%;
}
.ep-as-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}
.ep-as-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.ep-as-empty {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
}
.ep-as-block {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 12px;
  background: var(--el-fill-color-blank);
}
.ep-as-block--collapsed {
  padding-bottom: 10px;
}
.ep-as-collapse-btn {
  font-size: 11px;
  padding: 0 4px;
  color: var(--el-text-color-secondary);
}
.ep-as-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.ep-as-idx {
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.ep-as-name {
  width: 160px;
}
.ep-as-timeout-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
