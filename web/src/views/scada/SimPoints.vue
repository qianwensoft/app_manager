<template>
  <div>
    <div class="toolbar">
      <el-input v-model="filterCode" placeholder="筛选 scada_code" clearable style="width: 200px; margin-right: 8px" />
      <el-button type="primary" @click="openDlg()">新建点位</el-button>
    </div>
    <el-table :data="filtered" border v-loading="loading">
      <el-table-column prop="scada_code" label="组态编码" width="160" />
      <el-table-column prop="link_name" label="link_name" width="160" />
      <el-table-column prop="mode" label="模式" width="120" />
      <el-table-column prop="interval_ms" label="间隔(ms)" width="100" />
      <el-table-column prop="enabled" label="启用" width="80">
        <template #default="{ row }">{{ row.enabled ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDlg(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form.id ? '编辑' : '新建'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="组态编码"><el-input v-model="form.scada_code" /></el-form-item>
        <el-form-item label="link_name"><el-input v-model="form.link_name" /></el-form-item>
        <el-form-item label="模式">
          <el-select v-model="form.mode" style="width: 100%">
            <el-option label="random" value="random" />
            <el-option label="random_walk" value="random_walk" />
            <el-option label="sine" value="sine" />
            <el-option label="ramp" value="ramp" />
            <el-option label="constant" value="constant" />
          </el-select>
        </el-form-item>
        <el-form-item label="间隔(ms)"><el-input-number v-model="form.interval_ms" :min="200" :step="100" /></el-form-item>
        <el-form-item label="参数 JSON">
          <el-input v-model="form.params_json" type="textarea" :rows="4" placeholder='如 {"min":0,"max":100}' />
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/scada'

const loading = ref(false)
const rows = ref([])
const filterCode = ref('')
const dlg = ref(false)
const form = ref({
  id: null,
  scada_code: '',
  link_name: '',
  mode: 'random',
  interval_ms: 1000,
  params_json: '{"min":0,"max":100}',
  enabled: true
})

const filtered = computed(() => {
  if (!filterCode.value) return rows.value
  return rows.value.filter(r => r.scada_code.includes(filterCode.value))
})

const load = async () => {
  loading.value = true
  try {
    const res = await api.listSimPoints()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openDlg = row => {
  if (row) {
    form.value = { ...row }
  } else {
    form.value = {
      id: null,
      scada_code: '',
      link_name: '',
      mode: 'random',
      interval_ms: 1000,
      params_json: '{"min":0,"max":100}',
      enabled: true
    }
  }
  dlg.value = true
}

const submit = async () => {
  if (form.value.id) {
    await api.updateSimPoint(form.value.id, form.value)
  } else {
    await api.createSimPoint(form.value)
  }
  dlg.value = false
  ElMessage.success('已保存')
  load()
}

const remove = async row => {
  await ElMessageBox.confirm('删除该点位？', '确认')
  await api.deleteSimPoint(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}
</style>
