<template>
  <div class="apk-uploader" :class="{ 'is-disabled': disabled || busy }">
    <div class="apk-uploader__head">
      <div class="apk-uploader__title">安装 APK 到本机</div>
      <div class="apk-uploader__hint">
        支持把 <code>.apk</code> 拖到下方虚线框直接上传；也可以从「APK 管理」已上传的应用中搜索选择。
      </div>
    </div>

    <div
      class="apk-drop-zone"
      :class="{ 'is-dragover': dragOver, 'is-busy': busy }"
      role="button"
      tabindex="0"
      :aria-disabled="disabled || busy"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="apk-drop-zone__icon">📦</div>
      <div class="apk-drop-zone__title">
        点击选择，或将 APK 文件拖入此处
      </div>
      <div class="apk-drop-zone__sub">
        支持 <code>.apk</code>；可一次拖入多个，依次上传
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        multiple
        hidden
        @change="onFilePick"
      />
    </div>

    <el-divider class="apk-divider">
      <span class="apk-divider__text">或从 APK 管理中选择</span>
    </el-divider>

    <div class="apk-pick">
      <el-select
        v-model="selectedAppId"
        :filterable="true"
        :clearable="true"
        :disabled="busy || !appLibrary.length"
        placeholder="搜索应用名 / 包名"
        style="width: 100%"
        @change="onPickExisting"
      >
        <el-option
          v-for="a in appLibrary"
          :key="a.id"
          :value="a.id"
          :label="`${a.name || a.package_name || '未命名'} · ${a.package_name || '-'} · v${a.version_name || '-'}`"
        >
          <div class="apk-pick__option">
            <span class="apk-pick__name">{{ a.name || a.package_name || '未命名' }}</span>
            <span class="apk-pick__meta">
              {{ a.package_name || '-' }} · v{{ a.version_name || '-' }} ·
              {{ formatSize(a.file_size) }}
            </span>
          </div>
        </el-option>
      </el-select>

      <div v-if="recentApps.length" class="apk-pick__recent">
        <span class="apk-pick__recent-label">最近上传：</span>
        <el-tag
          v-for="a in recentApps"
          :key="a.id"
          class="apk-pick__chip"
          :type="selectedAppId === a.id ? 'primary' : 'info'"
          :effect="selectedAppId === a.id ? 'dark' : 'plain'"
          :disable-transitions="true"
          @click="onPickExisting(a.id)"
        >
          {{ a.name || a.package_name || '未命名' }}
        </el-tag>
      </div>
      <div v-else-if="!appLibraryLoading && !appLibrary.length" class="apk-pick__empty">
        暂无已上传 APK，先在「APK 管理」上传一个，或直接拖入上方虚线框。
      </div>
    </div>

    <el-checkbox
      v-if="deviceId"
      v-model="startAfterInstall"
      class="apk-uploader__launch"
    >
      安装完成后启动应用
    </el-checkbox>

    <transition name="apk-progress">
      <div v-if="state.stage !== 'idle'" class="apk-progress">
        <el-progress
          :percentage="state.percent"
          :status="state.status"
          :stroke-width="14"
          :text-inside="true"
        />
        <div class="apk-progress__msg">
          <span v-if="state.stage === 'uploading'">
            <span class="apk-progress__stage">上传 APK 到服务器</span>
            <span class="apk-progress__file"> · {{ state.fileName }}</span>
          </span>
          <span v-else-if="state.stage === 'uploaded'">
            <span class="apk-progress__stage">已下发安装任务，等待 Agent 处理</span>
            <span class="apk-progress__file"> · {{ state.fileName }}</span>
          </span>
          <span v-else-if="state.stage === 'installing'">
            <span class="apk-progress__stage">{{ state.liveMessage || agentPhaseText(state.phase) }}</span>
            <span class="apk-progress__file"> · {{ state.fileName }}</span>
          </span>
          <span v-else-if="state.stage === 'done'" class="apk-progress__msg--ok">
            <span class="apk-progress__stage">{{ state.liveMessage || '安装任务已完成' }}</span>
            <span class="apk-progress__file"> · {{ state.fileName }}</span>
          </span>
          <span v-else-if="state.stage === 'error'" class="apk-progress__msg--err">
            <span class="apk-progress__stage">{{ state.errorMessage || '失败' }}</span>
            <span class="apk-progress__file"> · {{ state.fileName }}</span>
          </span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as appApi from '@/api/app'
