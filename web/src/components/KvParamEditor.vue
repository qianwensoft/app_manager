<template>
  <div class="kv-param-editor">
    <div v-for="(row, i) in rows" :key="i" class="kv-row">
      <el-autocomplete
        v-model="row.key"
        placeholder="Key"
        size="small"
        style="width:200px"
        :fetch-suggestions="suggestKeys"
        @input="emit"
        @select="emit"
      />
      <span style="padding:0 4px;color:#94a3b8">=</span>
      <el-autocomplete
        v-model="row.value"
        placeholder="Value  (支持 {{app.xxx}}、{{code_resp.xxx}})"
        size="small"
        style="flex:1"
        :fetch-suggestions="(q, cb) => suggestValues(q, cb)"
        @input="emit"
        @select="emit"
      />
      <el-button link type="danger" size="small" style="margin-left:4px" @click="removeRow(i)">
        <el-icon><Minus /></el-icon>
      </el-button>
    </div>
    <el-button link size="small" style="margin-top:4px;color:#6366f1" @click="addRow">
      <el-icon><Plus /></el-icon> 添加参数
    </el-button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  appParams: { type: Array, default: () => [] },
  codeContextKeys: { type: Array, default: () => [] }
})
const emits = defineEmits(['update:modelValue'])

const rows = ref(props.modelValue.length ? props.modelValue.map(r => ({ ...r })) : [{ key: '', value: '' }])

watch(() => props.modelValue, (v) => {
  if (JSON.stringify(v) !== JSON.stringify(rows.value)) {
    rows.value = v.length ? v.map(r => ({ ...r })) : [{ key: '', value: '' }]
  }
}, { deep: true })

function emit() {
  emits('update:modelValue', rows.value.filter(r => r.key.trim()).map(r => ({ key: r.key, value: r.value })))
}

function addRow() {
  rows.value.push({ key: '', value: '' })
}

function removeRow(i) {
  rows.value.splice(i, 1)
  if (rows.value.length === 0) rows.value.push({ key: '', value: '' })
  emit()
}

function suggestKeys(q, cb) {
  cb([])
}

function suggestValues(q, cb) {
  const appSuggestions = props.appParams.map(p => ({ value: `{{app.${p.key}}}` }))
  const codeSuggestions = props.codeContextKeys.map(k => ({ value: `{{code_resp.${k}}}` }))
  const builtins = [
    { value: '{{access_token}}' },
    { value: '{{refresh_token}}' }
  ]
  const all = [...appSuggestions, ...codeSuggestions, ...builtins]
  const lower = (q || '').toLowerCase()
  cb(lower ? all.filter(s => s.value.toLowerCase().includes(lower)) : all)
}
</script>

<style scoped>
.kv-param-editor { width: 100%; }
.kv-row { display: flex; align-items: center; margin-bottom: 6px; }
</style>
