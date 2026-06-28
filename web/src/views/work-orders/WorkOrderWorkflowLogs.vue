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
          <el-form-item label="工单编号">
            <el-input v-model="filters.work_order_code" placeholder="工单编号" clearable style="width:150px" @change="load" />
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
        <el-table-column label="工单编号" min-width="150">
          <template #default="{row}">
            <el-link type="primary" @click="viewWorkOrderByLog(row)">
              {{ row.work_order_code || `#${row.work_order_id}` }}
            </el-link>
          </template>
        </el-table-column>
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
    <el-dialog v-model="detailDialog" title="工作流执行详情" width="1000px" destroy-on-close>
      <el-descriptions :column="2" border v-if="currentLog" size="default">
        <el-descriptions-item label="日志ID" label-align="right" label-class-name="desc-label">{{ currentLog.id }}</el-descriptions-item>
        <el-descriptions-item label="工作流ID" label-align="right" label-class-name="desc-label">{{ currentLog.workflow_id }}</el-descriptions-item>
        <el-descriptions-item label="工作流名称" label-align="right" label-class-name="desc-label" :span="2">{{ workflowName(currentLog.workflow_id) }}</el-descriptions-item>
        <el-descriptions-item label="工单编号" label-align="right" label-class-name="desc-label">
          <el-link type="primary" @click="viewWorkOrder">
            {{ currentLog.work_order_code || `#${currentLog.work_order_id}` }}
          </el-link>
        </el-descriptions-item>
        <el-descriptions-item label="触发事件" label-align="right" label-class-name="desc-label">{{ currentLog.event }}</el-descriptions-item>
        <el-descriptions-item label="执行状态" label-align="right" label-class-name="desc-label">
          <el-tag :type="statusType(currentLog.status)">{{ statusLabel(currentLog.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="已执行动作数" label-align="right" label-class-name="desc-label">{{ currentLog.actions_executed }}</el-descriptions-item>
        <el-descriptions-item label="耗时" label-align="right" label-class-name="desc-label">{{ currentLog.duration_ms }} ms</el-descriptions-item>
        <el-descriptions-item label="执行时间" label-align="right" label-class-name="desc-label">{{ currentLog.created_at }}</el-descriptions-item>
        <el-descriptions-item label="错误信息" label-align="right" label-class-name="desc-label" :span="2" v-if="currentLog.error_msg">
          <div style="color: #f56c6c; white-space: pre-wrap; word-break: break-all; max-width: 100%; overflow-wrap: break-word;">{{ currentLog.error_msg }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="执行日志" label-align="right" label-class-name="desc-label" :span="2" v-if="currentLog.execution_logs">
          <div style="max-height: 300px; overflow-y: auto; background: #f5f7fa; padding: 12px; border-radius: 4px; max-width: 100%;">
            <div v-for="(logLine, idx) in parseExecutionLogs(currentLog.execution_logs)" :key="idx" style="font-family: monospace; font-size: 12px; line-height: 1.8; margin-bottom: 4px; word-break: break-all; overflow-wrap: break-word;">
              <span style="color: #909399; margin-right: 8px;">[{{ idx + 1 }}]</span>
              <span :style="getLogLineStyle(logLine)">{{ logLine }}</span>
            </div>
          </div>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 动作执行详情 -->
      <div style="margin-top: 16px;" v-if="currentLog && currentLog.action_details">
        <el-divider content-position="left">动作执行详情</el-divider>
        <el-timeline>
          <el-timeline-item
            v-for="(action, idx) in parseActionDetails(currentLog.action_details)"
            :key="idx"
            :timestamp="`${action.duration_ms}ms`"
            placement="top"
            :type="action.error ? 'danger' : (action.skipped ? 'info' : 'success')"
            :icon="action.error ? 'CircleClose' : (action.skipped ? 'CircleClose' : 'CircleCheck')"
          >
            <el-card shadow="hover">
              <template #header>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 600;">
                    动作 {{ action.index + 1 }}: {{ actionTypeLabel(action.type) }}
                    <el-tag v-if="action.skipped" type="info" size="small" style="margin-left: 8px;">已跳过</el-tag>
                  </span>
                  <el-tag :type="action.error ? 'danger' : (action.skipped ? 'info' : 'success')" size="small">
                    {{ action.error ? '失败' : (action.skipped ? '跳过' : '成功') }}
                  </el-tag>
                </div>
              </template>

              <!-- 执行条件 -->
              <div v-if="action.condition" style="margin-bottom: 12px;">
                <el-divider content-position="left" style="margin: 0 0 8px 0;">执行条件</el-divider>
                <div style="background: #f5f7fa; padding: 8px; border-radius: 4px; border: 1px solid #e4e7ed;">
                  <div style="font-size: 12px; color: #909399; margin-bottom: 4px;">条件表达式</div>
                  <code style="font-size: 13px; color: #606266;">{{ action.condition }}</code>
                  <div style="margin-top: 8px;">
                    <el-tag :type="action.condition_result ? 'success' : 'warning'" size="small">
                      评估结果: {{ action.condition_result ? '✓ true（执行）' : '✗ false（跳过）' }}
                    </el-tag>
                  </div>
                </div>
                <div v-if="action.skipped && action.skip_reason" style="margin-top: 8px;">
                  <el-alert type="info" :closable="false">
                    <template #title>
                      <span style="font-size: 13px;">{{ action.skip_reason }}</span>
                    </template>
                  </el-alert>
                </div>
              </div>

              <!-- 配置对比 -->
              <el-collapse accordion>
                <el-collapse-item title="配置（展开前）" name="config-before">
                  <pre style="margin: 0; font-size: 12px; background: #f5f7fa; padding: 8px; border-radius: 4px; max-height: 300px; overflow: auto;">{{ formatJSON(action.config_before) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="配置（展开后）" name="config-after">
                  <pre style="margin: 0; font-size: 12px; background: #f5f7fa; padding: 8px; border-radius: 4px; max-height: 300px; overflow: auto;">{{ formatJSON(action.config_after) }}</pre>
                  <div style="margin-top: 8px;">
                    <el-button text type="primary" size="small" @click="diffConfig(action)">
                      <el-icon><View /></el-icon> 对比差异
                    </el-button>
                  </div>
                </el-collapse-item>
              </el-collapse>

              <!-- 上下文变化 -->
              <div style="margin-top: 12px;" v-if="hasContextChange(action)">
                <el-divider content-position="left" style="margin: 12px 0 8px 0;">上下文变化</el-divider>
                <div style="display: flex; gap: 12px;">
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: #909399; margin-bottom: 4px;">执行前</div>
                    <pre style="margin: 0; font-size: 12px; background: #fef0f0; padding: 8px; border-radius: 4px; border: 1px solid #fde2e2; max-height: 200px; overflow: auto;">{{ formatJSON(action.context_before) }}</pre>
                  </div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: #909399; margin-bottom: 4px;">执行后</div>
                    <pre style="margin: 0; font-size: 12px; background: #f0f9ff; padding: 8px; border-radius: 4px; border: 1px solid #d1e7fd; max-height: 200px; overflow: auto;">{{ formatJSON(action.context_after) }}</pre>
                  </div>
                </div>
                <div style="margin-top: 8px;">
                  <el-tag
                    v-for="change in getContextChanges(action)"
                    :key="change.key"
                    :type="change.type"
                    size="small"
                    style="margin-right: 8px; margin-bottom: 4px;"
                  >
                    {{ change.label }}
                  </el-tag>
                </div>
              </div>

              <!-- 执行结果 -->
              <div style="margin-top: 12px;" v-if="action.result">
                <el-divider content-position="left" style="margin: 12px 0 8px 0;">执行结果</el-divider>
                <pre style="margin: 0; font-size: 12px; background: #f0f9ff; padding: 8px; border-radius: 4px; border: 1px solid #d1e7fd; max-height: 200px; overflow: auto;">{{ formatJSON(action.result) }}</pre>
              </div>

              <!-- 错误信息 -->
              <div style="margin-top: 12px;" v-if="action.error">
                <el-alert type="error" :closable="false" show-icon>
                  <template #title>
                    <span style="font-weight: 600;">执行错误</span>
                  </template>
                  <pre style="margin: 8px 0 0 0; font-size: 12px; white-space: pre-wrap; word-break: break-all;">{{ action.error }}</pre>
                </el-alert>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>

      <!-- 最终上下文快照 -->
      <div style="margin-top: 16px;" v-if="currentLog && currentLog.context_snapshot">
        <el-divider content-position="left">最终上下文快照</el-divider>
        <pre style="margin: 0; font-size: 12px; background: #f0f9ff; padding: 12px; border-radius: 4px; border: 1px solid #d1e7fd; max-height: 300px; overflow: auto;">{{ formatJSON(parseContextSnapshot(currentLog.context_snapshot)) }}</pre>
      </div>

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
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { CircleCheck, CircleClose, View } from '@element-plus/icons-vue'
import { getWorkOrderWorkflowLogs, getWorkOrderWorkflows, getWorkOrderWorkflow } from '@/api/workOrder'

const router = useRouter()
const route = useRoute()
const logs = ref([])
const workflows = ref([])
const filters = ref({ workflow_id: '', work_order_code: '', status: '' })
const page = ref(1)
const limit = ref(50)
const total = ref(0)
const detailDialog = ref(false)
const currentLog = ref(null)
const currentWorkflow = ref(null)

const actionTypeLabels = {
  'execute_js': 'JavaScript 脚本',
  'update_work_order': '更新工单',
  'create_work_order': '创建工单',
  'query_work_orders': '查询工单',
  'call_endpoint': '调用第三方接口',
  'call_connector': '调用连接器',
  'call_data_interface': '调用数据接口'
}
const actionTypeLabel = (type) => actionTypeLabels[type] || type

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

const parseActionDetails = (json) => {
  if (!json) return []
  try {
    const details = JSON.parse(json)
    return Array.isArray(details) ? details : []
  } catch {
    return []
  }
}

const parseContextSnapshot = (json) => {
  if (!json) return {}
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

const formatJSON = (obj) => {
  if (!obj) return '{}'
  if (typeof obj === 'string') return obj
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const hasContextChange = (action) => {
  const before = action.context_before || {}
  const after = action.context_after || {}
  return Object.keys(before).length > 0 || Object.keys(after).length > 0
}

const getContextChanges = (action) => {
  const before = action.context_before || {}
  const after = action.context_after || {}
  const changes = []

  // 新增的变量
  for (const key in after) {
    if (!(key in before)) {
      changes.push({ key, type: 'success', label: `+ ${key}` })
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ key, type: 'warning', label: `~ ${key}` })
    }
  }

  // 删除的变量
  for (const key in before) {
    if (!(key in after)) {
      changes.push({ key, type: 'danger', label: `- ${key}` })
    }
  }

  return changes
}

const diffConfig = (action) => {
  const before = formatJSON(action.config_before)
  const after = formatJSON(action.config_after)

  ElMessageBox.alert(
    `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-height: 60vh; overflow: auto;">
      <div>
        <div style="font-weight: 600; margin-bottom: 8px; color: #909399;">展开前</div>
        <pre style="margin: 0; font-size: 12px; background: #fef0f0; padding: 12px; border-radius: 4px; border: 1px solid #fde2e2; white-space: pre-wrap; word-break: break-all;">${before}</pre>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 8px; color: #909399;">展开后</div>
        <pre style="margin: 0; font-size: 12px; background: #f0f9ff; padding: 12px; border-radius: 4px; border: 1px solid #d1e7fd; white-space: pre-wrap; word-break: break-all;">${after}</pre>
      </div>
    </div>`,
    '配置对比',
    {
      confirmButtonText: '关闭',
      dangerouslyUseHTMLString: true,
      customClass: 'diff-dialog'
    }
  )
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
  if (filters.value.work_order_code) {
    // work_order_code 可能是编号（字符串）或 ID（数字）
    // 如果是纯数字，使用 work_order_id 参数；否则使用 work_order_code
    if (/^\d+$/.test(filters.value.work_order_code)) {
      params.work_order_id = filters.value.work_order_code
    } else {
      params.work_order_code = filters.value.work_order_code
    }
  }
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

const viewWorkOrderByLog = (row) => {
  if (row.work_order_id) {
    router.push(`/work-orders/${row.work_order_id}`)
  }
}

onMounted(async () => {
  const w = await getWorkOrderWorkflows()
  workflows.value = w.data || []

  // 从 URL 参数初始化筛选条件
  if (route.query.workflow_id) {
    filters.value.workflow_id = parseInt(route.query.workflow_id) || ''
  }
  if (route.query.work_order_id) {
    filters.value.work_order_code = String(route.query.work_order_id)
  }

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

<style>
.desc-label {
  width: 120px;
  min-width: 120px;
  white-space: nowrap;
}
</style>
