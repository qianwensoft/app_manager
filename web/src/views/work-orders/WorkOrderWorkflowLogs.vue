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
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{row}">
            <el-button text type="primary" size="small" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
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

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailDialog" title="工作流执行详情" width="800px" destroy-on-close>
      <el-descriptions :column="2" border v-if="currentLog">
        <el-descriptions-item label="日志ID">{{ currentLog.id }}</el-descriptions-item>
        <el-descriptions-item label="工作流ID">{{ currentLog.workflow_id }}</el-descriptions-item>
        <el-descriptions-item label="工作流名称" :span="2">{{ workflowName(currentLog.workflow_id) }}</el-descriptions-item>
        <el-descriptions-item label="工单ID">{{ currentLog.work_order_id }}</el-descriptions-item>
        <el-descriptions-item label="触发事件">{{ currentLog.event }}</el-descriptions-item>
        <el-descriptions-item label="执行状态">
          <el-tag :type="statusType(currentLog.status)">{{ statusLabel(currentLog.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="已执行动作数">{{ currentLog.actions_executed }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ currentLog.duration_ms }} ms</el-descriptions-item>
        <el-descriptions-item label="执行时间">{{ currentLog.created_at }}</el-descriptions-item>
        <el-descriptions-item label="错误信息" :span="2" v-if="currentLog.error_msg">
          <div style="color: #f56c6c; white-space: pre-wrap; word-break: break-all;">{{ currentLog.error_msg }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="执行日志" :span="2" v-if="currentLog.execution_logs">
          <div style="max-height: 300px; overflow-y: auto; background: #f5f7fa; padding: 12px; border-radius: 4px;">
            <div v-for="(logLine, idx) in parseExecutionLogs(currentLog.execution_logs)" :key="idx" style="font-family: monospace; font-size: 12px; line-height: 1.8; margin-bottom: 4px;">
              <span style="color: #909399; margin-right: 8px;">[{{ idx + 1 }}]</span>
              <span :style="getLogLineStyle(logLine)">{{ logLine }}</span>
            </div>
          </div>
        </el-descriptions-item>
      </el-descriptions>

      <div style="margin-top: 16px;" v-if="currentLog && currentWorkflow">
        <el-divider content-position="left">工作流配置</el-divider>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="工作流类型">
            {{ currentWorkflow.type_code || '全局（所有类型）' }}
          </el-descriptions-item>
          <el-descriptions-item label="监听事件">
            <span v-if="!currentWorkflow.events || parseEvents(currentWorkflow.events).length === 0">全部事件</span>
            <el-tag v-else v-for="e in parseEvents(currentWorkflow.events)" :key="e" size="small" style="margin-right:4px">
              {{ e }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="动作配置">
            <div style="max-height: 400px; overflow-y: auto;">
              <pre style="margin: 0; font-size: 12px; line-height: 1.5;">{{ formatActions(currentWorkflow.actions_json) }}</pre>
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="detailDialog = false">关闭</el-button>
        <el-button type="primary" @click="viewWorkOrder" v-if="currentLog">查看工单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getWorkOrderWorkflowLogs, getWorkOrderWorkflows, getWorkOrderWorkflow } from '@/api/workOrder'

const router = useRouter()
const logs = ref([])
const workflows = ref([])
const filters = ref({ workflow_id: '', work_order_id: '', status: '' })
const page = ref(1)
const limit = ref(50)
const total = ref(0)
const detailDialog = ref(false)
const currentLog = ref(null)
const currentWorkflow = ref(null)

const statusLabels = { success: '成功', partial: '部分成功', failed: '失败' }
const statusLabel = (s) => statusLabels[s] || s
const statusType = (s) => {
  if (s === 'success') return 'success'
  if (s === 'partial') return 'warning'
  return 'danger'
}

const workflowName = (id) => workflows.value.find(w => w.id === id)?.name || `#${id}`

const parseEvents = (json) => {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

const parseExecutionLogs = (json) => {
  if (!json) return []
  try {
    const logs = JSON.parse(json)
    return Array.isArray(logs) ? logs : []
  } catch {
    return []
  }
}

const getLogLineStyle = (line) => {
  if (line.startsWith('[ERROR]')) {
    return 'color: #f56c6c;'
  }
  if (line.startsWith('[WARN]')) {
    return 'color: #e6a23c;'
  }
  if (line.startsWith('[INFO]')) {
    return 'color: #409eff;'
  }
  return 'color: #606266;'
}

const formatActions = (json) => {
  if (!json) return ''
  try {
    const obj = JSON.parse(json)
    return JSON.stringify(obj, null, 2)
  } catch {
    return json
  }
}

const load = async () => {
  const params = { page: page.value, limit: limit.value }
  if (filters.value.workflow_id) params.workflow_id = filters.value.workflow_id
  if (filters.value.work_order_id) params.work_order_id = filters.value.work_order_id
  if (filters.value.status) params.status = filters.value.status
  const res = await getWorkOrderWorkflowLogs(params)
  logs.value = res.data || []
  total.value = res.total || 0
}

const openDetail = async (row) => {
  currentLog.value = row
  // 加载工作流详情
  try {
    const res = await getWorkOrderWorkflow(row.workflow_id)
    currentWorkflow.value = res.data
  } catch (e) {
    currentWorkflow.value = null
  }
  detailDialog.value = true
}

const viewWorkOrder = () => {
  if (currentLog.value?.work_order_id) {
    router.push(`/work-orders/${currentLog.value.work_order_id}`)
  }
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
