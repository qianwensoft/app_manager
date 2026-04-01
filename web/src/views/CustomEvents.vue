<template>
  <div>
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px" title="自定义事件中心">
      <template #default>
        <p style="margin: 0 0 8px">
          监听规则在
          <router-link to="/event-definitions">事件定义</router-link>
          中配置（广播动作 + 数据标签），可分组管理。下方可选「下发范围」；不选则下发<strong>全部已启用</strong>定义。
        </p>
        <p style="margin: 0">多台 PDA 同时下发开启监听；外部系统可轮询 GET /api/open/v1/events（open:events:list）。</p>
      </template>
    </el-alert>

    <el-card style="margin-bottom: 16px">
      <template #header>
        <span>批量下发监听（需 Agent 在线）</span>
      </template>
      <el-form label-width="100px">
        <el-form-item label="选择设备">
          <el-select
            v-model="selectedIds"
            multiple
            filterable
            placeholder="多选设备"
            style="width: 100%; max-width: 560px"
          >
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name || d.serial} (#${d.id})${d.agent_connected ? '' : ' [离线]'}`"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="下发范围">
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start">
            <el-select
              v-model="scopeGroupIds"
              multiple
              filterable
              clearable
              placeholder="按分组（合并）"
              style="width: 220px"
            >
              <el-option v-for="g in eventGroups" :key="g.id" :label="g.name" :value="g.id" />
            </el-select>
            <el-select
              v-model="scopeDefinitionIds"
              multiple
              filterable
              clearable
              placeholder="指定定义"
              style="width: 280px"
            >
              <el-option
                v-for="d in eventDefinitions"
                :key="d.id"
                :disabled="!d.enabled"
                :label="`${d.name} (${d.key})`"
                :value="d.id"
              />
            </el-select>
          </div>
          <div class="hint">分组与定义可同时选，结果合并去重；皆空则使用全部已启用定义。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="batchLoading" :disabled="!selectedIds.length" @click="startListen">
            批量开启监听
          </el-button>
          <el-button :loading="batchLoading" :disabled="!selectedIds.length" @click="stopListen">
            批量停止监听
          </el-button>
          <el-button @click="loadDevices">刷新设备</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-bottom: 16px">
      <template #header>
        <div class="card-hdr">
          <span>已下发事件监听</span>
          <el-button size="small" :loading="listenViewsLoading" @click="loadListenViews">刷新</el-button>
        </div>
      </template>
      <p class="listen-hint">
        成功下发「开启监听」且 Agent 仍在线时会记为<strong>激活</strong>；停止下发或 Agent 断线会记为未激活。可按事件看多设备、按设备看多事件，或在明细中组合筛选。
      </p>
      <el-tabs v-model="listenViewTab">
        <el-tab-pane label="按事件（多设备）" name="byEvent">
          <el-table v-loading="listenViewsLoading" :data="aggByEvent" border size="small" max-height="360">
            <el-table-column prop="event_key" label="上报键 / 事件" min-width="160" show-overflow-tooltip />
            <el-table-column prop="count" label="设备数" width="88" align="center" />
            <el-table-column label="设备列表">
              <template #default="{ row }">
                <div class="dev-tags">
                  <el-tag
                    v-for="d in row.devices"
                    :key="d.id"
                    size="small"
                    :type="d.agent_connected ? 'success' : 'info'"
                    style="margin: 2px 4px 2px 0"
                  >
                    {{ deviceBriefLine(d) }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="按设备（多事件）" name="byDevice">
          <el-table v-loading="listenViewsLoading" :data="aggByDevice" border size="small" max-height="360">
            <el-table-column label="设备" min-width="200">
              <template #default="{ row }">
                <div class="dev-line">{{ deviceBriefLine(row.device) }}</div>
                <div v-if="row.device?.group_name" class="dev-sub">分组: {{ row.device.group_name }}</div>
              </template>
            </el-table-column>
            <el-table-column label="监听中的上报键" min-width="220">
              <template #default="{ row }">
                <el-tag v-for="k in row.event_keys" :key="k" size="small" style="margin: 2px 4px 2px 0">
                  {{ eventKeyLabel(k) }}
                </el-tag>
                <span v-if="!row.event_keys?.length">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="updated_at" label="更新时间" width="180" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="明细（单设备·单事件筛选）" name="detail">
          <div class="detail-filters">
            <el-select
              v-model="stateFilterDeviceId"
              clearable
              filterable
              placeholder="设备"
              style="width: 220px; margin-right: 8px"
            >
              <el-option
                v-for="d in devices"
                :key="d.id"
                :label="`${d.name || d.serial || '设备'} (#${d.id})`"
                :value="String(d.id)"
              />
            </el-select>
            <el-select
              v-model="stateFilterEventKey"
              clearable
              filterable
              placeholder="上报键"
              style="width: 260px; margin-right: 8px"
            >
              <el-option v-for="k in listenStateEventKeyOptions" :key="k" :label="eventKeyLabel(k)" :value="k" />
            </el-select>
            <el-checkbox v-model="stateIncludeInactive" @change="onIncludeInactiveChange">含已停止/离线</el-checkbox>
          </div>
          <el-table v-loading="listenViewsLoading" :data="filteredListenFlat" border size="small" max-height="320">
            <el-table-column prop="device_id" label="设备 ID" width="88" />
            <el-table-column label="设备" min-width="200">
              <template #default="{ row }">
                <template v-if="row.device">
                  <div class="dev-line">{{ deviceBriefLine(row.device) }}</div>
                  <div v-if="row.device.group_name" class="dev-sub">分组: {{ row.device.group_name }}</div>
                </template>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="激活" width="72" align="center">
              <template #default="{ row }">
                <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="上报键" min-width="200">
              <template #default="{ row }">
                <el-tag v-for="k in row.event_keys" :key="k" size="small" style="margin: 2px 4px 2px 0">
                  {{ eventKeyLabel(k) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="updated_at" label="更新时间" width="178" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-card>
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px">
          <span>事件流（STOMP 实时 + 最近入库）</span>
          <div>
            <el-select v-model="filterDeviceId" clearable placeholder="按设备筛选" style="width: 180px; margin-right: 8px">
              <el-option label="全部" :value="''" />
              <el-option v-for="d in devices" :key="d.id" :label="`${d.name || d.serial}`" :value="String(d.id)" />
            </el-select>
            <el-button :icon="Refresh" :loading="historyLoading" @click="loadHistory">刷新历史</el-button>
            <el-button @click="clearFeed">清空列表</el-button>
          </div>
        </div>
      </template>
      <el-table :data="displayRows" border max-height="520" size="small">
        <el-table-column prop="created_at" label="时间" width="198" />
        <el-table-column prop="device_id" label="ID" width="72" />
        <el-table-column label="设备（名称 · 标识）" min-width="240">
          <template #default="{ row }">
            <div class="dev-line">{{ row.device_display || '—' }}</div>
            <div v-if="row.device_serial || row.agent_token" class="dev-sub">
              <span v-if="row.device_serial">Serial: {{ row.device_serial }}</span>
              <span v-if="row.device_serial && row.agent_token"> · </span>
              <span v-if="row.agent_token">Token: {{ row.agent_token }}</span>
            </div>
            <div v-if="row.group_name" class="dev-sub">分组: {{ row.group_name }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="event_type" label="类型" width="148" show-overflow-tooltip />
        <el-table-column prop="event_data" label="数据" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import * as deviceApi from '@/api/device'
import * as eventsApi from '@/api/events'
import * as cfgApi from '@/api/customEventConfig'
import { createCustomEventsStomp } from '@/utils/customEventsStomp'

const auth = useAuthStore()
const devices = ref([])
const selectedIds = ref([])
const filterDeviceId = ref('')
const feed = ref([])
const batchLoading = ref(false)
const historyLoading = ref(false)
const eventGroups = ref([])
const eventDefinitions = ref([])
const scopeGroupIds = ref([])
const scopeDefinitionIds = ref([])

const listenViewTab = ref('byEvent')
const listenViewsLoading = ref(false)
const aggByEvent = ref([])
const aggByDevice = ref([])
const listenFlat = ref([])
const stateFilterDeviceId = ref('')
const stateFilterEventKey = ref('')
const stateIncludeInactive = ref(false)

const displayRows = computed(() => {
  const fid = filterDeviceId.value
  if (!fid) return feed.value
  const n = Number(fid)
  return feed.value.filter((r) => r.device_id === n)
})

const listenStateEventKeyOptions = computed(() => {
  const s = new Set()
  for (const row of listenFlat.value) {
    for (const k of row.event_keys || []) {
      if (k) s.add(k)
    }
  }
  for (const d of eventDefinitions.value) {
    if (d.key) s.add(d.key)
  }
  return Array.from(s).sort()
})

const filteredListenFlat = computed(() => {
  let rows = listenFlat.value
  const did = stateFilterDeviceId.value
  if (did) {
    const n = Number(did)
    rows = rows.filter((r) => r.device_id === n)
  }
  const ek = stateFilterEventKey.value
  if (ek) {
    rows = rows.filter((r) => (r.event_keys || []).includes(ek))
  }
  return rows
})

function deviceBriefLine(d) {
  if (!d || !d.id) return '—'
  const id = d.id
  const name = String(d.name || d.agent_alias || d.server_alias || '').trim()
  let tail = String(d.serial || '').trim()
  if (tail.startsWith('agent-')) tail = ''
  if (!tail && d.agent_token) {
    const t = String(d.agent_token).trim()
    tail = t.length <= 12 ? t : `${t.slice(0, 8)}…`
  }
  let s = `[#${id}]`
  if (name && tail) s += ` ${name}（${tail}）`
  else if (name) s += ` ${name}`
  else if (tail) s += ` ${tail}`
  else s += ' 设备'
  return s
}

function eventKeyLabel(key) {
  const d = eventDefinitions.value.find((x) => x.key === key)
  return d ? `${d.name} (${key})` : key
}

async function loadListenViews() {
  listenViewsLoading.value = true
  try {
    const [agg, flatR] = await Promise.all([
      eventsApi.getCustomListenAggregates(),
      eventsApi.getCustomListenState({
        include_inactive: stateIncludeInactive.value ? '1' : undefined
      })
    ])
    const d = agg.data || {}
    aggByEvent.value = d.by_event || []
    aggByDevice.value = d.by_device || []
    listenFlat.value = flatR.data || []
  } finally {
    listenViewsLoading.value = false
  }
}

function onIncludeInactiveChange() {
  loadListenViews()
}

let stomp = null

function buildDisplayFromParts(row) {
  const id = row.device_id
  const name = (row.device_name || row.agent_alias || row.server_alias || '').trim()
  let tail = ''
  const ser = (row.device_serial || '').trim()
  if (ser && !ser.startsWith('agent-')) tail = ser
  else if (row.agent_token) {
    const t = String(row.agent_token).trim()
    tail = t.length <= 12 ? t : `${t.slice(0, 8)}…`
  }
  let s = `[#${id}]`
  if (name && tail) s += ` ${name}（${tail}）`
  else if (name) s += ` ${name}`
  else if (tail) s += ` ${tail}`
  else s += ' 设备'
  return s
}

function normalizeRow(j) {
  const row = {
    id: j.id,
    device_id: j.device_id,
    device_name: j.device_name || '',
    device_serial: j.device_serial || '',
    agent_token: j.agent_token || '',
    agent_alias: j.agent_alias || '',
    group_name: j.group_name || '',
    server_alias: j.server_alias || '',
    device_display: j.device_display || '',
    event_type: j.event_type,
    event_data: j.event_data,
    created_at: j.created_at
  }
  if (!row.device_display && row.device_id) {
    row.device_display = buildDisplayFromParts(row)
  }
  return row
}

/** 用当前设备列表补全名称/分组等；仅在有补全或尚无展示行时重算 device_display（保留 STOMP 原样） */
function enrichFromDeviceCatalog(row) {
  const saved = (row.device_display || '').trim()
  const d = devices.value.find((x) => x.id === row.device_id)
  const out = { ...row }
  let merged = false
  if (d) {
    if (!out.device_serial && d.serial) {
      out.device_serial = d.serial
      merged = true
    }
    if (!out.agent_token && d.agent_token) {
      out.agent_token = d.agent_token
      merged = true
    }
    if (!out.agent_alias && d.agent_alias) {
      out.agent_alias = d.agent_alias
      merged = true
    }
    if (!out.group_name && d.group_name) {
      out.group_name = d.group_name
      merged = true
    }
    if (!out.server_alias && d.server_alias) {
      out.server_alias = d.server_alias
      merged = true
    }
    if (!out.device_name) {
      const n =
        (d.name && d.name.trim()) ||
        (d.agent_alias && d.agent_alias.trim()) ||
        (d.server_alias && d.server_alias.trim()) ||
        ''
      if (n) {
        out.device_name = n
        merged = true
      }
    }
  }
  if (!saved || merged) {
    out.device_display = buildDisplayFromParts(out)
  } else {
    out.device_display = saved
  }
  return out
}

const pushEvent = (j) => {
  const row = enrichFromDeviceCatalog(normalizeRow(j))
  feed.value = [row, ...feed.value].slice(0, 300)
}

const loadDevices = async () => {
  const r = await deviceApi.getDevices()
  devices.value = r.data || []
}

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const r = await eventsApi.listDeviceEvents({
      device_id: filterDeviceId.value || undefined
    })
    const list = (r.data || []).map((e) =>
      enrichFromDeviceCatalog(
        normalizeRow({
          id: e.id,
          device_id: e.device_id,
          event_type: e.event_type,
          event_data: e.event_data,
          created_at: e.created_at
        })
      )
    )
    for (const row of list.reverse()) {
      if (!feed.value.some((x) => x.id === row.id && row.id)) {
        feed.value.unshift(row)
      }
    }
    feed.value = feed.value.slice(0, 300)
  } finally {
    historyLoading.value = false
  }
}

const clearFeed = () => {
  feed.value = []
}

const loadEventScopeOptions = async () => {
  const [gr, df] = await Promise.all([cfgApi.listCustomEventGroups(), cfgApi.listCustomEventDefinitions({ enabled: '1' })])
  eventGroups.value = gr.data || []
  eventDefinitions.value = df.data || []
}

const startListen = async () => {
  batchLoading.value = true
  try {
    const r = await eventsApi.batchStartCustomEventListen(selectedIds.value, {
      groupIds: scopeGroupIds.value,
      definitionIds: scopeDefinitionIds.value
    })
    const results = r.data || []
    const ok = results.filter((x) => x.ok).length
    const fail = results.length - ok
    ElMessage.success(`已下发开启监听：成功 ${ok}，失败 ${fail}`)
    await loadListenViews()
  } finally {
    batchLoading.value = false
  }
}

const stopListen = async () => {
  batchLoading.value = true
  try {
    const r = await eventsApi.batchStopCustomEventListen(selectedIds.value)
    const results = r.data || []
    const ok = results.filter((x) => x.ok).length
    ElMessage.success(`已下发停止监听：成功 ${ok}`)
    await loadListenViews()
  } finally {
    batchLoading.value = false
  }
}

onMounted(async () => {
  await loadDevices()
  await loadEventScopeOptions()
  await loadListenViews()
  await loadHistory()
  stomp = createCustomEventsStomp(pushEvent, () => auth.token)
  stomp.connect()
})

onUnmounted(() => {
  stomp?.disconnect()
})
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  width: 100%;
}
.dev-line {
  font-weight: 500;
  line-height: 1.35;
}
.dev-sub {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 2px;
  word-break: break-all;
}
.card-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.listen-hint {
  font-size: 13px;
  color: #606266;
  margin: 0 0 12px;
  line-height: 1.5;
}
.detail-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
}
.dev-tags {
  line-height: 1.6;
}
</style>