import { createInstallTaskStomp } from '@/utils/installTaskStomp'

const props = defineProps({
  deviceId: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['uploaded', 'installed', 'error', 'pick-existing'])

const fileInput = ref(null)
const dragOver = ref(false)
const dragDepth = ref(0)

const appLibrary = ref([])
const appLibraryLoading = ref(false)
const selectedAppId = ref(null)
const startAfterInstall = ref(true)

const state = reactive({
  stage: 'idle', // idle | uploading | uploaded | installing | done | error
  percent: 0,
  status: '',
  fileName: '',
  errorMessage: '',
  // 当前由 STOMP 推送过来的阶段与文本（Agent 上行 install_task_progress / result）
  phase: '',
  liveMessage: ''
})

const busy = computed(
  () =>
    state.stage === 'uploading' ||
    state.stage === 'uploaded' ||
    state.stage === 'installing'
)
const recentApps = computed(() => appLibrary.value.slice(0, 5))

// 当前订阅的 taskId 与 STOMP 客户端
const activeTaskId = ref(null)
const stompClient = ref(null)
const getAuthToken = () => {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

function resetState() {
  state.stage = 'idle'
  state.percent = 0
  state.status = ''
  state.fileName = ''
  state.errorMessage = ''
  state.phase = ''
  state.liveMessage = ''
}

function setError(msg, fileName = '') {
  state.stage = 'error'
  state.status = 'exception'
  state.percent = Math.max(state.percent, 5)
  state.fileName = fileName || state.fileName
  state.errorMessage = msg
}

// 把服务端的 status / phase 字段映射为中文提示
function agentPhaseText(phase) {
  switch (phase) {
    case 'running':
      return '任务派发到 Agent…'
    case 'downloading':
      return 'Agent 正在下载 APK…'
    case 'opening':
      return '正在拉起系统安装界面'
    case 'done':
    case 'success':
      return '安装任务已完成'
    case 'failed':
      return '安装失败'
    default:
      return '正在处理安装任务…'
  }
}

function ensureStompForTask(taskId) {
  if (taskId == null) return
  if (activeTaskId.value === taskId && stompClient.value) return
  teardownStomp()
  activeTaskId.value = taskId
  const client = createInstallTaskStomp(
    (evt) => {
      handleInstallProgressEvent(evt)
    },
    getAuthToken,
    { taskId }
  )
  client.connect()
  stompClient.value = client
}

function teardownStomp() {
  try {
    stompClient.value?.disconnect()
  } catch (_) {
    /* noop */
  }
  stompClient.value = null
  activeTaskId.value = null
}

function handleInstallProgressEvent(evt) {
  if (!evt || typeof evt !== 'object') return
  const phase = evt.phase || ''
  const p = Number(evt.progress)
  if (Number.isFinite(p)) {
    // 取推送值的最大值，避免旧值回退
    if (p > state.percent || state.stage === 'idle') state.percent = Math.max(0, Math.min(100, p))
  }
  if (phase) state.phase = phase
  if (typeof evt.message === 'string' && evt.message) state.liveMessage = evt.message

  const isError = Boolean(evt.error)
  // worker 写入 status: success/failed 时也会带同样 phase=done/failed
  if (phase === 'done' || phase === 'success' || (!isError && evt.status === 'success')) {
    state.stage = 'done'
    state.percent = 100
    state.status = 'success'
    state.liveMessage = state.liveMessage || '安装任务已完成'
    teardownStomp()
    return
  }
  if (phase === 'failed' || isError || evt.status === 'failed') {
    setError(state.liveMessage || '安装失败')
    teardownStomp()
    return
  }
  if (phase && state.stage === 'uploaded') state.stage = 'installing'
}

const loadAppLibrary = async () => {
  appLibraryLoading.value = true
  try {
    const res = await appApi.getApps()
    const list = Array.isArray(res?.data) ? res.data.slice() : []
    list.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime()
      const tb = new Date(b.created_at || 0).getTime()
      return tb - ta
    })
    appLibrary.value = list
  } catch (e) {
    console.warn('[ApkUploader] load app library failed', e)
    appLibrary.value = []
  } finally {
    appLibraryLoading.value = false
  }
}

