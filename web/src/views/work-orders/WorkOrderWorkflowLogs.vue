<template>
  <div>
    <el-page-header content="工作流执行日志" @back="$router.push('/work-orders/workflows')" style="margin-bottom:16px" />

    <el-card shadow="never">
      <div class="toolbar">
        <el-form inline>
          <el-form-item label="工作流">
            <el-select v-model="filters.workflow_id" placeholder="全部" clearable style="width:200px" @change="load">
              <el-option v-for="w in workflows" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="工单ID">
            <el-input v-model="filters.work_order_id" placeholder="工单ID" clearable style="width:120px" @change="load" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filters.status" placeholder="全部" clearable style="width:120px" @change="load">
              <el-option label="成功" value="success" />
              <el-option label="部分成功" value="partial" />
              <el-option label="失败" value="failed" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="load">查询</el-button>
          </el-form-item>
        </el-form>
      </div>

      <el-table :data="logs" stripe>
        <el-table-column label="ID" prop="id" width="80" />
        <el-table-column label="工作流" min-width="150">
          <template #default="{row}">
            {{ workflowName(row.workflow_id) }}
          </template>
        </el-table-column>
        <el-table-column label="工单ID" prop="work_order_id" width="100" />
        <el-table-column label="事件" prop="event" min-width="150" />
        <el-table-column label="已执行动作" prop="actions_executed" width="100" align="center" />
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="耗时(ms)" prop="duration_ms" width="100" align="right" />
        <el-table-column label="错误信息" min-width="200">
          <template #default="{row}">
            <span v-if="row.error_msg" class="error-msg" :title="row.error_msg">{{ row.error_msg }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="执行时间" prop="created_at" width="160" />
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="limit"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top:16px;justify-content:flex-end"
        @size-change="load"
        @current-change="load"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getWorkOrderWorkflowLogs, getWorkOrderWorkflows } from '@/api/workOrder'

const logs = ref([])
const workflows = ref([])
const filters = ref({ workflow_id: '', work_order_id: '', status: '' })
const page = ref(1)
const limit = ref(50)
const total = ref(0)

const statusLabels = { success: '成功', partial: '部分成功', failed: '失败' }
const statusLabel = (s) => statusLabels[s] || s
const statusType = (s) => {
  if (s === 'success') return 'success'
  if (s === 'partial') return 'warning'
  return 'danger'
}

const workflowName = (id) => workflows.value.find(w => w.id === id)?.name || `#${id}`

const load = async () => {
  const params = { page: page.value, limit: limit.value }
  if (filters.value.workflow_id) params.workflow_id = filters.value.workflow_id
  if (filters.value.work_order_id) params.work_order_id = filters.value.work_order_id
  if (filters.value.status) params.status = filters.value.status
  const res = await getWorkOrderWorkflowLogs(params)
  logs.value = res.data || []
  total.value = res.total || 0
}

onMounted(async () => {
  const w = await getWorkOrderWorkflows()
  workflows.value = w.data || []
  load()
})
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.error-msg {
  color: #f56c6c;
  font-size: 12px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
