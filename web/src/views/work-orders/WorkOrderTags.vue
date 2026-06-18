<template>
  <div>
    <div class="toolbar">
      <el-page-header content="工单标签" @back="$router.push('/work-orders')" />
      <div class="spacer" />
      <el-button type="primary" @click="openCreate">新增标签</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="code" label="编码" width="160" />
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column label="预览" width="120">
        <template #default="{ row }">
          <el-tag :color="row.color || ''" :style="row.color ? 'color:#fff;border:none' : ''" size="small">{{ row.name }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="color" label="颜色" width="120">
        <template #default="{ row }">{{ row.color || '-' }}</template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="80" />
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

    <el-dialog v-model="dialog" :title="editing.id ? '编辑标签' : '新增标签'" width="460px">
      <el-form :model="editing" label-width="80px">
        <el-form-item label="编码" required>
          <el-input v-model="editing.code" :disabled="!!editing.id" placeholder="如 urgent" />
        </el-form-item>
        <el-form-item label="名称" required><el-input v-model="editing.name" /></el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editing.color" />
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
import { listWorkOrderTags, createWorkOrderTag, updateWorkOrderTag, deleteWorkOrderTag } from '@/api/workOrder'

const rows = ref([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref({})

const load = async () => {
  loading.value = true
  try {
    const res = await listWorkOrderTags()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editing.value = { code: '', name: '', color: '', sort_order: 0, enabled: true }
  dialog.value = true
}
const openEdit = (row) => { editing.value = { ...row }; dialog.value = true }

const save = async () => {
  const e = editing.value
  if (!e.code || !e.name) { ElMessage.warning('编码和名称必填'); return }
  if (e.id) await updateWorkOrderTag(e.id, e)
  else await createWorkOrderTag(e)
  dialog.value = false
  ElMessage.success('已保存')
  load()
}

const remove = async (row) => {
  await ElMessageBox.confirm(`删除标签「${row.name}」？已挂载的工单将一并移除该标签。`, '确认', { type: 'warning' })
  await deleteWorkOrderTag(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; margin-bottom: 12px; }
.spacer { flex: 1; }
</style>