const openPicker = () => {
  if (props.disabled || busy.value) return
  fileInput.value?.click()
}

const onDragEnter = (e) => {
  if (props.disabled || busy.value) return
  dragDepth.value += 1
  dragOver.value = true
}
const onDragOver = (e) => {
  if (props.disabled || busy.value) return
  e.dataTransfer.dropEffect = 'copy'
  dragOver.value = true
}
const onDragLeave = (e) => {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) dragOver.value = false
}
const onDrop = (e) => {
  dragDepth.value = 0
  dragOver.value = false
  if (props.disabled || busy.value) return
  const files = Array.from(e.dataTransfer?.files || []).filter(isApkFile)
  if (!files.length) {
    ElMessage.warning('请拖入 .apk 文件')
    return
  }
  files.forEach((f) => uploadAndInstall(f))
}

const onFilePick = (e) => {
  const files = Array.from(e.target.files || []).filter(isApkFile)
  e.target.value = ''
  if (!files.length) return
  files.forEach((f) => uploadAndInstall(f))
}

function isApkFile(file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.apk')) return true
  return file.type === 'application/vnd.android.package-archive'
}

async function installFromApp(app) {
  state.stage = 'uploaded'
  state.percent = 50
  state.fileName = app.name || app.package_name
  state.phase = ''
  state.liveMessage = ''
  let taskId = null
  try {
    const res = await appApi.installApp(
      app.id,
      [Number(props.deviceId)],
      { start_after_install: startAfterInstall.value }
    )
    // axios -> res.data 是 { data: [task, ...] }，从中提取首个 taskId
    const tasks = res?.data?.data
    if (Array.isArray(tasks) && tasks.length) taskId = tasks[0].id
    state.stage = 'installing'
    state.percent = Math.max(state.percent, 55)
    emit('installed', app)
    if (taskId != null) {
      ensureStompForTask(taskId)
    } else {
      // 后端未给出 taskId（理论不应发生）：降级到固定进度条
      finishFallback()
    }
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || '安装失败'
    setError(msg)
    emit('error', { error: e, app })
    if (!e?.response) ElMessage.error(msg)
  }
}

async function uploadAndInstall(file) {
  if (!file) return
  resetState()
  state.stage = 'uploading'
  state.fileName = file.name
  state.percent = 0
  state.status = ''
  let uploadedApp = null
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await appApi.uploadApp(fd, (pct) => {
      // 上传占进度条一半：0 - 50
      state.percent = Math.min(50, Math.round((pct || 0) * 0.5))
    })
    uploadedApp = res?.data
    if (!uploadedApp?.id) throw new Error('上传返回数据异常')
    emit('uploaded', uploadedApp)
    await loadAppLibrary()
    selectedAppId.value = uploadedApp.id
    state.fileName = uploadedApp.name || uploadedApp.package_name || file.name

    if (props.deviceId) {
      state.stage = 'uploaded'
      state.percent = 50
      await installFromApp(uploadedApp)
    } else {
      state.stage = 'done'
      state.percent = 100
      state.status = 'success'
      ElMessage.success(`已上传：${state.fileName}`)
    }
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || '上传/安装失败'
    setError(msg)
    emit('error', { error: e, app: uploadedApp })
    if (!e?.response) ElMessage.error(msg)
  }
}

