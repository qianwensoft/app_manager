<template>
  <div class="wh-logs" v-loading="loading">
    <el-page-header @back="router.push('/outbound/apps/' + appId)">
      <template #content>
        <span class="title">Webhook 历史记录</span>
        <el-tag size="small" type="info" style="margin-left:8px">#{{ webhookId }}</el-tag>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-top:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <el-input
          v-model="searchQ"
          placeholder="全文搜索 raw_body / payload / error"
          clearable
          style="width:360px"
          @keyup.enter="doSearch"
          @clear="doSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="doSearch">搜索</el-button>
        <el-button plain @click="load">刷新</el-button>
        <el-button type="danger" plain @click="clearLogs">清空记录</el-button>
        <el-button
          size="small"
          type="primary"
          plain
          style="margin-left:auto"
          @click="router.push(`/outbound/apps/${appId}/webhooks/${webhookId}/debug`)"
        >调试页面</el-button>
      </div>

      <el-table :data="rows" border size="small" style="width:100%">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtTs(row.ts) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.error ? 'danger' : 'success'">{{ row.error ? '失败' : 'OK' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="方法" prop="method" width="70" />
        <el-table-column label="路径" prop="path" width="200" show-overflow-tooltip />
        <el-table-column label="事件类型" width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.event_type" size="small" type="info">{{ row.event_type }}</el-tag>
            <span v-else style="color:#c0c4cc">—</span>
          </template>
        </el-table-column>
        <el-table-column label="错误" prop="error" show-overflow-tooltip />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @change="load"
        />
      </div>
    </el-card>

    <!-- Detail dialog -->
    <el-dialog v-model="detailVisible" title="请求详情" width="860px" destroy-on-close>
      <div v-if="detailRow">
        <el-descriptions :column="2" border size="small" style="margin-bottom:12px">
          <el-descriptions-item label="时间">{{ fmtTs(detailRow.ts) }}</el-descriptions-item>
          <el-descriptions-item label="方法">{{ detailRow.method }}</el-descriptions-item>
          <el-descriptions-item label="路径">{{ detailRow.path }}</el-descriptions-item>
          <el-descriptions-item label="Query">{{ detailRow.query || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="detailRow.error" style="color:#f56c6c;font-size:13px;margin-bottom:8px">错误：{{ detailRow.error }}</div>

        <!-- Headers -->
        <div class="section-label">Headers</div>
        <el-descriptions :column="1" border size="small" style="margin-bottom:10px">
          <template v-if="parsedHeaders(detailRow)">
            <el-descriptions-item v-for="(v, k) in parsedHeaders(detailRow)" :key="k" :label="k">{{ v }}</el-descriptions-item>
          </template>
          <el-descriptions-item v-else label="(raw)">{{ detailRow.headers }}</el-descriptions-item>
        </el-descriptions>

        <!-- Raw body + decrypted -->
        <template v-if="detailRow.decrypted_raw">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <div class="section-label">Raw Body（解密前）</div>
              <pre class="log-pre">{{ detailRow.raw_body || '(empty)' }}</pre>
            </div>
            <div>
              <div class="section-label">解密内容</div>
              <pre class="log-pre">{{ prettyJson(detailRow.decrypted_raw) }}</pre>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="section-label">Raw Body</div>
          <pre class="log-pre" style="margin-bottom:10px">{{ detailRow.raw_body || '(empty)' }}</pre>
        </template>

        <template v-if="detailRow.payload">
          <div class="section-label">Payload（最终）</div>
          <pre class="log-pre">{{ prettyJson(detailRow.payload) }}</pre>
        </template>

        <template v-if="detailRow.js_logs && detailRow.js_logs.length">
          <div class="section-label" style="margin-top:8px">JS Console</div>
          <pre class="log-pre" style="background:#1e1e1e;color:#d4d4d4">{{ Array.isArray(detailRow.js_logs) ? detailRow.js_logs.join('\n') : detailRow.js_logs }}</pre>
        </template>

        <template v-if="detailRow.return_data !== null && detailRow.return_data !== undefined">
          <div class="section-label" style="margin-top:8px">返回数据（return_data）</div>
          <pre class="log-pre" style="border-color:#67c23a">{{ prettyJson(detailRow.return_data) }}</pre>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { listOutboundWebhookLogs, deleteOutboundWebhookLogs } from '@/api/outbound'
import { createWebhookDebugStomp } from '@/utils/outboundWebhookDebugStomp'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const webhookId = route.params.webhookId
const appId = route.params.appId

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchQ = ref('')

async function load() {
  loading.value = true
  try {
    const res = await listOutboundWebhookLogs(webhookId, { page: page.value, page_size: pageSize.value, q: searchQ.value })
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    ElMessage.error('加载失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

function doSearch() {
  page.value = 1
  load()
}

async function clearLogs() {
  await ElMessageBox.confirm('确认清空该 Webhook 所有历史记录？', '清空', { type: 'warning' })
  try {
    await deleteOutboundWebhookLogs(webhookId)
    ElMessage.success('已清空')
    rows.value = []
    total.value = 0
  } catch (e) {
    ElMessage.error('清空失败：' + (e?.message || e))
  }
}

const detailVisible = ref(false)
const detailRow = ref(null)

function openDetail(row) {
  detailRow.value = row
  detailVisible.value = true
}

function parsedHeaders(row) {
  try { return JSON.parse(row.headers) } catch { return null }
}

function prettyJson(v) {
  if (!v) return ''
  try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v }
}

function fmtTs(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

// STOMP 实时推送：仅第一页且无搜索词时在顶部插入新记录
let stompClient = null

function startStomp() {
  stompClient = createWebhookDebugStomp(webhookId, () => auth.token, (msg) => {
    if (page.value !== 1 || searchQ.value) return
    const row = {
      id: msg.ts,
      ts: msg.ts,
      method: msg.method,
      path: msg.path,
      query: msg.query || '',
      headers: typeof msg.headers === 'object' ? JSON.stringify(msg.headers) : (msg.headers || ''),
      raw_body: msg.raw_body || '',
      decrypted_raw: typeof msg.decrypted_raw === 'object' ? JSON.stringify(msg.decrypted_raw) : (msg.decrypted_raw || ''),
      payload: typeof msg.payload === 'object' ? JSON.stringify(msg.payload) : (msg.payload || ''),
      return_data: typeof msg.return_data === 'object' ? JSON.stringify(msg.return_data) : (msg.return_data || ''),
      js_logs: msg.js_logs || [],
      event_type: msg.event_type || '',
      error: msg.error || ''
    }
    rows.value = [row, ...rows.value]
    total.value += 1
  })
  stompClient.start()
}

onMounted(() => {
  load()
  startStomp()
})

onUnmounted(() => {
  stompClient?.stop()
  stompClient = null
})
</script>

<style scoped>
.wh-logs { padding: 20px; max-width: 1200px; }
.section-label { font-size: 12px; color: #888; margin: 6px 0 4px; }
.log-pre {
  background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px;
  padding: 8px 10px; font-size: 12px; font-family: monospace;
  white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow: auto; margin: 0;
}
</style>
