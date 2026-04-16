<template>
  <div class="editor" v-loading="loading">
    <div class="bar">
      <el-button type="primary" @click="save">保存画布</el-button>
      <span class="hint">编码：{{ code }}</span>
    </div>
    <el-input v-model="canvasText" type="textarea" :rows="22" class="mono" placeholder="组态 JSON（可粘贴 dbscada 导出结构）" />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as api from '@/api/scada'

const route = useRoute()
const code = ref('')
const canvasText = ref('{}')
const loading = ref(false)

const load = async () => {
  const c = route.query.code
  if (!c) {
    ElMessage.error('缺少 code 参数')
    return
  }
  code.value = c
  loading.value = true
  try {
    const res = await api.getScadaInfoByCode(c)
    const row = res.data
    canvasText.value = row.canvas_data && row.canvas_data !== '' ? row.canvas_data : '{}'
  } finally {
    loading.value = false
  }
}

const save = async () => {
  try {
    JSON.parse(canvasText.value)
  } catch {
    ElMessage.error('JSON 格式无效')
    return
  }
  await api.saveScadaCanvas({ scada_code: code.value, canvas_data: canvasText.value })
  ElMessage.success('已保存')
}

onMounted(load)
watch(() => route.query.code, load)
</script>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.hint {
  color: #888;
  font-size: 13px;
}
.mono :deep(textarea) {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
