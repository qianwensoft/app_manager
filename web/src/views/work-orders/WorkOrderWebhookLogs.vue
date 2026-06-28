<template>
  <div>
    <div class="toolbar">
      <el-page-header content="工单外发历史" @back="$router.push('/work-orders/settings')" />
      <div class="spacer" />
      <el-button @click="load">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-card shadow="never" style="margin-top:12px">
      <div class="filter-bar">
        <el-select v-model="filters.webhook_id" clearable placeholder="选择 Webhook" style="width:200px" @change="load">
          <el-option v-for="wh in webhooks" :key="wh.id" :label="wh.name" :value="wh.id" />
        </el-select>
        <el-input v-model="filters.work_order_code" clearable placeholder="工单编号" style="width:160px" @clear="load" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width:120px" @change="load">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="进行中" value="pending" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table :data="rows" border v-loading="loading" style="margin-top:12px">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="Webhook" width="160">
          <template #default="{ row }">{{ row.webhook_name || `#${row.webhook_id}` }}</template>
        </el-table-column>
        <el-table-column label="工单" width="140">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push(`/work-orders/${row.work_order_id}`)">{{ row.work_order_code }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="event" label="事件" width="140" />
        <el-table-column label="目标" width="200">
          <template #default="{ row }">
            <el-tag size="small">{{ row.target === 'connector' ? '连接器' : '接口' }}</el-tag>
            <span style="margin-left:6px">{{ row.target_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status_code" label="状态码" width="90" />
        <el-table-column label="耗时" width="90">
          <template #default="{ row }">{{ row.duration_ms }}ms</template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
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
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <el-dialog v-model="detailDialog" title="外发详情" width="90%" top="5vh" destroy-on-close>
      <div v-if="detail" class="detail-container">
        <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="Webhook">{{ detail.webhook_name }}</el-descriptions-item>
          <el-descriptions-item label="工单编号">
            <el-link type="primary" @click="$router.push(`/work-orders/${detail.work_order_id}`)">{{ detail.work_order_code }}</el-link>
          </el-descriptions-item>
          <el-descriptions-item label="事件">{{ detail.event }}</el-descriptions-item>
          <el-descriptions-item label="目标">{{ detail.target === 'connector' ? '连接器' : '接口' }}</el-descriptions-item>
          <el-descriptions-item label="目标名称">{{ detail.target_name }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)">{{ statusLabel(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="HTTP 状态码">{{ detail.status_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ detail.duration_ms }}ms</el-descriptions-item>
          <el-descriptions-item label="时间">{{ detail.created_at }}</el-descriptions-item>
        </el-descriptions>

        <el-tabs type="border-card">
          <el-tab-pane label="1. 参数模板（配置）">
            <div class="tab-desc">Webhook 配置中的参数映射（包含占位符模板）</div>
            <pre class="json-pre">{{ formatJson(detail.request_json) }}</pre>
          </el-tab-pane>

          <el-tab-pane label="2. 实际参数（替换后）">
            <div class="tab-desc">占位符替换后的实际参数值</div>
            <pre class="json-pre">{{ formatJson(detail.resolved_json) }}</pre>
          </el-tab-pane>

          <el-tab-pane label="3. 请求详情">
            <div class="tab-desc">实际发送的 HTTP 请求信息</div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="请求 URL">{{ detail.request_url || '-' }}</el-descriptions-item>
              <el-descriptions-item label="请求方法">{{ detail.request_method || '-' }}</el-descriptions-item>
              <el-descriptions-item label="请求头">
                <pre class="json-pre">{{ formatJson(detail.request_headers) }}</pre>
              </el-descriptions-item>
              <el-descriptions-item label="请求体">
                <pre class="json-pre">{{ formatJson(detail.request_body) }}</pre>
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <el-tab-pane label="4. 原始响应">
            <div class="tab-desc">外部应用返回的原始 HTTP 响应</div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="状态码">{{ detail.status_code || '-' }}</el-descriptions-item>
              <el-descriptions-item label="响应头">
                <pre class="json-pre">{{ formatJson(detail.response_headers) }}</pre>
              </el-descriptions-item>
              <el-descriptions-item label="响应体">
                <pre class="json-pre">{{ formatJson(detail.response_body) }}</pre>
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <el-tab-pane label="5. 脚本处理" v-if="detail.script_logs || detail.script_result">
            <div class="tab-desc">JS 脚本处理日志和最终结果</div>
            <div v-if="detail.script_logs">
              <h4 style="margin:0 0 8px 0;font-size:14px">执行日志</h4>
              <div class="script-logs">
                <div v-for="(log, idx) in parseScriptLogs(detail.script_logs)" :key="idx" class="log-item" :class="`log-${log.level}`">
                  <span class="log-scope">[{{ log.scope }}/{{ log.index }}]</span>
                  <span class="log-name">{{ log.name }}</span>
                  <span class="log-level">{{ log.level }}</span>
                  <span class="log-line">{{ log.line }}</span>
                </div>
              </div>
            </div>
            <div v-if="detail.script_result" style="margin-top:16px">
              <h4 style="margin:0 0 8px 0;font-size:14px">处理结果</h4>
              <pre class="json-pre">{{ formatJson(detail.script_result) }}</pre>
            </div>
          </el-tab-pane>

          <el-tab-pane label="错误信息" v-if="detail.error_msg">
            <div class="tab-desc">执行过程中的错误信息</div>
            <pre class="error-pre">{{ detail.error_msg }}</pre>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getWorkOrderWebhookLogs, getWorkOrderWebhookLog, getWorkOrderWebhooks } from '@/api/workOrder'

const loading = ref(false)
const rows = ref([])
const webhooks = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const filters = ref({
  webhook_id: null,
  work_order_code: '',
  status: ''
})

const detailDialog = ref(false)
const detail = ref(null)

const statusType = (s) => ({ success: 'success', failed: 'danger', pending: 'info' }[s] || '')
const statusLabel = (s) => ({ success: '成功', failed: '失败', pending: '进行中' }[s] || s)

const formatJson = (str) => {
  if (!str) return ''
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

const parseScriptLogs = (str) => {
  if (!str) return []
  try {
    return JSON.parse(str)
  } catch {
    return []
  }
}

const load = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      limit: limit.value,
      ...filters.value
    }
    // 清除空值
    Object.keys(params).forEach(k => {
      if (params[k] === '' || params[k] === null) delete params[k]
    })

    const res = await getWorkOrderWebhookLogs(params)
    rows.value = res.data || []
    total.value = res.total || 0
  } catch (error) {
    ElMessage.error('加载失败：' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

const openDetail = async (row) => {
  try {
    const res = await getWorkOrderWebhookLog(row.id)
    detail.value = res.data
    detailDialog.value = true
  } catch (error) {
    ElMessage.error('加载详情失败：' + (error.response?.data?.error || error.message))
  }
}

onMounted(async () => {
  try {
    const res = await getWorkOrderWebhooks()
    webhooks.value = res.data || []
  } catch {
    webhooks.value = []
  }
  load()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.spacer {
  flex: 1;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.json-pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  max-height: 300px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: #fef0f0;
  color: #f56c6c;
  padding: 8px;
  border-radius: 4px;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.detail-container {
  max-height: 70vh;
  overflow-y: auto;
}

.tab-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.script-logs {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  max-height: 400px;
  overflow: auto;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid #e4e7ed;
}

.log-item:last-child {
  border-bottom: none;
}

.log-scope {
  color: #909399;
  margin-right: 6px;
}

.log-name {
  color: #606266;
  font-weight: 500;
  margin-right: 6px;
}

.log-level {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  margin-right: 8px;
}

.log-log .log-level,
.log-info .log-level {
  background: #e1f3d8;
  color: #67c23a;
}

.log-warn .log-level {
  background: #faecd8;
  color: #e6a23c;
}

.log-error .log-level {
  background: #fde2e2;
  color: #f56c6c;
}

.log-debug .log-level {
  background: #e1f0ff;
  color: #409eff;
}

.log-line {
  color: #606266;
}
</style>
