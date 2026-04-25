<template>
  <div class="outbound-page">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
      title="连接器"
      description="在「外部应用」中维护应用、鉴权与接口；在此配置连接器：按「阶段」顺序执行；阶段内可选并行 / 顺序 / 主备（仅 HTTP 成功即停）。每步可设执行前/执行后延迟（毫秒）。可配置「相同事件码 / 不同事件码」防抖。view_url 在 Agent 端使用应用内全屏 WebView；message 在 Agent 端显示顶部通知/悬浮条（需悬浮窗权限时显示条）。占位符：{{device_event.event_data}}、{{device.id}} 等。"
    />

    <el-tabs v-model="activeTab" @tab-change="onTab">
      <el-tab-pane label="连接器" name="connectors">
        <div class="toolbar">
          <el-button type="primary" :disabled="!definitions.length" @click="goNewConnector">新建连接器</el-button>
          <el-button :loading="loading.connectors" @click="loadConnectors">刷新</el-button>
        </div>
        <el-table :data="connectors" border size="small" v-loading="loading.connectors">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column label="阶段 / 模式" min-width="120">
            <template #default="{ row }">
              <span v-if="(row.phases || []).length > 1">{{ row.phases.length }} 阶段</span>
              <span v-else>{{ (row.phases && row.phases[0] && row.phases[0].run_mode) || row.delivery_mode }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="80" />
          <el-table-column label="定义数" width="80">
            <template #default="{ row }">{{ (row.definition_ids || []).length }}</template>
          </el-table-column>
          <el-table-column label="设备限制" width="100">
            <template #default="{ row }">{{ (row.device_ids || []).length ? row.device_ids.length + ' 台' : '全部' }}</template>
          </el-table-column>
          <el-table-column label="步骤数" width="80">
            <template #default="{ row }">{{ phaseStepCount(row) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="70">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="goEditConnector(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeConn(row)">删</el-button>
            </template>
          </el-table-column>
          <el-table-column label="每设备出站" width="120" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDevStateDlg(row)">控制</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="执行追溯" name="trace">
        <div class="toolbar">
          <el-select v-model="traceConnectorId" placeholder="选择连接器" filterable clearable style="width: 320px">
            <el-option v-for="c in connectors" :key="c.id" :label="`${c.name} (#${c.id})`" :value="c.id" />
          </el-select>
          <el-select v-model="traceDeviceId" filterable clearable placeholder="设备（可选，调试单台）" style="width: 280px">
            <el-option v-for="dv in devices" :key="dv.id" :label="`#${dv.id} ${dv.name || dv.serial || '-'}`" :value="dv.id" />
          </el-select>
          <el-button type="primary" :loading="loading.trace" :disabled="!traceConnectorId" @click="loadTrace">
            加载拓扑与统计
          </el-button>
        </div>
        <p v-if="traceConnectorId" class="trace-stomp-hint">
          在本页选择连接器后自动拉取统计并订阅 STOMP；有新投递经过步骤时，拓扑节点旁次数与表格会实时累加。
        </p>
        <template v-if="traceData">
          <ConnectorFlowGraph
            flow-id="outbound-exec-trace"
            :phases="traceData.connector.phases || []"
            :node-stats="traceData.node_stats"
            :height="460"
            trace-mode
          />
          <el-table :data="traceData.node_stats" border size="small" style="margin-top: 12px" max-height="300">
            <el-table-column prop="label" label="执行节点" min-width="160" show-overflow-tooltip />
            <el-table-column prop="phase_id" label="阶段" width="80" />
            <el-table-column prop="step_id" label="步骤" width="80" />
            <el-table-column prop="step_type" label="类型" width="120" />
            <el-table-column prop="total" label="次数" width="80" />
            <el-table-column prop="success" label="成功" width="70" />
            <el-table-column prop="failed" label="失败" width="70" />
            <el-table-column label="成功率" width="90">
              <template #default="{ row }">
                {{ row.total ? Math.round((100 * row.success) / row.total) : 0 }}%
              </template>
            </el-table-column>
            <el-table-column prop="last_run" label="最近执行" width="180" />
          </el-table>
        </template>
        <el-empty v-else description="请选择连接器并加载" />
      </el-tab-pane>

      <el-tab-pane label="投递日志" name="deliveries">
        <div class="toolbar">
          <el-input v-model="delFilter.connector_id" placeholder="connector_id" clearable style="width: 120px; margin-right: 8px" />
          <el-input v-model="delFilter.device_event_id" placeholder="device_event_id" clearable style="width: 140px; margin-right: 8px" />
          <el-button :loading="loading.deliveries" @click="loadDeliveries(1)">查询</el-button>
        </div>
        <el-table
          :data="deliveries"
          border
          size="small"
          v-loading="loading.deliveries"
          row-key="id"
          @expand-change="onDeliveryExpandChange"
        >
          <el-table-column type="expand" width="44">
            <template #default="{ row }">
              <div class="del-expand" v-loading="delExpandState[row.id]?.loading">
                <template v-if="delExpandState[row.id]?.data">
                  <div class="del-expand-actions">
                    <el-button type="primary" size="small" :loading="delExpandState[row.id]?.retrying" @click="onDeliveryRetry(row)">
                      重试此步骤
                    </el-button>
                    <span class="hint">将按原设备事件与连接器步骤再执行一次，并产生新的投递记录</span>
                  </div>
                  <h4 class="del-expand-title">连接器执行阶段（当前行高亮）</h4>
                  <div v-for="(ph, pi) in (delExpandState[row.id].data.connector?.phases || [])" :key="ph.id" class="del-phase" :class="{ 'del-phase--hi': isPhaseHi(ph, delExpandState[row.id].data) }">
                    <div class="del-phase-hdr">
                      <el-tag size="small">阶段 {{ pi + 1 }}</el-tag>
                      <span class="del-phase-meta">#{{ ph.id }} · {{ ph.run_mode }}</span>
                    </div>
                    <ul class="del-step-list">
                      <li
                        v-for="(st, si) in ph.steps || []"
                        :key="st.id"
                        class="del-step"
                        :class="{ 'del-step--hi': isStepHi(st, delExpandState[row.id].data) }"
                      >
                        <span class="del-step-idx">{{ si + 1 }}.</span>
                        <el-tag type="info" size="small">{{ st.step_type }}</el-tag>
                        <span v-if="st.step_type === 'http' && st.endpoint_id">接口 #{{ st.endpoint_id }}</span>
                        <span v-else-if="st.step_type === 'app_script' && st.config?.app_id">应用 #{{ st.config.app_id }} · {{ st.config.hook || 'before_request' }}</span>
                        <code v-else class="del-step-cfg">{{ fmtJson(st.config) }}</code>
                      </li>
                    </ul>
                  </div>
                  <h4 class="del-expand-title">当前投递上下文</h4>
                  <el-descriptions :column="2" border size="small" class="del-desc">
                    <el-descriptions-item label="阶段 ID">{{ delExpandState[row.id].data.current_step?.phase_id || '—' }}</el-descriptions-item>
                    <el-descriptions-item label="步骤 ID">{{ delExpandState[row.id].data.current_step?.step_id || '—' }}</el-descriptions-item>
                    <el-descriptions-item label="步骤类型">{{ delExpandState[row.id].data.current_step?.step_type || '—' }}</el-descriptions-item>
                    <el-descriptions-item label="接口 ID">{{ delExpandState[row.id].data.current_step?.endpoint_id || '—' }}</el-descriptions-item>
                  </el-descriptions>
                  <h4 class="del-expand-title">设备事件</h4>
                  <pre class="del-pre">{{ fmtJson(delExpandState[row.id].data.device_event) }}</pre>
                  <h4 class="del-expand-title">进入本步时的占位符（模板变量）</h4>
                  <el-input
                    v-model="delExpandState[row.id].upstreamFilter"
                    placeholder="过滤键名（如 context. / http.）"
                    clearable
                    size="small"
                    class="del-tpl-filter"
                  />
                  <el-table
                    v-if="deliveryTemplateRows(delExpandState[row.id].data.execution_template, delExpandState[row.id].upstreamFilter).length"
                    :data="deliveryTemplateRows(delExpandState[row.id].data.execution_template, delExpandState[row.id].upstreamFilter)"
                    border
                    size="small"
                    max-height="280"
                    class="del-tpl-table"
                  >
                    <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
                    <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
                  </el-table>
                  <p v-else class="del-tpl-empty">无匹配项或尚无数据；可改筛选或展开下方 JSON。</p>
                  <el-collapse class="del-tpl-json-collapse">
                    <el-collapse-item title="查看 JSON（execution_template）" name="up">
                      <pre class="del-pre sm">{{ fmtJson(delExpandState[row.id].data.execution_template) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                  <h4 class="del-expand-title">本步结束后的占位符（向下游传递）</h4>
                  <el-input
                    v-model="delExpandState[row.id].downstreamFilter"
                    placeholder="过滤键名"
                    clearable
                    size="small"
                    class="del-tpl-filter"
                  />
                  <el-table
                    v-if="
                      deliveryTemplateRows(
                        delExpandState[row.id].data.execution_template_downstream,
                        delExpandState[row.id].downstreamFilter
                      ).length
                    "
                    :data="
                      deliveryTemplateRows(
                        delExpandState[row.id].data.execution_template_downstream,
                        delExpandState[row.id].downstreamFilter
                      )
                    "
                    border
                    size="small"
                    max-height="280"
                    class="del-tpl-table"
                  >
                    <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
                    <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
                  </el-table>
                  <p v-else class="del-tpl-empty">无匹配项或尚无数据。</p>
                  <el-collapse class="del-tpl-json-collapse">
                    <el-collapse-item title="查看 JSON（execution_template_downstream）" name="down">
                      <pre class="del-pre sm">{{ fmtJson(delExpandState[row.id].data.execution_template_downstream) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                  <template v-if="delExpandState[row.id].data.endpoint && Object.keys(delExpandState[row.id].data.endpoint).length">
                    <h4 class="del-expand-title">调用的应用接口（配置）</h4>
                    <pre class="del-pre">{{ fmtJson(delExpandState[row.id].data.endpoint) }}</pre>
                  </template>
                  <h4 class="del-expand-title">执行详情 / 请求与响应</h4>
                  <pre class="del-pre">{{ fmtJson(delExpandState[row.id].data.delivery?.detail) }}</pre>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="device_event_id" label="事件ID" width="90" />
          <el-table-column prop="connector_id" label="连接器" width="90" />
          <el-table-column prop="endpoint_id" label="接口" width="80" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="http_status" label="HTTP" width="70" />
          <el-table-column prop="attempts" label="次数" width="60" />
          <el-table-column prop="duration_ms" label="耗时ms" width="90" />
          <el-table-column prop="request_url" label="URL" min-width="180" show-overflow-tooltip />
          <el-table-column prop="error" label="错误" min-width="120" show-overflow-tooltip />
          <el-table-column prop="created_at" label="时间" width="170" />
        </el-table>
        <el-pagination
          v-model:current-page="delPage"
          :page-size="delPageSize"
          :total="delTotal"
          layout="total, prev, pager, next"
          style="margin-top: 12px"
          @current-change="loadDeliveries"
        />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="devStateDlg.visible" :title="devStateDlgTitle" width="720px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="dev-state-alert"
        title="说明"
        description="暂停：该设备上此连接器不再触发服务端出站。启用：清除暂停/排除状态。删除：排除该设备（全局连接器下不再投递），需点「启用」恢复。"
      />
      <el-table :data="devStateDlg.rows" border size="small" v-loading="devStateDlg.loading" max-height="360">
        <el-table-column label="设备" min-width="200">
          <template #default="{ row }">
            <span>{{ outboundDevBrief(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'active'" type="success" size="small">正常</el-tag>
            <el-tag v-else-if="row.status === 'paused'" type="warning" size="small">暂停</el-tag>
            <el-tag v-else type="info" size="small">已排除</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="170" />
        <el-table-column v-if="auth.isOperator" label="操作" width="200" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :disabled="row.status === 'active'" @click="outboundDevEnable(row)">启用</el-button>
            <el-button link type="warning" size="small" :disabled="row.status === 'paused' || row.status === 'excluded'" @click="outboundDevPause(row)">暂停</el-button>
            <el-button link type="danger" size="small" :disabled="row.status === 'excluded'" @click="outboundDevExclude(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template v-if="!devStateDlg.scoped && auth.isOperator">
        <el-divider content-position="left">全局连接器：指定设备</el-divider>
        <div class="toolbar" style="flex-wrap: wrap; gap: 8px">
          <el-select v-model="devStateDlg.pickDeviceId" filterable clearable placeholder="选择设备" style="width: 320px">
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name || d.serial || '设备'} (#${d.id})`"
              :value="d.id"
            />
          </el-select>
          <el-button :disabled="!devStateDlg.pickDeviceId" @click="outboundPickPause">暂停</el-button>
          <el-button :disabled="!devStateDlg.pickDeviceId" @click="outboundPickExclude">删除</el-button>
          <el-button :disabled="!devStateDlg.pickDeviceId" @click="outboundPickEnable">启用</el-button>
        </div>
      </template>
      <p v-if="!devStateDlg.scoped && !devStateDlg.rows.length" class="hint">暂无已写入状态的设备；请用上方下拉对指定设备操作。</p>
      <template #footer>
        <el-button @click="devStateDlg.visible = false">关闭</el-button>
        <el-button :loading="devStateDlg.loading" @click="reloadDevStates">刷新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as ob from '@/api/outbound'
import * as cfgApi from '@/api/customEventConfig'
import { getDevices } from '@/api/device'
import { useAuthStore } from '@/stores/auth'
import { createOutboundConnectorTraceStomp } from '@/utils/outboundTraceStomp'
import { mergeOutboundTraceNodeTick, traceTickFiltersDevice } from '@/utils/outboundTraceMerge'
import ConnectorFlowGraph from '@/components/outbound/ConnectorFlowGraph.vue'

const auth = useAuthStore()
const router = useRouter()

const activeTab = ref('connectors')
const connectors = ref([])
const definitions = ref([])
const devices = ref([])
const deliveries = ref([])
const delTotal = ref(0)
const delPage = ref(1)
const delPageSize = ref(20)

const loading = reactive({
  connectors: false,
  deliveries: false,
  trace: false
})

const traceConnectorId = ref(null)
const traceDeviceId = ref(null)
const traceData = ref(null)

let integTraceStomp = null

function stopIntegTraceStomp() {
  integTraceStomp?.stop()
  integTraceStomp = null
}

function restartIntegTraceStomp() {
  stopIntegTraceStomp()
  if (activeTab.value !== 'trace' || !traceConnectorId.value || !traceData.value) return
  integTraceStomp = createOutboundConnectorTraceStomp(
    traceConnectorId.value,
    () => auth.token,
    (tick) => {
      if (!traceData.value?.node_stats) return
      if (!traceTickFiltersDevice(tick, traceDeviceId.value)) return
      traceData.value = {
        ...traceData.value,
        node_stats: mergeOutboundTraceNodeTick(traceData.value.node_stats, tick)
      }
    }
  )
  integTraceStomp.start()
}

const delFilter = reactive({ connector_id: '', device_event_id: '' })

/** 投递日志展开：详情与重试状态（按 delivery id） */
const delExpandState = reactive({})

function phaseStepCount(row) {
  let n = 0
  for (const p of row.phases || []) {
    n += (p.steps || []).length
  }
  return n
}

const devStateDlg = reactive({
  visible: false,
  conn: null,
  rows: [],
  loading: false,
  scoped: false,
  pickDeviceId: null
})

const devStateDlgTitle = computed(() => {
  const c = devStateDlg.conn
  if (!c) return '按设备出站控制'
  return `出站 — ${c.name} (#${c.id})`
})

function goNewConnector() {
  router.push('/outbound/connectors/new')
}

function goEditConnector(row) {
  router.push(`/outbound/connectors/${row.id}`)
}

async function loadConnectors() {
  loading.connectors = true
  try {
    const r = await ob.listOutboundConnectors()
    connectors.value = r.data || []
  } finally {
    loading.connectors = false
  }
}

async function loadDefinitions() {
  const r = await cfgApi.listCustomEventDefinitions({ enabled: '1' })
  definitions.value = r.data || []
}

async function loadDevices() {
  const r = await getDevices()
  devices.value = r.data || []
}

async function loadDeliveries(page) {
  if (page) delPage.value = page
  loading.deliveries = true
  try {
    const r = await ob.listOutboundDeliveries({
      page: delPage.value,
      page_size: delPageSize.value,
      connector_id: delFilter.connector_id || undefined,
      device_event_id: delFilter.device_event_id || undefined
    })
    deliveries.value = r.data || []
    delTotal.value = r.total || 0
    for (const k of Object.keys(delExpandState)) {
      delete delExpandState[k]
    }
  } finally {
    loading.deliveries = false
  }
}

function fmtJson(v) {
  if (v == null || v === '') return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function isPhaseHi(ph, data) {
  const h = data?.highlight
  if (!h) return false
  return Number(ph.id) === Number(h.phase_id)
}

function isStepHi(st, data) {
  const h = data?.highlight
  if (!h) return false
  return Number(st.id) === Number(h.step_id)
}

/** 将 execution_template 对象转为表格行，支持按键名子串过滤（不区分大小写）。 */
function deliveryTemplateRows(obj, q) {
  if (!obj || typeof obj !== 'object') return []
  const qq = (q || '').trim().toLowerCase()
  return Object.keys(obj)
    .sort()
    .filter((k) => !qq || String(k).toLowerCase().includes(qq))
    .map((k) => ({ key: k, value: String(obj[k] ?? '') }))
}

async function onDeliveryExpandChange(row, expandedRows) {
  const opened = expandedRows && expandedRows.some((r) => r.id === row.id)
  if (!opened) return
  if (!delExpandState[row.id]) {
    delExpandState[row.id] = {
      loading: false,
      data: null,
      retrying: false,
      upstreamFilter: '',
      downstreamFilter: ''
    }
  }
  delExpandState[row.id].loading = true
  try {
    const r = await ob.getOutboundDelivery(row.id)
    delExpandState[row.id].data = r.data
  } catch {
    delExpandState[row.id].data = null
  } finally {
    delExpandState[row.id].loading = false
  }
}

async function onDeliveryRetry(row) {
  if (!delExpandState[row.id]) {
    delExpandState[row.id] = {
      loading: false,
      data: null,
      retrying: false,
      upstreamFilter: '',
      downstreamFilter: ''
    }
  }
  delExpandState[row.id].retrying = true
  try {
    const r = await ob.retryOutboundDelivery(row.id)
    ElMessage.success(`重试已完成，新投递记录 ID #${r.data?.id ?? ''}`)
    await loadDeliveries(delPage.value)
    if (!delExpandState[row.id]) {
      delExpandState[row.id] = {
        loading: false,
        data: null,
        retrying: false,
        upstreamFilter: '',
        downstreamFilter: ''
      }
    }
    delExpandState[row.id].loading = true
    try {
      const d = await ob.getOutboundDelivery(row.id)
      delExpandState[row.id].data = d.data
    } finally {
      delExpandState[row.id].loading = false
    }
  } finally {
    delExpandState[row.id].retrying = false
  }
}

function onTab(name) {
  if (name === 'deliveries' && !deliveries.value.length) loadDeliveries(1)
}

function openDevStateDlg(row) {
  devStateDlg.conn = row
  devStateDlg.pickDeviceId = null
  devStateDlg.visible = true
  reloadDevStates()
}

async function reloadDevStates() {
  if (!devStateDlg.conn?.id) return
  devStateDlg.loading = true
  try {
    const r = await ob.getOutboundConnectorDeviceStates(devStateDlg.conn.id)
    devStateDlg.rows = r.data || []
    devStateDlg.scoped = !!r.scoped
  } catch (e) {
    const msg = e?.response?.data?.error || e.message || '加载失败'
    ElMessage.error(msg)
    devStateDlg.rows = []
  } finally {
    devStateDlg.loading = false
  }
}

function outboundDevBrief(row) {
  const d = row.device
  if (d) return `${d.name || d.serial || '设备'} (#${row.device_id})`
  return `设备 #${row.device_id}`
}

async function outboundDevPause(row) {
  const cid = devStateDlg.conn.id
  await ob.postOutboundConnectorDevicePause(cid, row.device_id)
  ElMessage.success('已暂停')
  await reloadDevStates()
}

async function outboundDevEnable(row) {
  const cid = devStateDlg.conn.id
  await ob.postOutboundConnectorDeviceEnable(cid, row.device_id)
  ElMessage.success('已启用')
  await reloadDevStates()
}

async function outboundDevExclude(row) {
  await ElMessageBox.confirm('将该设备从此连接器出站中排除？之后需点「启用」恢复。', '确认', { type: 'warning' })
  const cid = devStateDlg.conn.id
  await ob.postOutboundConnectorDeviceExclude(cid, row.device_id)
  ElMessage.success('已排除')
  await reloadDevStates()
}

async function outboundPickPause() {
  const did = devStateDlg.pickDeviceId
  if (!did || !devStateDlg.conn?.id) return
  await ob.postOutboundConnectorDevicePause(devStateDlg.conn.id, did)
  ElMessage.success('已暂停')
  await reloadDevStates()
}

async function outboundPickExclude() {
  const did = devStateDlg.pickDeviceId
  if (!did || !devStateDlg.conn?.id) return
  await ElMessageBox.confirm('排除该设备？', '确认', { type: 'warning' })
  await ob.postOutboundConnectorDeviceExclude(devStateDlg.conn.id, did)
  ElMessage.success('已排除')
  await reloadDevStates()
}

async function outboundPickEnable() {
  const did = devStateDlg.pickDeviceId
  if (!did || !devStateDlg.conn?.id) return
  await ob.postOutboundConnectorDeviceEnable(devStateDlg.conn.id, did)
  ElMessage.success('已启用')
  await reloadDevStates()
}

async function removeConn(row) {
  await ElMessageBox.confirm(`删除连接器「${row.name}」？`, '确认', { type: 'warning' })
  await ob.deleteOutboundConnector(row.id)
  await loadConnectors()
}

async function loadTrace() {
  if (!traceConnectorId.value) return
  loading.trace = true
  try {
    const params = {}
    if (traceDeviceId.value) params.device_id = traceDeviceId.value
    const r = await ob.getConnectorExecutionTrace(traceConnectorId.value, params)
    traceData.value = { connector: r.connector || {}, node_stats: r.node_stats || [] }
  } finally {
    loading.trace = false
  }
  restartIntegTraceStomp()
}

watch(
  () => [activeTab.value, traceConnectorId.value, traceDeviceId.value],
  async () => {
    stopIntegTraceStomp()
    if (activeTab.value !== 'trace' || !traceConnectorId.value) {
      if (!traceConnectorId.value) traceData.value = null
      return
    }
    await loadTrace()
  }
)

onMounted(async () => {
  await Promise.all([loadDefinitions(), loadDevices()])
  await loadConnectors()
})

onUnmounted(() => {
  stopIntegTraceStomp()
})
</script>

<style scoped>
.trace-stomp-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.outbound-page {
  padding: 0 4px;
}
.dev-state-alert {
  margin-bottom: 12px;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.del-expand {
  max-width: 1100px;
  padding: 8px 12px 16px;
}
.del-expand-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.del-expand-title {
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}
.del-phase {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.del-phase--hi {
  border-color: #409eff;
  background: #ecf5ff;
}
.del-phase-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.del-phase-meta {
  font-size: 12px;
  color: #64748b;
}
.del-step-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
}
.del-step {
  margin-bottom: 6px;
}
.del-step--hi {
  font-weight: 600;
  color: #409eff;
}
.del-step-idx {
  margin-right: 6px;
  color: #94a3b8;
}
.del-step-cfg {
  font-size: 12px;
  margin-left: 6px;
  word-break: break-all;
}
.del-desc {
  margin-top: 4px;
}
.del-pre {
  margin: 0;
  padding: 10px 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  overflow: auto;
  max-height: 320px;
}
.del-pre.sm {
  max-height: 180px;
}
.del-tpl-filter {
  margin: 4px 0 8px;
  max-width: 420px;
}
.del-tpl-table {
  margin-bottom: 8px;
}
.del-tpl-empty {
  margin: 4px 0 10px;
  font-size: 12px;
  color: #909399;
}
.del-tpl-json-collapse {
  margin-bottom: 12px;
}
</style>
