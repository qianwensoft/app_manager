<template>
  <div v-if="device">
    <el-tabs v-model="activeMainTab" @tab-change="onMainTabChange">
      <el-tab-pane label="设备信息" name="info">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Serial">{{ device.serial }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ device.model }}</el-descriptions-item>
          <el-descriptions-item label="品牌">{{ device.brand }}</el-descriptions-item>
          <el-descriptions-item label="Android">{{ device.os_version }}</el-descriptions-item>
          <el-descriptions-item label="SDK">{{ device.sdk_version }}</el-descriptions-item>
          <el-descriptions-item label="Agent 版本">{{ device.agent_version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="分辨率">{{ device.resolution }}</el-descriptions-item>
          <el-descriptions-item label="内存">
            <template v-if="device.memory_total > 0">{{ device.memory_used ?? 0 }} / {{ device.memory_total }} MB</template>
            <template v-else-if="device.total_memory > 0">{{ device.total_memory }} MB</template>
            <template v-else>—</template>
          </el-descriptions-item>
          <el-descriptions-item label="存储">
            <template v-if="device.total_storage > 0">
              <template v-if="device.agent_connected">{{ device.storage_used ?? 0 }} / {{ device.total_storage }} MB</template>
              <template v-else>{{ device.total_storage }} MB</template>
            </template>
            <template v-else>—</template>
          </el-descriptions-item>
          <el-descriptions-item label="IP">{{ device.ip || device.ip_address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="网络类型">{{ device.network_type || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Wi‑Fi 名称">{{ formatWifiSsid(device.wifi_ssid) }}</el-descriptions-item>
          <el-descriptions-item label="Wi‑Fi 信号">
            {{ device.wifi_signal != null && device.wifi_signal !== '' ? `${device.wifi_signal} / 100` : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="Wi‑Fi 链路速率">
            {{ device.wifi_speed != null && device.wifi_speed > 0 ? `${device.wifi_speed} Mbps` : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="互联网">
            <el-tag :type="device.network_connected ? 'success' : 'info'" size="small">
              {{ device.network_connected ? '已连通' : '未连通或未知' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="device.agent_connected ? 'success' : (device.status === 'online' ? 'success' : 'danger')">
              {{ device.agent_connected ? 'Agent在线' : device.status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="远程查看屏幕">
            <el-tag :type="device.allow_remote_screen ? 'success' : 'info'" size="small">
              {{ device.allow_remote_screen ? '端上已允许' : '端上未允许' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Agent Token" :span="2">
            <span v-if="device.agent_token">{{ device.agent_token }}</span>
            <el-text v-else type="warning">未绑定 — 屏幕/Shell/Logcat 需与手机端一致，请到「设备管理」填写扫码页上的 Token</el-text>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="!device.agent_token"
          type="warning"
          :closable="false"
          show-icon
          style="margin:12px 0;max-width:720px"
          title="当前设备无 Agent Token（多为 ADB 扫描入库）。请先扫码配置手机，再把同一 Token 填到「设备管理」保存，否则无法打开远程屏幕。"
        />

        <el-divider content-position="left">快捷操作</el-divider>
        <el-checkbox v-model="apkInstallAndLaunch" style="margin-bottom:10px;display:block">
          安装完成后启动应用
        </el-checkbox>
        <el-space wrap style="margin-bottom:16px">
          <el-button @click="$router.push(`/screen?device=${device.id}`)">查看屏幕</el-button>
          <el-button @click="$router.push(`/shell?device=${device.id}`)">Shell</el-button>
          <el-button @click="$router.push(`/logcat?device=${device.id}`)">Logcat</el-button>
          <el-button @click="screenshot" :loading="screenshotting">截图</el-button>
          <el-button @click="runSpeedTest" :loading="speedTesting">测速</el-button>
          <el-button @click="reboot" type="warning">重启设备</el-button>
          <el-upload
            :show-file-list="false"
            accept=".apk"
            :disabled="apkInstalling"
            :http-request="installApkToCurrentDevice"
          >
            <el-button type="primary" :loading="apkInstalling">安装 APK</el-button>
          </el-upload>
        </el-space>
        <div style="font-size:12px;color:#909399;margin:-8px 0 16px;max-width:720px">
          「安装 APK」会先上传到服务器再下发安装任务；纯 Agent 设备由手机端完成系统安装界面。需账号为管理员/运维。
        </div>

        <el-descriptions v-if="speedResult" :column="2" border style="margin-top:12px;max-width:640px" title="最近一次测速（服务器 ↔ Agent）">
          <el-descriptions-item label="WS 往返 (RTT)">{{ speedResult.rtt_ms != null ? `${speedResult.rtt_ms} ms` : '-' }}</el-descriptions-item>
          <el-descriptions-item label="下行">
            <template v-if="speedResult.download_ms != null">{{ fmtMbps(speedResult.download_mbps) }}（{{ speedResult.download_ms }} ms / {{ fmtBytes(speedResult.download_bytes) }}）</template>
            <template v-else>-</template>
          </el-descriptions-item>
          <el-descriptions-item label="上行">
            <template v-if="speedResult.upload_ms != null">{{ fmtMbps(speedResult.upload_mbps) }}（{{ speedResult.upload_ms }} ms / {{ fmtBytes(speedResult.upload_bytes) }}）</template>
            <template v-else>-</template>
          </el-descriptions-item>
          <el-descriptions-item v-if="speedResult.error" label="说明" :span="2">
            <el-text type="warning">{{ speedResult.error }}</el-text>
          </el-descriptions-item>
        </el-descriptions>

        <el-form inline>
          <el-form-item label="模拟按键">
            <el-select v-model="keycode" style="width:150px">
              <el-option label="Home" :value="3" />
              <el-option label="Back" :value="4" />
              <el-option label="Menu" :value="82" />
              <el-option label="Power" :value="26" />
              <el-option label="Volume+" :value="24" />
              <el-option label="Volume-" :value="25" />
            </el-select>
            <el-button @click="sendKey">发送</el-button>
          </el-form-item>
          <el-form-item label="输入文字">
            <el-input v-model="inputText" style="width:200px" />
            <el-button @click="sendText">发送</el-button>
          </el-form-item>
        </el-form>

        <el-space wrap style="margin-top:12px">
          <el-button @click="refreshInfo" :loading="refreshing">刷新信息</el-button>
          <el-button
            v-if="device.agent_connected"
            type="primary"
            plain
            :loading="agentInfoRefreshing"
            @click="refreshAgentInfoFromDevice"
          >
            刷新 Agent 网络与状态
          </el-button>
        </el-space>
        <div v-if="device.agent_connected" style="font-size:12px;color:#909399;margin-top:8px;max-width:720px">
          「刷新 Agent 网络与状态」会向手机拉取当前网络类型、Wi‑Fi 名称（SSID）、信号、链路速率等并写入本页；需 Agent 在线。
        </div>
      </el-tab-pane>

      <el-tab-pane label="文件管理" name="files">
        <el-space direction="vertical" alignment="stretch" :size="16" style="width:100%;max-width:960px">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="说明"
            description="录屏为 Agent 结束录屏后上传的 MP4（远程屏幕页可勾选录制音频）；截图可下载到本机或 ADB 截图后存档到服务器；音频可单独上传归档。"
          />

          <div>
            <div style="font-weight:600;margin-bottom:8px">录屏</div>
            <el-space wrap style="margin-bottom:8px">
              <el-button size="small" @click="loadFileHub" :loading="fileHubLoading">刷新</el-button>
              <el-button size="small" @click="$router.push(`/screen?device=${device.id}`)">远程屏幕（开始/停止录屏）</el-button>
            </el-space>
            <el-table :data="fileHub.recordings" border v-loading="fileHubLoading" empty-text="暂无录屏">
              <el-table-column prop="file_name" label="文件名" min-width="180" show-overflow-tooltip />
              <el-table-column label="大小" width="100">
                <template #default="{ row }">{{ formatFileSize(row.file_size) }}</template>
              </el-table-column>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatFileDate(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="310" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="primary" plain @click="openRecordingPlayer(row.id)">播放</el-button>
                  <el-button size="small" @click="downloadRecordingFile(row.id)">下载</el-button>
                  <el-button v-if="canMutate" size="small" @click="renameRecRow(row)">重命名</el-button>
                  <el-button v-if="canMutate" size="small" type="danger" @click="deleteRecRow(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <el-divider />

          <div>
            <div style="font-weight:600;margin-bottom:8px">截图</div>
            <el-space wrap>
              <el-button size="small" @click="screenshot" :loading="screenshotting">截图并下载到本机</el-button>
              <el-button
                size="small"
                type="primary"
                :loading="archiveShotLoading"
                :disabled="!canMutate"
                @click="archiveScreenshotToServer"
              >
                ADB 截图并存入服务器
              </el-button>
            </el-space>
            <el-table :data="screenshots" border style="margin-top:12px" empty-text="暂无已存档截图">
              <el-table-column label="预览" width="100">
                <template #default="{ row }">
                  <el-image
                    :src="deviceMediaStreamUrl(row.id)"
                    :preview-src-list="[deviceMediaStreamUrl(row.id)]"
                    fit="cover"
                    style="width:56px;height:56px;border-radius:4px"
                    preview-teleported
                  />
                </template>
              </el-table-column>
              <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
              <el-table-column label="大小" width="90">
                <template #default="{ row }">{{ formatFileSize(row.file_size) }}</template>
              </el-table-column>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatFileDate(row.created_at) }}</template>
              </el-table-column>
              <el-table-column v-if="canMutate" label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="downloadDeviceMediaFile(row.id)">下载</el-button>
                  <el-button size="small" type="danger" @click="deleteMediaRow(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <el-divider />

          <div>
            <div style="font-weight:600;margin-bottom:8px">音频</div>
            <p style="font-size:13px;color:#606266;margin:0 0 8px">
              录屏文件为视频容器，可能已含麦克风音轨；此处用于单独上传 m4a/mp3 等便于检索与归档。
            </p>
            <el-upload
              :http-request="onAudioUpload"
              :show-file-list="false"
              accept=".m4a,.mp3,.wav,.aac,.ogg,.flac"
              :disabled="audioUploading || !canMutate"
            >
              <el-button type="primary" :loading="audioUploading" :disabled="!canMutate">上传音频</el-button>
            </el-upload>
            <el-table :data="audios" border style="margin-top:12px" empty-text="暂无音频">
              <el-table-column prop="file_name" label="文件名" min-width="180" show-overflow-tooltip />
              <el-table-column label="大小" width="100">
                <template #default="{ row }">{{ formatFileSize(row.file_size) }}</template>
              </el-table-column>
              <el-table-column label="试听" min-width="300">
                <template #default="{ row }">
                  <audio :src="deviceMediaStreamUrl(row.id)" controls style="max-width:280px;height:36px" />
                </template>
              </el-table-column>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatFileDate(row.created_at) }}</template>
              </el-table-column>
              <el-table-column v-if="canMutate" label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="downloadDeviceMediaFile(row.id)">下载</el-button>
                  <el-button size="small" type="danger" @click="deleteMediaRow(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-space>
      </el-tab-pane>

      <el-tab-pane label="已安装应用" name="apps">
        <el-space wrap style="margin-bottom:12px;align-items:center">
          <el-input v-model="appFilter" placeholder="搜索包名或应用名" style="width:300px" />
          <el-button :loading="appsRefreshing" :disabled="!device?.agent_connected" @click="refreshAppsFromAgent">
            从 Agent 刷新
          </el-button>
        </el-space>
        <div v-if="device?.agent_connected" style="font-size:12px;color:#909399;margin:-4px 0 8px">
          列表含系统应用；安装/卸载后请点「从 Agent 刷新」。下载 APK 依赖系统是否允许读取安装包路径，失败时请用 ADB 或 Root 环境。
        </div>
        <el-table :data="filteredApps" border height="500">
          <el-table-column prop="app_label" label="应用名" min-width="140" show-overflow-tooltip />
          <el-table-column prop="package_name" label="包名" min-width="180" show-overflow-tooltip />
          <el-table-column label="类型" width="88">
            <template #default="{ row }">
              <el-tag v-if="row.is_system" type="info" size="small">系统</el-tag>
              <el-tag v-else type="success" size="small">用户</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="version_name" label="版本" width="120" />
          <el-table-column label="操作" width="310" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canMutate"
                size="small"
                type="primary"
                plain
                :loading="pullApkPkg === row.package_name"
                :disabled="!device?.agent_connected"
                @click="downloadApkFromDevice(row)"
              >
                下载 APK
              </el-button>
              <el-button size="small" @click="startApp(row.package_name)">启动</el-button>
              <el-button size="small" type="warning" @click="stopApp(row.package_name)">停止</el-button>
              <el-button size="small" type="danger" @click="clearApp(row.package_name)">清数据</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="设备管理" name="manage">
        <el-form :model="editForm" label-width="100px" style="max-width:500px">
          <el-form-item label="设备名称">
            <el-input v-model="editForm.name" />
          </el-form-item>
          <el-form-item label="服务端别名">
            <el-input v-model="editForm.server_alias" placeholder="可选" />
          </el-form-item>
          <el-form-item label="分组">
            <el-input v-model="editForm.group_name" placeholder="可选" />
          </el-form-item>
          <el-form-item label="Agent Token">
            <el-input v-model="editForm.agent_token" placeholder="与 Agent 应用内/扫码 JSON 中 deviceToken 一致" clearable />
            <div style="font-size:12px;color:#909399;margin-top:4px">留空并保存可清空绑定；须全局唯一</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveEdit">保存修改</el-button>
          </el-form-item>
        </el-form>
        <el-divider />
        <el-button type="danger" @click="deleteDevice">删除设备</el-button>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="recordingPlayerVisible"
      title="录屏播放"
      width="min(920px, 96vw)"
      destroy-on-close
      align-center
      @closed="recordingPlayerId = null"
    >
      <video
        v-if="recordingPlayerId != null"
        :src="recordingStreamUrl(recordingPlayerId)"
        controls
        playsinline
        class="file-hub-video"
      />
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import * as deviceApi from '@/api/device'
import * as appApi from '@/api/app'
import { useEventListenerStore } from '@/stores/eventListeners'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const device = ref(null)
const apps = ref([])
const appFilter = ref('')
const refreshing = ref(false)
const agentInfoRefreshing = ref(false)
const screenshotting = ref(false)
const speedTesting = ref(false)
const speedResult = ref(null)
const keycode = ref(3)
const inputText = ref('')
const editForm = ref({ name: '', server_alias: '', group_name: '', agent_token: '' })
const apkInstalling = ref(false)
const apkInstallAndLaunch = ref(true)
const appsRefreshing = ref(false)
const pullApkPkg = ref('')

const activeMainTab = ref(
  route.query.tab === 'files'
    ? 'files'
    : route.query.tab === 'apps'
      ? 'apps'
      : route.query.tab === 'manage'
        ? 'manage'
        : 'info'
)
const fileHub = ref({ recordings: [], media: [] })
const fileHubLoading = ref(false)
const archiveShotLoading = ref(false)
const audioUploading = ref(false)
const recordingPlayerVisible = ref(false)
const recordingPlayerId = ref(null)

watch(
  () => route.query.tab,
  (t) => {
    if (t === 'files') {
      activeMainTab.value = 'files'
      loadFileHub()
    }
    if (t === 'apps') {
      activeMainTab.value = 'apps'
      loadApps()
    }
    if (t === 'manage') {
      activeMainTab.value = 'manage'
    }
  }
)

const canMutate = computed(() => {
  const r = auth.user?.role
  if (!r) return true
  return r === 'admin' || r === 'operator'
})

const screenshots = computed(() => (fileHub.value.media || []).filter((m) => m.category === 'screenshot'))
const audios = computed(() => (fileHub.value.media || []).filter((m) => m.category === 'audio'))

const filteredApps = computed(() => {
  const q = appFilter.value.trim().toLowerCase()
  if (!q) return apps.value
  return apps.value.filter((a) => {
    const pkg = (a.package_name || '').toLowerCase()
    const label = (a.app_label || '').toLowerCase()
    return pkg.includes(q) || label.includes(q)
  })
})

const streamTok = () => localStorage.getItem('token') || ''

const recordingStreamUrl = (id) =>
  `/api/recordings/${id}/stream?token=${encodeURIComponent(streamTok())}`

const deviceMediaStreamUrl = (id) =>
  `/api/device-media/${id}/stream?token=${encodeURIComponent(streamTok())}`

const formatFileSize = (bytes) => {
  if (bytes == null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const formatFileDate = (date) => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

const onMainTabChange = (name) => {
  if (name === 'files') {
    loadFileHub()
  }
  if (name === 'apps') {
    loadApps()
  }
}

const loadFileHub = async () => {
  fileHubLoading.value = true
  try {
    const res = await deviceApi.listDeviceFileHub(route.params.id)
    const box = res.data || {}
    fileHub.value = {
      recordings: box.recordings || [],
      media: box.media || []
    }
  } catch {
    fileHub.value = { recordings: [], media: [] }
  } finally {
    fileHubLoading.value = false
  }
}

const openRecordingPlayer = (id) => {
  recordingPlayerId.value = id
  recordingPlayerVisible.value = true
}

const downloadRecordingFile = (id) => {
  window.open(`/api/recordings/${id}/download?token=${encodeURIComponent(streamTok())}`, '_blank')
}

const downloadDeviceMediaFile = (id) => {
  window.open(`/api/device-media/${id}/download?token=${encodeURIComponent(streamTok())}`, '_blank')
}

const renameRecRow = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('修改后将用于播放标题与下载文件名。', '重命名录屏', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: row.file_name || '',
      inputPlaceholder: '文件名',
      inputValidator: (v) => {
        if (!v || !String(v).trim()) return '不能为空'
        return true
      }
    })
    const name = String(value).trim()
    const res = await deviceApi.renameRecording(row.id, name)
    const saved = res?.data?.file_name ?? name
    row.file_name = saved
    ElMessage.success('已重命名')
    await loadFileHub()
  } catch (e) {
    if (e !== 'cancel' && !e?.response && e?.message) ElMessage.error(e.message)
  }
}

const deleteRecRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该录屏文件？', '提示', { type: 'warning' })
    await deviceApi.deleteRecording(row.id)
    ElMessage.success('已删除')
    await loadFileHub()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

const deleteMediaRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该文件？', '提示', { type: 'warning' })
    await deviceApi.deleteDeviceMedia(row.id)
    ElMessage.success('已删除')
    await loadFileHub()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

const archiveScreenshotToServer = async () => {
  archiveShotLoading.value = true
  const n = ElNotification({
    title: '正在截图并上传',
    message: '截图与媒体上传可能耗时较久，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const blob = await deviceApi.captureScreenshot(route.params.id)
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' })
    await deviceApi.uploadDeviceMedia(route.params.id, file, 'screenshot')
    ElMessage.success('截图已保存到服务器')
    await loadFileHub()
  } catch (e) {
    ElMessage.error(e.message || '存档失败')
  } finally {
    n.close()
    archiveShotLoading.value = false
  }
}

const onAudioUpload = async (opt) => {
  audioUploading.value = true
  const n = ElNotification({
    title: '正在上传音频',
    message: '大文件上传可能耗时较久，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    await deviceApi.uploadDeviceMedia(route.params.id, opt.file, 'audio')
    ElMessage.success('音频已上传')
    await loadFileHub()
    opt.onSuccess?.({})
  } catch (e) {
    opt.onError?.(e)
    const msg = e.response?.data?.error || e.message || '上传失败'
    ElMessage.error(msg)
  } finally {
    n.close()
    audioUploading.value = false
  }
}

const load = async () => {
  const res = await deviceApi.getDevice(route.params.id)
  device.value = res.data
  editForm.value = {
    name: res.data.name || '',
    server_alias: res.data.server_alias || '',
    group_name: res.data.group_name || '',
    agent_token: res.data.agent_token || ''
  }
}

const formatWifiSsid = (raw) => {
  if (raw == null || raw === '') return '-'
  const s = String(raw)
  if (s === '<unknown ssid>' || s === 'unknown ssid') return '（需定位权限或系统限制）'
  return s
}

const refreshInfo = async () => {
  refreshing.value = true
  try {
    const res = await deviceApi.getDeviceInfo(route.params.id)
    device.value = { ...device.value, ...res.data }
    ElMessage.success('已刷新')
  } finally {
    refreshing.value = false
  }
}

const refreshAgentInfoFromDevice = async () => {
  if (!device.value?.agent_connected) return
  agentInfoRefreshing.value = true
  const n = ElNotification({
    title: '正在从 Agent 拉取状态',
    message: '网络与设备信息上报可能需要十余秒，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const res = await deviceApi.refreshAgentDeviceInfo(route.params.id)
    device.value = res.data
    ElMessage.success('已从 Agent 更新网络与状态')
  } catch {
    // 错误文案由 http 拦截器统一提示
  } finally {
    n.close()
    agentInfoRefreshing.value = false
  }
}

const loadApps = async () => {
  const res = await deviceApi.getDeviceApps(route.params.id)
  apps.value = res.data || []
}

const refreshAppsFromAgent = async () => {
  if (!device.value?.agent_connected) {
    ElMessage.warning('需要 Agent 在线；纯 ADB 设备请依赖自动拉取或重新进入本页')
    return
  }
  appsRefreshing.value = true
  const n = ElNotification({
    title: '正在从 Agent 刷新应用列表',
    message: '枚举已安装应用（含系统应用）可能需要近一分钟，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const res = await deviceApi.refreshDeviceApps(route.params.id)
    apps.value = res.data || []
    ElMessage.success('已从 Agent 刷新应用列表')
  } catch (e) {
    const msg = e.response?.data?.error || e.message || '刷新失败'
    if (!e.response) ElMessage.error(msg)
  } finally {
    n.close()
    appsRefreshing.value = false
  }
}

const downloadApkFromDevice = async (row) => {
  if (!device.value?.agent_connected) {
    ElMessage.warning('需要 Agent 在线')
    return
  }
  pullApkPkg.value = row.package_name
  const n = ElNotification({
    title: '正在从设备导出安装包',
    message: '大应用或分包应用耗时较长，请勿关闭页面。',
    type: 'info',
    duration: 0
  })
  try {
    const { blob, filename } = await deviceApi.pullInstalledApk(route.params.id, row.package_name)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    n.close()
    pullApkPkg.value = ''
  }
}

const reboot = async () => {
  await deviceApi.rebootDevice(route.params.id)
  ElMessage.success('重启指令已发送')
}

const fmtMbps = (v) => (v != null && !Number.isNaN(v) ? `${Number(v).toFixed(2)} Mbps` : '-')
const fmtBytes = (n) => (n != null ? `${n} B` : '-')

const runSpeedTest = async () => {
  speedTesting.value = true
  speedResult.value = null
  const n = ElNotification({
    title: '测速进行中',
    message: '服务器与 Agent 之间 RTT 与吞吐测试可能需要两分钟，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const data = await deviceApi.runSpeedTest(route.params.id)
    speedResult.value = data
    if (data.error) ElMessage.warning(data.error)
    else ElMessage.success('测速完成')
  } catch (e) {
    const msg = e.response?.data?.error || e.message || '测速失败'
    ElMessage.error(msg)
  } finally {
    n.close()
    speedTesting.value = false
  }
}

/** 快捷操作：上传 APK 到服务器并提交安装到当前设备（与「应用管理」相同任务队列） */
const installApkToCurrentDevice = async (opt) => {
  const devId = Number(route.params.id)
  if (!devId) {
    opt.onError?.(new Error('无效设备'))
    return
  }
  apkInstalling.value = true
  const n = ElNotification({
    title: '正在上传并安装 APK',
    message: '上传与任务下发可能耗时较久，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const fd = new FormData()
    fd.append('file', opt.file)
    const res = await appApi.uploadApp(fd)
    const app = res?.data
    if (!app?.id) throw new Error('上传返回数据异常')
    await appApi.installApp(app.id, [devId], { start_after_install: apkInstallAndLaunch.value })
    ElMessage.success('已上传并提交安装任务，可在「应用管理」或任务列表查看进度')
    opt.onSuccess?.(res)
  } catch (e) {
    opt.onError?.(e)
    const msg = e.response?.data?.error || e.message || '安装失败'
    if (!e.response) ElMessage.error(msg)
  } finally {
    n.close()
    apkInstalling.value = false
  }
}

const screenshot = async () => {
  screenshotting.value = true
  const n = ElNotification({
    title: '正在截图',
    message: 'ADB 截图与传输可能需要数十秒，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const blob = await deviceApi.captureScreenshot(route.params.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screenshot_${route.params.id}_${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('截图已下载')
  } catch (e) {
    ElMessage.error(e.message || '截图失败')
  } finally {
    n.close()
    screenshotting.value = false
  }
}

const sendKey = async () => {
  await deviceApi.keyEvent(route.params.id, keycode.value)
  ElMessage.success('按键已发送')
}

const sendText = async () => {
  await deviceApi.inputText(route.params.id, inputText.value)
  inputText.value = ''
  ElMessage.success('文字已输入')
}

const startApp = (pkg) => deviceApi.startApp(route.params.id, pkg)
const stopApp = (pkg) => deviceApi.stopApp(route.params.id, pkg)
const clearApp = (pkg) => deviceApi.clearApp(route.params.id, pkg)

const saveEdit = async () => {
  await deviceApi.updateDevice(route.params.id, editForm.value)
  await load()
  ElMessage.success('保存成功')
}

const deleteDevice = async () => {
  await ElMessageBox.confirm('确认删除此设备？', '警告', { type: 'warning' })
  await deviceApi.deleteDevice(route.params.id)
  ElMessage.success('删除成功')
  router.push('/devices')
}

const eventListeners = useEventListenerStore()
let profileListenerId = null

onMounted(async () => {
  await load()
  loadApps()
  auth.fetchMe().catch(() => {})
  if (route.query.tab === 'files') {
    loadFileHub()
  }
  profileListenerId = eventListeners.attachProfileListener({
    sourceLabel: '设备详情',
    deviceScopeId: route.params.id,
    onEvent: () => load()
  })
})
onUnmounted(() => {
  if (profileListenerId) eventListeners.revoke(profileListenerId)
})
</script>

<style scoped>
.file-hub-video {
  width: 100%;
  max-height: 72vh;
  background: #000;
  border-radius: 4px;
  vertical-align: middle;
}

</style>
