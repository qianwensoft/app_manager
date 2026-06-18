<template>
  <div>
    <div class="toolbar">
      <el-page-header content="工单类型" @back="$router.push('/work-orders')" />
      <div class="spacer" />
      <el-button type="primary" @click="openCreate">新增类型</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="code" label="编码" width="160" />
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="default_title" label="默认标题" show-overflow-tooltip>
        <template #default="{ row }">{{ row.default_title || '-' }}</template>
      </el-table-column>
      <el-table-column prop="description" label="说明" show-overflow-tooltip />
      <el-table-column prop="form_app_code" label="绑定表单(form-app)" width="200">
        <template #default="{ row }">{{ row.form_app_code || '-' }}</template>
      </el-table-column>
      <el-table-column prop="enabled" label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing.id ? '编辑类型' : '新增类型'" width="520px">
      <el-form :model="editing" label-width="130px">
        <el-form-item label="编码" required>
          <el-input v-model="editing.code" :disabled="!!editing.id" placeholder="如 repair" />
        </el-form-item>
        <el-form-item label="名称" required><el-input v-model="editing.name" /></el-form-item>
        <el-form-item label="默认标题">
          <el-input v-model="editing.default_title" placeholder="提交端标题为空时自动带出，可空" />
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="editing.description" type="textarea" /></el-form-item>
        <el-form-item label="绑定表单 code">
          <el-input v-model="editing.form_app_code" placeholder="form-app 应用编码，可空" />
        </el-form-item>
        <el-form-item label="表单页面 key">
          <el-input v-model="editing.form_page_key" placeholder="默认 form" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="editing.sort_order" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="editing.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getWorkOrderTypes, createWorkOrderType, updateWorkOrderType, deleteWorkOrderType } from '@/api/workOrder'

const rows = ref([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref({})

const load = async () => {
  loading.value = true
  try {
    const res = await getWorkOrderTypes()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editing.value = { code: '', name: '', description: '', default_title: '', form_app_code: '', form_page_key: 'form', sort_order: 0, enabled: true }
  dialog.value = true
}
const openEdit = (row) => { editing.value = { ...row }; dialog.value = true }

const save = async () => {
  const e = editing.value
  if (!e.code || !e.name) { ElMessage.warning('编码和名称必填'); return }
  if (e.id) await updateWorkOrderType(e.id, e)
  else await createWorkOrderType(e)
  dialog.value = false
  ElMessage.success('已保存')
  load()
}

const remove = async (row) => {
  await ElMessageBox.confirm(`删除类型「${row.name}」？`, '确认', { type: 'warning' })
  await deleteWorkOrderType(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; margin-bottom: 12px; }
.spacer { flex: 1; }
</style>
