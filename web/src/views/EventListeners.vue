<template>
  <div class="event-listeners-page">
    <el-tabs v-model="activeMainTab" class="main-tabs">
      <el-tab-pane label="已下发事件监听" name="listeners">
        <el-card shadow="never">
          <template #header>
            <div class="header-row">
              <span>已下发事件监听</span>
              <div class="header-actions">
                <el-radio-group v-model="viewMode" size="small">
                  <el-radio-button value="flat">单条列表</el-radio-button>
                  <el-radio-button value="byEvent">按事件分组</el-radio-button>
                  <el-radio-button value="byDevice">按设备分组</el-radio-button>
                </el-radio-group>
                <el-button
                  v-if="store.entries.length"
                  type="danger"
                  plain
                  size="small"
                  @click="revokeAll"
                >
                  全部撤销
                </el-button>
              </div>
            </div>
          </template>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="hint"
            title="列表展示当前浏览器标签页内已建立的 STOMP 订阅。离开对应页面后监听会自动断开；也可在此单独撤销。"
          />

          <el-empty v-if="!store.entries.length" description="当前没有活跃的监听" />

          <el-table v-else-if="viewMode === 'flat'" :data="store.entries" border stripe>
            <el-table-column prop="eventLabel" label="事件" width="140" />
            <el-table-column prop="deviceScopeLabel" label="设备" min-width="160" />
            <el-table-column prop="topic" label="Topic" min-width="220" show-overflow-tooltip />
            <el-table-column prop="sourceLabel" label="来源页面" width="120" />
            <el-table-column label="建立时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button type="danger" link @click="store.revoke(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-else-if="viewMode === 'byEvent'" class="grouped">
            <el-card
              v-for="g in store.groupedByEvent"
              :key="g.eventKey"
              shadow="never"
              class="group-card"
            >
              <template #header>
                <span class="group-title">{{ g.eventLabel }}</span>
                <el-tag size="small" type="info">{{ g.items.length }} 条</el-tag>
              </template>
              <el-table :data="g.items" border size="small">
                <el-table-column label="设备" min-width="160">
                  <template #default="{ row }">
                    {{ row.deviceScopeLabel }}
                  </template>
                </el-table-column>
                <el-table-column prop="topic" label="Topic" min-width="200" show-overflow-tooltip />
                <el-table-column prop="sourceLabel" label="来源" width="110" />
                <el-table-column label="操作" width="88" fixed="right">
                  <template #default="{ row }">
                    <el-button type="danger" link size="small" @click="store.revoke(row.id)">
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>

          <div v-else class="grouped">
            <el-card
              v-for="g in store.groupedByDevice"
              :key="g.deviceKey"
              shadow="never"
              class="group-card"
            >
              <template #header>
                <span class="group-title">{{ g.deviceTitle }}</span>
                <el-tag size="small" type="success">{{ g.items.length }} 条</el-tag>
              </template>
              <el-table :data="g.items" border size="small">
                <el-table-column prop="eventLabel" label="事件" width="140" />
                <el-table-column prop="topic" label="Topic" min-width="200" show-overflow-tooltip />
                <el-table-column prop="sourceLabel" label="来源" width="110" />
                <el-table-column label="操作" width="88" fixed="right">
                  <template #default="{ row }">
                    <el-button type="danger" link size="small" @click="store.revoke(row.id)">
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="事件流" name="stream">
        <el-card shadow="never">
          <template #header>
            <div class="header-row">
              <span>事件流</span>
              <div class="header-actions">
                <el-button :loading="dbLoading" size="small" @click="loadDbEvents">刷新入库记录</el-button>
                <el-button size="small" :disabled="!liveRows.length" @click="clearLive">清空实时</el-button>
              </div>
            </div>
          </template>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="hint"
            title="实时：订阅 STOMP /topic/events（以及 /topic/device/{id}/events）推送。入库：从 /api/events 拉取最近写入的设备事件（与实时列表独立，可分别刷新）。"
          />

          <div class="stream-toolbar">
            <el-select
              v-model="filterDeviceId"
              clearable
              filterable
              placeholder="筛选设备 ID"
              style="width: 160px"
              size="small"
            >
              <el-option
                v-for="id in deviceIdOptions"
                :key="id"
                :label="String(id)"
                :value="id"
              />
            </el-select>
            <el-select
              v-model="filterEventType"
              clearable
              filterable
              allow-create
              default-first-option
              placeholder="入库事件类型"
              style="width: 200px"
              size="small"
            >
              <el-option v-for="t in eventTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </div>

          <h3 class="stream-section-title">STOMP 实时</h3>
          <el-table :data="filteredLiveRows" border stripe size="small" max-height="320" empty-text="暂无实时消息（请保持在本标签页）">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.receivedAt) }}
              </template>
            </el-table-column>
            <el-table-column prop="messageType" label="类型" width="180" show-overflow-tooltip />
            <el-table-column label="设备" width="100">
              <template #default="{ row }">
                {{ row.deviceId != null && row.deviceId !== '' ? row.deviceId : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="负载摘要" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.summary }}
              </template>
            </el-table-column>
          </el-table>

          <h3 class="stream-section-title">最近入库</h3>
          <el-table :data="dbEvents" border stripe size="small" max-height="360" empty-text="暂无入库记录">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="event_type" label="事件类型" width="160" show-overflow-tooltip />
            <el-table-column prop="device_id" label="设备 ID" width="100" />
            <el-table-column label="数据" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                {{ truncate(row.event_data, 240) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useEventListenerStore } from '@/stores/eventListeners'
import * as eventsApi from '@/api/events'
import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'
import { useAuthStore } from '@/stores/auth'

const store = useEventListenerStore()
const auth = useAuthStore()
const viewMode = ref('flat')
const activeMainTab = ref('listeners')

const EVENT_PAGE_TAB_KEY = 'app-manager-event-page-main-tab'
const EVENT_LISTENERS_VIEW_KEY = 'app-manager-event-listeners-view'

try {
  const t = localStorage.getItem(EVENT_PAGE_TAB_KEY)
  if (t === 'listeners' || t === 'stream') activeMainTab.value = t
} catch {
  /* noop */
}
try {
  const s = localStorage.getItem(EVENT_LISTENERS_VIEW_KEY)
  if (s === 'flat' || s === 'byEvent' || s === 'byDevice') viewMode.value = s
} catch {
  /* noop */
}

watch(viewMode, (v) => {
  try {
    localStorage.setItem(EVENT_LISTENERS_VIEW_KEY, v)
  } catch {
    /* noop */
  }
})

watch(
  activeMainTab,
  (v) => {
    try {
      localStorage.setItem(EVENT_PAGE_TAB_KEY, v)
    } catch {
      /* noop */
    }
    if (v === 'stream') {
      attachStreamStomp()
      loadDbEvents()
      loadEventTypes()
    } else {
      detachStreamStomp()
    }
  },
  { immediate: true }
)

const liveRows = ref([])
const streamListenerId = ref(null)
const LIVE_CAP = 200
let streamClient = null

function stompSummary(obj) {
  try {
    const s = JSON.stringify(obj)
    return s.length > 300 ? `${s.slice(0, 300)}…` : s
  } catch {
    return String(obj)
  }
}

function attachStreamStomp() {
  if (streamClient?.active) return
  if (!auth.token) return

  const client = new Client({
    brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(auth.token)}`,
    reconnectDelay: 5000,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    onConnect: () => {
      client.subscribe('/topic/events', (message) => {
        try {
          let j
          try {
            j = JSON.parse(message.body)
          } catch (e) {
            console.warn('[event stream STOMP] parse failed', e)
            return
          }
          if (typeof j !== 'object' || j == null) return
          liveRows.value.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            receivedAt: Date.now(),
            messageType: j.type || '(无 type)',
            deviceId: j.device_id,
            summary: stompSummary(j)
          })
          if (liveRows.value.length > LIVE_CAP) liveRows.value.length = LIVE_CAP
        } catch (e) {
          console.warn('[event stream STOMP] handler failed (subscription stays active)', e)
        }
      })

      streamListenerId.value = store.registerExternalListener({
        eventKey: 'device_event',
        eventLabel: '设备事件流',
        topic: '/topic/events',
        deviceId: null,
        deviceLabel: '全部设备',
        sourceLabel: '事件流',
        onRevoke: () => {
          try {
            client.deactivate()
          } catch {
            /* noop */
          }
        }
      })
    },
    onStompError: (frame) => {
      console.warn('STOMP events topic error', frame.headers?.message, frame.body)
    },
    onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
  })
  client.activate()
  streamClient = client
}

function detachStreamStomp() {
  if (streamListenerId.value) {
    store.revoke(streamListenerId.value)
    streamListenerId.value = null
  }
  try {
    streamClient?.deactivate()
  } catch {
    /* noop */
  }
  streamClient = null
}

const filterDeviceId = ref(null)
const filteredLiveRows = computed(() => {
  if (filterDeviceId.value == null || filterDeviceId.value === '') return liveRows.value
  const want = Number(filterDeviceId.value)
  return liveRows.value.filter((r) => Number(r.deviceId) === want)
})

const dbEvents = ref([])
const dbLoading = ref(false)
const eventTypes = ref([])
const filterEventType = ref('')

const deviceIdOptions = computed(() => {
  const s = new Set()
  liveRows.value.forEach((r) => {
    if (r.deviceId != null && r.deviceId !== '') s.add(Number(r.deviceId))
  })
  dbEvents.value.forEach((r) => {
    if (r.device_id != null) s.add(Number(r.device_id))
  })
  return Array.from(s).sort((a, b) => a - b)
})

async function loadDbEvents() {
  dbLoading.value = true
  try {
    const params = {}
    if (filterDeviceId.value != null && filterDeviceId.value !== '') {
      params.device_id = filterDeviceId.value
    }
    if (filterEventType.value) {
      params.event_type = filterEventType.value
    }
    const res = await eventsApi.listDeviceEvents(params)
    dbEvents.value = res.data || []
  } catch {
    dbEvents.value = []
  } finally {
    dbLoading.value = false
  }
}

async function loadEventTypes() {
  try {
    const res = await eventsApi.getEventTypes()
    eventTypes.value = res.data || []
  } catch {
    eventTypes.value = []
  }
}

watch([filterDeviceId, filterEventType], () => {
  if (activeMainTab.value === 'stream') loadDbEvents()
})

function clearLive() {
  liveRows.value = []
}

onUnmounted(() => {
  detachStreamStomp()
})

function formatTime(ts) {
  if (ts == null) return '—'
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleString('zh-CN')
}

function truncate(s, n) {
  if (s == null) return ''
  const str = String(s)
  return str.length > n ? `${str.slice(0, n)}…` : str
}

async function revokeAll() {
  try {
    await ElMessageBox.confirm('将撤销当前所有监听（含设备资料、录屏进度等），确定？', '确认', {
      type: 'warning'
    })
  } catch {
    return
  }
  const ids = store.entries.map((e) => e.id)
  ids.forEach((id) => store.revoke(id))
}
</script>

<style scoped>
.event-listeners-page {
  max-width: 1200px;
}
.main-tabs :deep(.el-tabs__content) {
  padding-top: 12px;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.hint {
  margin-bottom: 16px;
}
.grouped {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.group-card :deep(.el-card__header) {
  display: flex;
  align-items: center;
  gap: 10px;
}
.group-title {
  font-weight: 600;
}
.stream-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.stream-section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 20px 0 10px;
  color: #303133;
}
.stream-section-title:first-of-type {
  margin-top: 0;
}
</style>