async function onPickExisting(id) {
  if (id == null) return
  const app = appLibrary.value.find((a) => a.id === id)
  if (!app) {
    setError('未找到该 APK，请刷新后重试')
    return
  }
  if (!props.deviceId) {
    emit('pick-existing', app)
    ElMessage.info('已选择，可直接安装到目标设备')
    return
  }
  resetState()
  state.stage = 'uploaded'
  state.percent = 50
  state.fileName = app.name || app.package_name
  await installFromApp(app)
}

// 当 STOMP 无法建立或未返回 taskId 时使用的兜底进度
function finishFallback() {
  let pct = state.percent
  const tick = () => {
    if (state.stage !== 'installing') return
    pct = Math.min(99, pct + 1)
    state.percent = pct
    if (pct >= 99) {
      state.stage = 'done'
      state.status = 'success'
      state.percent = 100
      state.liveMessage = state.liveMessage || '安装任务已提交'
      return
    }
    setTimeout(tick, 120)
  }
  setTimeout(tick, 120)
}

function formatSize(n) {
  if (!n) return '-'
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

watch(
  () => props.disabled,
  (v) => {
    if (v) {
      dragOver.value = false
      teardownStomp()
    }
  }
)

onMounted(loadAppLibrary)
onBeforeUnmount(() => teardownStomp())
</script>

<style scoped>
.apk-uploader {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
}
.apk-uploader.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
.apk-uploader__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.apk-uploader__title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.apk-uploader__hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.apk-uploader__hint code,
.apk-drop-zone__sub code {
  background: #f5f7fa;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 12px;
}
.apk-uploader__launch {
  margin: 0;
}

.apk-drop-zone {
  position: relative;
  border: 2px dashed #dcdfe6;
  border-radius: 10px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  background: #fafbfc;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
  user-select: none;
}
.apk-drop-zone:hover,
.apk-drop-zone:focus-visible {
  border-color: #409eff;
  background: #f0f7ff;
  outline: none;
}
.apk-drop-zone.is-dragover {
  border-color: #409eff;
  background: #ecf5ff;
  transform: translateY(-1px);
}
.apk-drop-zone.is-busy {
  cursor: not-allowed;
  background: #f5f7fa;
  border-color: #c0c4cc;
}
.apk-drop-zone__icon {
  font-size: 36px;
  margin-bottom: 6px;
  line-height: 1;
}
.apk-drop-zone__title {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}
.apk-drop-zone__sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.apk-divider {
  margin: 4px 0;
}
.apk-divider__text {
  font-size: 12px;
  color: #909399;
  letter-spacing: 0.5px;
}

.apk-pick {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.apk-pick__option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}
.apk-pick__name {
  font-weight: 500;
  color: #303133;
}
.apk-pick__meta {
  font-size: 12px;
  color: #909399;
}
.apk-pick__recent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
}
.apk-pick__recent-label {
  color: #909399;
}
.apk-pick__chip {
  cursor: pointer;
}
.apk-pick__empty {
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
}

.apk-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.apk-progress__msg {
  font-size: 12px;
  color: #606266;
}
.apk-progress__stage {
  font-weight: 500;
}
.apk-progress__file {
  color: #909399;
  word-break: break-all;
}
.apk-progress__msg--err {
  color: #f56c6c;
}
.apk-progress__msg--err .apk-progress__file {
  color: #f89898;
}
.apk-progress__msg--ok {
  color: #67c23a;
}
.apk-progress__msg--ok .apk-progress__file {
  color: #a0d68f;
}

.apk-progress-enter-active,
.apk-progress-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.apk-progress-enter-from,
.apk-progress-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@media (max-width: 640px) {
  .apk-uploader {
    padding: 12px;
  }
  .apk-drop-zone {
    padding: 22px 14px;
  }
}
</style>