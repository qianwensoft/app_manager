<template>
  <div class="settings-page">
    <el-tabs v-model="activeTab">
      <!-- 注册设置 -->
      <el-tab-pane label="注册设置" name="register">
        <el-form label-width="140px" style="max-width: 500px">
          <el-form-item label="允许用户注册">
            <el-switch v-model="allowRegister" @change="saveRegisterSetting" />
            <span style="margin-left: 10px; color: #909399; font-size: 12px">关闭后 /api/auth/register 接口返回 403</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 心跳设置 -->
      <el-tab-pane label="心跳设置" name="heartbeat">
        <el-form :model="heartbeat" label-width="120px" style="max-width: 500px">
          <el-form-item label="心跳间隔">
            <el-input-number v-model="heartbeat.interval" :min="10" :max="300" />
            <span class="ml-2">秒</span>
          </el-form-item>
          <el-form-item label="超时时间">
            <el-input-number v-model="heartbeat.timeout" :min="30" :max="600" />
            <span class="ml-2">秒</span>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveHeartbeat">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 系统信息 -->
      <el-tab-pane label="系统信息" name="system">
        <div v-if="sysInfo" class="system-info-section">
          <el-card class="mb-4">
            <template #header><h3>运行环境</h3></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="Go 版本">{{ sysInfo.server.go_version }}</el-descriptions-item>
              <el-descriptions-item label="操作系统">{{ sysInfo.server.os }} / {{ sysInfo.server.arch }}</el-descriptions-item>
              <el-descriptions-item label="主机名">{{ sysInfo.server.hostname }}</el-descriptions-item>
              <el-descriptions-item label="进程 ID">{{ sysInfo.server.pid }}</el-descriptions-item>
              <el-descriptions-item label="运行时长">{{ formatUptime(sysInfo.server.uptime_seconds) }}</el-descriptions-item>
              <el-descriptions-item label="监听地址">{{ sysInfo.server.host }}:{{ sysInfo.server.port }}</el-descriptions-item>
              <el-descriptions-item label="对外 URL">{{ sysInfo.server.public_base_url || '未配置（按 host:port 推导）' }}</el-descriptions-item>
              <el-descriptions-item label="配置文件">{{ sysInfo.config_path }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card class="mb-4">
            <template #header><h3>数据库连接</h3></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="数据库类型">{{ sysInfo.database.type }}</el-descriptions-item>
              <el-descriptions-item label="DSN">
                <span>{{ sysInfo.database.dsn_masked }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="连接状态">
                <el-tag :type="sysInfo.database.ping_ok ? 'success' : 'danger'" size="small">
                  {{ sysInfo.database.ping_ok ? '正常' : '异常' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="打开连接数">{{ sysInfo.database.pool?.open ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="使用中">{{ sysInfo.database.pool?.in_use ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="空闲">{{ sysInfo.database.pool?.idle ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="最大连接数">{{ sysInfo.database.pool?.max_open ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="等待次数">{{ sysInfo.database.pool?.wait_count ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="等待耗时">{{ sysInfo.database.pool?.wait_duration ?? '-' }} ms</el-descriptions-item>
              <el-descriptions-item label="空闲关闭">{{ sysInfo.database.pool?.max_idle_closed ?? '-' }}</el-descriptions-item>
              <el-descriptions-item label="超时关闭">{{ sysInfo.database.pool?.max_lifetime_closed ?? '-' }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card class="mb-4">
            <template #header><h3>工具检测</h3></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="FFmpeg">
                <div>
                  <el-tag :type="sysInfo.ffmpeg.available ? 'success' : 'danger'" size="small">
                    {{ sysInfo.ffmpeg.available ? '可用' : '不可用' }}
                  </el-tag>
                  <span v-if="sysInfo.ffmpeg.version" style="margin-left: 8px; font-size: 12px; color: #909399">{{ sysInfo.ffmpeg.version }}</span>
                  <span v-if="sysInfo.ffmpeg.path" style="margin-left: 8px; font-size: 12px; color: #909399">{{ sysInfo.ffmpeg.path }}</span>
                </div>
              </el-descriptions-item>
              <el-descriptions-item label="ADB">
                <div>
                  <el-tag :type="sysInfo.adb.available ? 'success' : 'danger'" size="small">
                    {{ sysInfo.adb.available ? '可用' : '不可用' }}
                  </el-tag>
                  <span v-if="sysInfo.adb.version" style="margin-left: 8px; font-size: 12px; color: #909399">{{ sysInfo.adb.version }}</span>
                  <span v-if="sysInfo.adb.path" style="margin-left: 8px; font-size: 12px; color: #909399">{{ sysInfo.adb.path }}</span>
                </div>
              </el-descriptions-item>
              <el-descriptions-item label="存储路径">{{ sysInfo.storage.path }}</el-descriptions-item>
              <el-descriptions-item label="存储上限">{{ sysInfo.storage.max_size_mb }} MB</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-button size="small" @click="loadSystemInfo">刷新</el-button>
        </div>
        <div v-else>
          <el-button type="primary" size="small" @click="loadSystemInfo" :loading="sysInfoLoading">加载系统信息</el-button>
        </div>
      </el-tab-pane>

      <!-- 环境变量 -->
      <el-tab-pane label="环境变量" name="env">
        <div v-if="sysInfo" class="env-section">
          <el-card class="mb-4">
            <template #header><h3>工具与路径配置</h3></template>
            <el-form :model="envForm" label-width="160px" style="max-width: 600px">
              <el-form-item label="FFmpeg 路径">
                <div style="display: flex; align-items: center; width: 100%">
                  <el-input v-model="envForm.ffmpeg_path" placeholder="留空则自动在 PATH 中查找" clearable style="flex: 1" />
                  <el-tag :type="sysInfo.ffmpeg.available ? 'success' : 'danger'" size="small" style="margin-left: 12px">
                    {{ sysInfo.ffmpeg.available ? '可用' : '不可用' }}
                  </el-tag>
                  <el-button size="small" @click="doCheckFFmpeg" :loading="ffmpegCheckLoading" style="margin-left: 8px">检测</el-button>
                  <el-button v-if="!sysInfo.ffmpeg.available" size="small" type="warning" @click="doInstallFFmpeg" :loading="ffmpegInstallLoading" style="margin-left: 8px">安装</el-button>
                </div>
                <div v-if="sysInfo.ffmpeg.version" style="margin-top: 4px; font-size: 12px; color: #909399">版本: {{ sysInfo.ffmpeg.version }}</div>
              </el-form-item>

              <el-form-item label="ADB 路径">
                <div style="display: flex; align-items: center; width: 100%">
                  <el-input v-model="envForm.adb_path" placeholder="留空则自动在 PATH 中查找" clearable style="flex: 1" />
                  <el-tag :type="sysInfo.adb.available ? 'success' : 'danger'" size="small" style="margin-left: 12px">
                    {{ sysInfo.adb.available ? '可用' : '不可用' }}
                  </el-tag>
                </div>
                <div v-if="sysInfo.adb.version" style="margin-top: 4px; font-size: 12px; color: #909399">版本: {{ sysInfo.adb.version }}</div>
              </el-form-item>

              <el-form-item label="存储路径">
                <el-input v-model="envForm.storage_path" placeholder="./uploads" clearable />
              </el-form-item>

              <el-form-item label="存储上限 (MB)">
                <el-input-number v-model="envForm.storage_max_size_mb" :min="100" :max="10000" :step="100" />
              </el-form-item>

              <el-form-item label="对外访问 URL">
                <el-input v-model="envForm.public_base_url" placeholder="如 http://192.168.1.10:8080" clearable />
                <div class="form-tip">用于 Agent 组态菜单预览链接；空则按 host:port 推导</div>
              </el-form-item>

              <el-form-item>
                <el-button type="primary" @click="saveEnvSettings" :loading="envSaving">保存并持久化</el-button>
                <span class="ml-2 form-tip">修改将写入配置 YAML 文件，重启后仍然生效</span>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
        <div v-else>
          <el-button type="primary" size="small" @click="loadSystemInfo" :loading="sysInfoLoading">先加载系统信息</el-button>
        </div>
      </el-tab-pane>

      <!-- 运行监控 -->
      <el-tab-pane label="运行监控" name="monitor">
        <div class="monitor-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
            <el-radio-group v-model="monitorHours" size="small" @change="loadMonitor">
              <el-radio-button :value="1">1 小时</el-radio-button>
              <el-radio-button :value="6">6 小时</el-radio-button>
              <el-radio-button :value="24">24 小时</el-radio-button>
              <el-radio-button :value="168">7 天</el-radio-button>
            </el-radio-group>
            <el-button size="small" :loading="monitorLoading" @click="loadMonitor">刷新</el-button>
          </div>

          <!-- Agent 在线连接 -->
          <el-card class="mb-4">
            <template #header>
              <div style="display: flex; align-items: center; gap: 12px">
                <h3 style="margin: 0">Agent 在线连接</h3>
                <el-tag type="success" size="small">当前在线 {{ agentConn.online_count }}</el-tag>
              </div>
            </template>
            <TrendChart v-if="agentTrendOption" :option="agentTrendOption" :height="220" />
            <el-empty v-else description="暂无在线数趋势数据" :image-size="60" />
            <el-table :data="agentConn.agents" border size="small" style="margin-top: 12px" max-height="300">
              <el-table-column prop="device_id" label="设备 ID" width="90" />
              <el-table-column prop="name" label="设备名" min-width="140" show-overflow-tooltip />
              <el-table-column prop="serial" label="序列号" min-width="140" show-overflow-tooltip />
              <el-table-column prop="android_serial" label="硬件串号" min-width="140" show-overflow-tooltip />
              <el-table-column label="前台应用" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  <div v-if="row.foreground_package">
                    <div v-if="row.foreground_app_name" style="font-weight: 500">{{ row.foreground_app_name }}</div>
                    <div style="font-size: 12px; color: #909399">{{ row.foreground_package }}</div>
                  </div>
                  <span v-else style="color: #c0c4cc">-</span>
                </template>
              </el-table-column>
              <el-table-column label="最后心跳" width="170">
                <template #default="{ row }">{{ row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : '-' }}</template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- 接口调用量 -->
          <el-card class="mb-4">
            <template #header><h3 style="margin: 0">接口调用量</h3></template>
            <TrendChart v-if="apiTrendOption" :option="apiTrendOption" :height="260" />
            <el-empty v-else description="暂无调用量数据（埋点每分钟落库一次）" :image-size="60" />
            <el-table :data="apiDetails" border size="small" style="margin-top: 12px" max-height="360">
              <el-table-column prop="endpoint" label="端点" min-width="220" show-overflow-tooltip />
              <el-table-column prop="method" label="方法" width="90" />
              <el-table-column prop="count" label="调用数" width="100" sortable />
              <el-table-column prop="avg_latency_ms" label="平均延迟" width="110">
                <template #default="{ row }">{{ row.avg_latency_ms }} ms</template>
              </el-table-column>
              <el-table-column label="错误数" width="100">
                <template #default="{ row }">
                  <span :style="{ color: row.error_count > 0 ? '#f56c6c' : '#909399' }">{{ row.error_count }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- Agent 更新管理 -->
      <el-tab-pane label="Agent 更新" name="agent">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
          <h3 style="margin: 0">Agent 更新管理</h3>
          <el-button type="primary" size="small" @click="openUploadDialog">上传新版本</el-button>
        </div>
        <el-table :data="updates" border>
          <el-table-column prop="version" label="版本名称" width="130" />
          <el-table-column prop="version_code" label="版本号" width="100">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.version_code }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="package_name" label="包名" min-width="180" show-overflow-tooltip />
          <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
          <el-table-column prop="changelog" label="更新说明" min-width="160" show-overflow-tooltip />
          <el-table-column prop="upload_at" label="上传时间" width="170">
            <template #default="{ row }">{{ new Date(row.upload_at).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="downloadAPK(row.id)">下载</el-button>
              <el-popconfirm title="确认删除该版本？" @confirm="deleteAPK(row.id)">
                <template #reference>
                  <el-button size="small" type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传 Agent APK" width="520px" :close-on-click-modal="false">
      <el-form :model="uploadForm" label-width="100px">
        <el-form-item label="APK 文件" required>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept=".apk"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
          >
            <el-button>选择 APK 文件</el-button>
          </el-upload>
          <div v-if="uploadForm.fileName" class="file-tip">
            已选择：{{ uploadForm.fileName }}
          </div>
        </el-form-item>
        <el-form-item label="版本名称">
          <el-input
            v-model="uploadForm.version"
            placeholder="留空则使用 APK 中的 versionName"
            clearable
          />
          <div class="form-tip">服务器会自动解析 APK 的包名、versionName 和 versionCode</div>
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input v-model="uploadForm.changelog" type="textarea" :rows="3" placeholder="本次更新内容..." />
        </el-form-item>
        <el-form-item v-if="uploading" label="上传进度">
          <el-progress :percentage="uploadProgress" :status="uploadProgress >= 100 ? 'success' : undefined" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false" :disabled="uploading">取消</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="!uploadForm.file"
          @click="submitUpload"
        >
          {{ uploading ? `上传中 ${uploadProgress}%` : '上传' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getHeartbeatSettings, updateHeartbeatSettings, getSystemInfo, updateEnvSettings, checkFFmpeg, installFFmpeg, getAgentConnections, getAgentOnlineTrend, getApiCallTrend, getApiCallDetails } from '@/api/settings'
import { uploadAgentAPK, listAgentUpdates, downloadAgentAPK, deleteAgentUpdate } from '@/api/agentUpdate'
import { getRegisterSetting, updateRegisterSetting } from '@/api/user'
import TrendChart from '@/components/TrendChart.vue'
import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

const route = useRoute()
const router = useRouter()

let stompClient = null

const activeTab = ref(route.query.tab || 'register')
const heartbeat = ref({ interval: 30, timeout: 90 })
const allowRegister = ref(false)
const updates = ref([])
const uploadDialogVisible = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadRef = ref(null)
const uploadForm = ref({ version: '', changelog: '', file: null, fileName: '' })

// System info
const sysInfo = ref(null)
const sysInfoLoading = ref(false)
const ffmpegCheckLoading = ref(false)
const ffmpegInstallLoading = ref(false)
const envSaving = ref(false)
const envForm = ref({
  ffmpeg_path: '',
  adb_path: '',
  storage_path: '',
  storage_max_size_mb: 500,
  public_base_url: ''
})

// 运行监控
const monitorHours = ref(24)
const monitorLoading = ref(false)
const agentConn = ref({ online_count: 0, agents: [] })
const agentTrend = ref([])
const apiTrend = ref([])
const apiDetails = ref([])

const fmtTs = (ts) => {
  const d = new Date(ts)
  // 小时粒度（7天）显示日期+时，分钟粒度显示时:分
  return monitorHours.value > 24
    ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const agentTrendOption = computed(() => {
  if (!agentTrend.value.length) return null
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: agentTrend.value.map((p) => fmtTs(p.ts)) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ name: '在线数', type: 'line', smooth: true, areaStyle: {}, data: agentTrend.value.map((p) => p.online) }]
  }
})

const apiTrendOption = computed(() => {
  if (!apiTrend.value.length) return null
  const x = apiTrend.value.map((p) => fmtTs(p.ts))
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['内部(JWT)', '外部(API Key)', '设备(Agent)', '匿名'] },
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: x },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: '内部(JWT)', type: 'line', smooth: true, data: apiTrend.value.map((p) => p.internal) },
      { name: '外部(API Key)', type: 'line', smooth: true, data: apiTrend.value.map((p) => p.external) },
      { name: '设备(Agent)', type: 'line', smooth: true, data: apiTrend.value.map((p) => p.device) },
      { name: '匿名', type: 'line', smooth: true, data: apiTrend.value.map((p) => p.anonymous) }
    ]
  }
})

const loadMonitor = async () => {
  monitorLoading.value = true
  try {
    const gran = monitorHours.value > 24 ? 'hour' : 'minute'
    const [conn, aTrend, cTrend, details] = await Promise.all([
      getAgentConnections(),
      getAgentOnlineTrend(monitorHours.value),
      getApiCallTrend(monitorHours.value, gran),
      getApiCallDetails(monitorHours.value)
    ])
    agentConn.value = conn || { online_count: 0, agents: [] }
    agentTrend.value = aTrend?.points || []
    apiTrend.value = cTrend?.points || []
    apiDetails.value = details?.details || []
  } catch (e) {
    ElMessage.error('加载监控数据失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    monitorLoading.value = false
  }
}

// STOMP 实时推送监控数据
const connectMonitorStomp = () => {
  if (stompClient) {
    return // 已连接
  }

  const token = localStorage.getItem('token')
  if (!token) return

  stompClient = new Client({
    brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
    reconnectDelay: 5000,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    onConnect: () => {
      console.log('[Monitor] STOMP connected')
      // 订阅 Agent 连接变化
      stompClient.subscribe('/topic/monitor/agent-connections', (message) => {
        try {
          const data = JSON.parse(message.body)
          if (data.type === 'agent_connection_change') {
            // 实时更新 Agent 连接数据
            agentConn.value = {
              online_count: data.online_count,
              agents: data.agents || []
            }
          }
        } catch (e) {
          console.warn('[Monitor] Parse STOMP message error:', e)
        }
      })
    },
    onDisconnect: () => {
      console.log('[Monitor] STOMP disconnected')
    },
    onStompError: (frame) => {
      console.warn('[Monitor] STOMP error:', frame.headers?.message || frame.body)
    },
    onWebSocketError: (e) => {
      console.warn('[Monitor] WebSocket error:', e)
    }
  })

  stompClient.activate()
}

const disconnectMonitorStomp = () => {
  if (stompClient) {
    stompClient.deactivate()
    stompClient = null
    console.log('[Monitor] STOMP disconnected manually')
  }
}

let monitorLoaded = false
watch(activeTab, (tab) => {
  // 更新 URL 查询参数
  router.replace({ query: { ...route.query, tab } })

  // 延迟加载监控数据
  if (tab === 'monitor' && !monitorLoaded) {
    monitorLoaded = true
    loadMonitor()
    connectMonitorStomp() // 启动 STOMP 实时推送
  } else if (tab !== 'monitor') {
    disconnectMonitorStomp() // 离开监控标签时断开 STOMP
  }
})

onMounted(async () => {
  const [hbRes, regRes] = await Promise.all([getHeartbeatSettings(), getRegisterSetting()])
  heartbeat.value = hbRes
  allowRegister.value = regRes.allow_register
  loadUpdates()
  loadSystemInfo()

  // 如果初始标签是 monitor，加载监控数据并启动 STOMP
  if (activeTab.value === 'monitor') {
    monitorLoaded = true
    loadMonitor()
    connectMonitorStomp()
  }
})

// 组件卸载时断开 STOMP
onBeforeUnmount(() => {
  disconnectMonitorStomp()
})

const loadSystemInfo = async () => {
  sysInfoLoading.value = true
  try {
    const res = await getSystemInfo()
    sysInfo.value = res
    // Populate env form from system info
    envForm.value = {
      ffmpeg_path: res.ffmpeg.path || '',
      adb_path: res.adb.path || '',
      storage_path: res.storage.path || '',
      storage_max_size_mb: res.storage.max_size_mb || 500,
      public_base_url: res.server.public_base_url || ''
    }
  } catch (e) {
    console.error('Failed to load system info:', e)
  } finally {
    sysInfoLoading.value = false
  }
}

const saveRegisterSetting = async () => {
  await updateRegisterSetting(allowRegister.value)
  ElMessage.success('保存成功')
}

const saveHeartbeat = async () => {
  await updateHeartbeatSettings(heartbeat.value)
  ElMessage.success('保存成功')
}

const doCheckFFmpeg = async () => {
  ffmpegCheckLoading.value = true
  try {
    const res = await checkFFmpeg()
    if (sysInfo.value) {
      sysInfo.value.ffmpeg = res
    }
    if (res.available) {
      ElMessage.success('FFmpeg 可用: ' + res.version)
    } else {
      ElMessage.warning('FFmpeg 不可用')
    }
  } catch (e) {
    ElMessage.error('检测失败')
  } finally {
    ffmpegCheckLoading.value = false
  }
}

const doInstallFFmpeg = async () => {
  ffmpegInstallLoading.value = true
  try {
    const res = await installFFmpeg()
    const data = res
    if (data.suggest) {
      ElMessageBox.alert(data.message, 'FFmpeg 安装提示', { type: 'info' })
    } else if (data.installed) {
      ElMessage.success(data.message)
      if (sysInfo.value) {
        sysInfo.value.ffmpeg = { path: data.path, available: data.available, version: data.version }
        envForm.value.ffmpeg_path = data.path
      }
    } else {
      ElMessage.error(data.message || '安装失败')
    }
  } catch (e) {
    ElMessage.error('安装失败: ' + (e?.response?.data?.message || e.message))
  } finally {
    ffmpegInstallLoading.value = false
  }
}

const saveEnvSettings = async () => {
  envSaving.value = true
  try {
    const res = await updateEnvSettings(envForm.value)
    ElMessage.success(res.message || '保存成功')
    // Refresh system info to reflect changes
    loadSystemInfo()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    envSaving.value = false
  }
}

const formatUptime = (seconds) => {
  if (!seconds) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}天 ${h}时 ${m}分 ${s}秒`
  if (h > 0) return `${h}时 ${m}分 ${s}秒`
  return `${m}分 ${s}秒`
}

const loadUpdates = async () => {
  const res = await listAgentUpdates()
  updates.value = res.items || []
}

const openUploadDialog = () => {
  uploadForm.value = { version: '', changelog: '', file: null, fileName: '' }
  uploadProgress.value = 0
  uploadDialogVisible.value = true
}

const handleFileChange = (file) => {
  uploadForm.value.file = file.raw
  uploadForm.value.fileName = file.name
}

const handleFileRemove = () => {
  uploadForm.value.file = null
  uploadForm.value.fileName = ''
}

const submitUpload = async () => {
  if (!uploadForm.value.file) {
    ElMessage.warning('请选择 APK 文件')
    return
  }
  uploading.value = true
  uploadProgress.value = 0
  try {
    const fd = new FormData()
    fd.append('file', uploadForm.value.file)
    fd.append('version', uploadForm.value.version)
    fd.append('changelog', uploadForm.value.changelog)
    await uploadAgentAPK(fd, (progressEvent) => {
      // 计算上传进度
      if (progressEvent.total) {
        uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      }
    })
    ElMessage.success('上传成功，包名和版本已自动解析')
    uploadDialogVisible.value = false
    uploadForm.value = { version: '', changelog: '', file: null, fileName: '' }
    uploadProgress.value = 0
    loadUpdates()
  } catch (e) {
    ElMessage.error('上传失败: ' + (e?.response?.data?.error || e.message || '未知错误'))
  } finally {
    uploading.value = false
  }
}

const downloadAPK = (id) => {
  window.open(downloadAgentAPK(id))
}

const deleteAPK = async (id) => {
  try {
    await deleteAgentUpdate(id)
    ElMessage.success('删除成功')
    loadUpdates()
  } catch {
    ElMessage.error('删除失败')
  }
}
</script>

<style scoped>
.settings-page { padding: 20px; }
.mb-4 { margin-bottom: 16px; }
.ml-2 { margin-left: 8px; }
.file-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #409eff;
}
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.system-info-section, .env-section {
  padding-top: 8px;
}
.monitor-section {
  padding-top: 8px;
}
</style>