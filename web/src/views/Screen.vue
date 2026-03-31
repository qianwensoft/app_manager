<template>
  <div class="screen-page-root">
    <div class="screen-page-main-col">
      <div v-show="!isNativeFullscreen" class="screen-page-toolbar">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
          <el-select
            v-if="!shareMode"
            v-model="deviceId"
            placeholder="选择设备"
            style="width:200px"
            @change="onDeviceChange"
          >
            <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
          </el-select>
          <span v-else style="font-size:14px;color:#303133">
            共享查看：<strong>{{ shareClaims?.device_label || '设备' }}</strong>
          </span>
          <el-checkbox
            v-if="!shareMode && auth.token && deviceId"
            v-model="screenDropInstallAndLaunch"
            style="margin-left:4px"
          >
            拖入 APK 安装后启动
          </el-checkbox>
          <el-button
            v-if="!shareMode && auth.token && deviceId"
            type="success"
            plain
            @click="openShareDialog"
          >
            生成分享链接
          </el-button>
          <el-button
            v-if="deviceId && status !== 'disconnected' && canShareStop"
            type="warning"
            plain
            @click="disconnectViewer"
          >
            断开连接
          </el-button>
        <el-tag :type="statusType">{{ statusText }}</el-tag>
          <el-tag v-if="status === 'connected'" type="success">端到端: {{ latency || '—' }}ms</el-tag>
          <el-tag v-if="status === 'connected'" type="info">到服务器: {{ latencyServer || '—' }}ms</el-tag>
          <el-button type="primary" plain @click="toggleNativeFullscreen">
            <el-icon class="screen-btn-icon"><FullScreen /></el-icon>
            全屏画面
          </el-button>
      </div>
        <div
          v-if="!shareMode && screenDevice && deviceId"
          style="font-size:12px;color:#606266;margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"
        >
          <span style="font-weight:500">Agent 端状态</span>
          <el-tag size="small" :type="screenDevice.agent_connected ? 'success' : 'info'">
            {{ screenDevice.agent_connected ? 'Agent 在线' : 'Agent 离线' }}
          </el-tag>
          <el-tag size="small" :type="screenDevice.allow_remote_screen ? 'success' : 'warning'">
            {{ screenDevice.allow_remote_screen ? '端上已允许远程屏幕' : '端上未允许远程屏幕' }}
          </el-tag>
          <el-tag size="small" :type="streamStatusTagType">{{ streamStatusText }}</el-tag>
        </div>
      </div>

      <!-- 浏览器全屏目标：画面 + 录制边框 + 右侧快速栏 -->
      <div ref="fullscreenTargetEl" class="screen-fullscreen-target">
        <div v-if="isNativeFullscreen" class="screen-fs-topbar">
          <el-button type="primary" size="small" @click="toggleNativeFullscreen">
            <el-icon class="screen-btn-icon"><Close /></el-icon>
            退出全屏
          </el-button>
          <el-tag v-if="status === 'connected'" size="small" type="success">端到端 {{ latency || '—' }}ms</el-tag>
          <el-tag v-if="status === 'connected'" size="small" type="info">到服务器 {{ latencyServer || '—' }}ms</el-tag>
          <span v-if="recording" class="screen-fs-topbar__rec">● 录制中 {{ recordingTime }}s</span>
          <span class="screen-fs-topbar__hint">右侧「操作」展开录屏与配置</span>
        </div>

        <div class="screen-stage-row">
          <div
            ref="videoWrap"
            class="video-stage"
            :class="{ 'recording-border': recording, 'video-stage--pressing': !!pressPreview }"
            @drop="handleDrop"
            @dragover="handleDragOver"
          >
            <img
              ref="screenImg"
              class="screen-video"
              alt=""
              draggable="false"
              @load="onScreenImgLoad"
              @pointerdown.prevent="handlePointerDown"
              @pointerup.prevent="handlePointerUp"
              @pointercancel.prevent="handlePointerCancel"
              @lostpointercapture="handleLostPointerCapture"
              @wheel.prevent.stop="handleScreenWheel"
        />
        <div
          v-for="effect in clickEffects"
          :key="effect.id"
          class="click-effect"
          :style="{ left: effect.x + 'px', top: effect.y + 'px' }"
        />
            <div
              v-if="pressPreview"
              class="press-preview-dot"
              :style="{ left: pressPreview.x + 'px', top: pressPreview.y + 'px' }"
            />
            <div
              v-if="uploading"
              style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:20px;border-radius:8px"
            >
          上传中...
      </div>
    </div>

          <aside v-if="!shareMode" class="screen-quick-rail" aria-label="快速操作">
            <div class="screen-quick-panel" :class="{ 'screen-quick-panel--open': quickPanelOpen }">
              <div class="screen-quick-panel__scroll">
      <el-card shadow="never">
        <template #header>
          <div style="font-weight:600">操作</div>
        </template>
        <div style="display:flex;flex-direction:column;gap:12px">
          <el-checkbox v-model="recordAudio">录制音频</el-checkbox>
          <el-button :type="recording ? 'danger' : 'primary'" @click="toggleRecording" style="width:100%">
            {{ recording ? '停止录屏' : '开始录屏' }}
          </el-button>
                    <el-button :loading="screenshotLoading" :disabled="!deviceId" @click="saveAdbScreenshot" style="width:100%">
                      截图
                    </el-button>
          <el-tag v-if="recording" type="danger" effect="dark" style="width:100%;justify-content:center">
            录制中 {{ recordingTime }}s
          </el-tag>
                    <div v-if="recordingProgressHint" style="font-size:12px;color:#606266;line-height:1.5;margin-top:8px">
                      {{ recordingProgressHint }}
                    </div>
                    <el-alert
                      v-if="recordingDownload"
                      type="success"
                      :closable="true"
                      show-icon
                      style="margin-top:12px"
                      @close="dismissRecordingDownload"
                    >
                      <template #title>录屏已保存到服务器</template>
                      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                        <el-button size="small" type="primary" @click="openRecordingPlayer(recordingDownload.id)">
                          在线播放
                        </el-button>
                        <el-link type="primary" :underline="false" @click="downloadRecording(recordingDownload.id)">
                          {{ recordingDownload.file_name || ('下载 #' + recordingDownload.id) }}
                        </el-link>
                        <el-button size="small" @click="promptRenameRecording(recordingDownload.id, recordingDownload.file_name)">
                          重命名
                        </el-button>
                      </div>
                    </el-alert>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div style="font-weight:600">配置</div>
        </template>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="font-size:13px;color:#606266;margin-bottom:8px">点击效果</div>
            <el-checkbox v-model="showClickEffect">Web端点击效果</el-checkbox>
            <el-checkbox v-model="showRemoteClickEffect" @change="toggleRemoteEffect">Android端点击效果</el-checkbox>
          </div>
          <el-divider style="margin:0" />
          <div>
            <div style="font-size:13px;color:#606266;margin-bottom:8px">交互执行</div>
            <el-checkbox v-model="executeTouch">执行触摸操作</el-checkbox>
                      <el-checkbox v-model="wheelScrollRemote" :disabled="!executeTouch">
                        鼠标在画面上时，滚轮/触控板映射为滑屏（竖向与横向）
                      </el-checkbox>
          </div>
        </div>
      </el-card>

                <el-card shadow="never">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">录屏文件</span>
            <el-button size="small" @click="loadRecordings" :icon="'Refresh'" circle />
          </div>
        </template>
                  <div class="screen-quick-recordings">
          <div v-if="recordings.length === 0" style="text-align:center;color:#909399;padding:20px">暂无录屏</div>
          <div v-for="rec in recordings" :key="rec.id" style="padding:8px;border-bottom:1px solid #eee">
            <div style="font-size:13px;margin-bottom:4px">{{ rec.file_name }}</div>
            <div style="font-size:12px;color:#909399;margin-bottom:8px">
              {{ formatSize(rec.file_size) }} · {{ formatDate(rec.created_at) }}
            </div>
                      <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <el-button size="small" type="primary" plain @click="openRecordingPlayer(rec.id)">播放</el-button>
              <el-button size="small" @click="downloadRecording(rec.id)">下载</el-button>
              <el-button size="small" @click="promptRenameRecording(rec.id, rec.file_name)">重命名</el-button>
              <el-button size="small" type="danger" @click="deleteRecording(rec.id)">删除</el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>
            </div>
            <button
              type="button"
              class="screen-quick-tab"
              :class="{ 'screen-quick-tab--open': quickPanelOpen }"
              :title="quickPanelOpen ? '收起操作栏' : '展开快速操作'"
              @click="quickPanelOpen = !quickPanelOpen"
            >
              <span class="screen-quick-tab__chev">{{ quickPanelOpen ? '›' : '‹' }}</span>
              <span class="screen-quick-tab__text">操作</span>
            </button>
          </aside>
        </div>
      </div>
    </div>

    <el-dialog v-model="shareDialogVisible" title="屏幕分享链接" width="520px" destroy-on-close>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:13px;color:#606266;margin-bottom:8px">可操作能力</div>
          <div style="margin-bottom:8px">
            <el-tag type="info" size="small">查看画面（始终包含）</el-tag>
          </div>
          <el-checkbox v-model="shareForm.touch">远程触摸 / 滑动 / 滚轮</el-checkbox>
          <el-checkbox v-model="shareForm.stop">停止投屏（释放手机录屏授权）</el-checkbox>
        </div>
        <div>
          <div style="font-size:13px;color:#606266;margin-bottom:8px">链接有效期</div>
          <el-date-picker
            v-model="shareForm.expires_at"
            type="datetime"
            placeholder="不填则长期有效"
            style="width:100%"
            clearable
          />
        </div>
        <el-button type="primary" :loading="creatingShare" :disabled="!deviceId" @click="submitCreateShare">
          生成链接
        </el-button>
        <el-input
          v-if="lastCreatedShareUrl"
          type="textarea"
          :rows="2"
          readonly
          :model-value="lastCreatedShareUrl"
        />
        <div v-if="lastCreatedShareUrl" style="display:flex;gap:8px">
          <el-button size="small" @click="copyShareUrl">复制完整链接</el-button>
        </div>
        <el-divider v-if="shareLinks.length">已创建的链接（未过期）</el-divider>
        <div v-for="row in shareLinks" :key="row.id" style="font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee">
          <span style="color:#606266">{{ formatShareScopes(row.scopes) }} · {{ formatShareExpiry(row.expires_at) }}</span>
          <el-button size="small" type="danger" link @click="revokeShareRow(row.id)">撤销</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="recordingPlayerVisible"
      :title="recordingPlayerTitle"
      width="min(920px, 96vw)"
      destroy-on-close
      align-center
      @closed="onRecordingPlayerClosed"
    >
      <video
        v-if="recordingPlayerId != null"
        ref="recordingPlayerRef"
        :src="recordingStreamUrl(recordingPlayerId)"
        controls
        playsinline
        preload="metadata"
        class="recording-playback-video"
      />
    </el-dialog>
  </div>
</template>

<style scoped>
.recording-playback-video {
  width: 100%;
  max-height: 72vh;
  background: #000;
  border-radius: 4px;
  vertical-align: middle;
}

.recording-border {
  border: 3px solid #f56c6c;
  border-radius: 4px;
  box-shadow: 0 0 20px rgba(245, 108, 108, 0.5);
  animation: recording-pulse 2s infinite;
}

@keyframes recording-pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(245, 108, 108, 0.5);
  }
  50% {
    box-shadow: 0 0 30px rgba(245, 108, 108, 0.8);
  }
}

.screen-btn-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.screen-page-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  box-sizing: border-box;
}

.screen-page-main-col {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.screen-page-toolbar {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.screen-fullscreen-target {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #000;
}

.screen-fullscreen-target:fullscreen,
.screen-fullscreen-target:-webkit-full-screen {
  width: 100%;
  height: 100%;
}

.screen-fs-topbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  z-index: 20;
}

.screen-fs-topbar__rec {
  color: #f89898;
  font-size: 13px;
  font-weight: 500;
}

.screen-fs-topbar__hint {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.85;
}

.screen-stage-row {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
  overflow: hidden;
}

.screen-quick-rail {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  z-index: 15;
  /* 与画面区同色，避免全屏时接缝/亚像素露出底层白底 */
  background: #000;
}

.screen-quick-panel {
  position: absolute;
  right: 40px;
  top: 0;
  bottom: 0;
  width: min(320px, calc(100vw - 48px));
  max-width: 360px;
  background: #f5f7fa;
  /* 收起时多移一段并去掉阴影，避免白底/卡片边在 tab 左侧露一条 */
  transform: translateX(calc(100% + 24px));
  opacity: 0;
  box-shadow: none;
  transition:
    transform 0.22s ease,
    opacity 0.18s ease,
    box-shadow 0.18s ease;
  pointer-events: none;
}

.screen-quick-panel--open {
  transform: translateX(0);
  opacity: 1;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.screen-quick-panel__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.screen-quick-recordings {
  max-height: min(40vh, 320px);
  overflow-y: auto;
}

.screen-quick-tab {
  width: 40px;
  flex-shrink: 0;
  border: none;
  border-left: 1px solid #444;
  background: rgba(42, 42, 42, 0.95);
  color: #e5eaf3;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 0;
  font-size: 13px;
  transition: background 0.15s ease;
}

.screen-quick-tab:hover {
  background: rgba(60, 60, 60, 0.98);
}

.screen-quick-tab--open {
  background: rgba(30, 30, 30, 0.98);
}

.screen-quick-tab__chev {
  font-size: 16px;
  line-height: 1;
  opacity: 0.9;
}

.screen-quick-tab__text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0.12em;
}

.video-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid #ddd;
  background: #000;
}

.video-stage--pressing {
  cursor: grabbing;
}

.press-preview-dot {
  position: absolute;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border-radius: 50%;
  background: rgba(64, 158, 255, 0.4);
  border: 2px solid #409eff;
  pointer-events: none;
  z-index: 6;
}

.screen-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center center;
  cursor: pointer;
  display: block;
  box-sizing: border-box;
  border: none;
  vertical-align: top;
  touch-action: none;
  user-select: none;
  /* 便于接收滚轮；由脚本 preventDefault 避免页面跟着滚 */
  overscroll-behavior: contain;
}

.click-effect {
  position: absolute;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border: 2px solid #409eff;
  border-radius: 50%;
  pointer-events: none;
  animation: ripple 0.6s ease-out;
}

.video-stage--pressing .screen-video {
  outline: 1px solid rgba(64, 158, 255, 0.35);
  outline-offset: -1px;
}

.press-preview-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border: 2px solid rgba(64, 158, 255, 0.95);
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
  pointer-events: none;
  z-index: 2;
}

@keyframes ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { FullScreen, Close } from '@element-plus/icons-vue'
import { Client } from '@stomp/stompjs'
import * as deviceApi from '@/api/device'
import { createDeviceProfileStomp } from '@/utils/deviceProfileStomp'
import { WS_BASE } from '@/utils/ws'

const route = useRoute()
const auth = useAuthStore()
const devices = ref([])
const deviceId = ref(route.query.device != null ? String(route.query.device) : '')
const shareToken = computed(() => String(route.query.share || '').trim())
/** 独立分享页 /share/screen 或带 ?share= 的查询均视为分享模式（免登录） */
const shareMode = computed(() => route.path.startsWith('/share/') || !!shareToken.value)
const shareClaims = ref(null)
const shareDialogVisible = ref(false)
const shareForm = ref({ touch: true, stop: false, expires_at: null })
const shareLinks = ref([])
const creatingShare = ref(false)
const lastCreatedShareUrl = ref('')
/** 当前选中设备的档案（含 Agent 在线、端上是否允许远程屏幕） */
const screenDevice = ref(null)
/** 本次 WebSocket 会话内是否已收到过画面帧 */
const receivedFrame = ref(false)
const screenImg = ref(null)
const videoWrap = ref(null)
/** 纳入 requestFullscreen 的容器（画面 + 录制边框 + 右侧快速栏） */
const fullscreenTargetEl = ref(null)
const isNativeFullscreen = ref(false)
/** 右侧快速操作面板默认收起 */
const quickPanelOpen = ref(false)
/** 屏幕页拖入 APK 安装任务：是否在安装成功后尝试启动应用 */
const screenDropInstallAndLaunch = ref(true)
const uploading = ref(false)
const screenshotLoading = ref(false)
const deviceResolution = ref({ width: 1080, height: 1920 })
const realDeviceResolution = ref(null)
/** Agent 上报的编码流像素，与 touch 可能不同（如半分辨率）；用于 object-fit 映射比仅用 videoWidth 更稳 */
const streamResolution = ref(null)
const clickEffects = ref([])
const showClickEffect = ref(true)
const showRemoteClickEffect = ref(true)
const recordings = ref([])
const recordingPlayerVisible = ref(false)
const recordingPlayerId = ref(null)
const recordingPlayerRef = ref(null)
const executeTouch = ref(true)
/** 滚轮/触控板在画面上合成为一次 swipe，模拟列表/页面滑动 */
const wheelScrollRemote = ref(true)
const recordAudio = ref(false)
const recording = ref(false)
const recordingTime = ref(0)
/** 停止录屏后轮询到的新文件，用于展示下载链接 */
const recordingDownload = ref(null)
/** STOMP 录屏业务进度文案（服务器 ↔ Agent） */
const recordingProgressHint = ref('')
const fps = ref(0)
const latency = ref(0)
/** 浏览器 ↔ 服务器 RTT（client_ping，不经 Agent） */
const latencyServer = ref(0)
/** 按下未抬起时的触点提示（与「Web 端点击效果」独立，始终可显示） */
const pressPreview = ref(null)
let touchStartPos = null
let effectIdCounter = 0
let recordingTimer = null
let frameCount = 0
let fpsTimer = null
let pingTimer = null
let pingStartTime = 0
/** Pointer Events：与 touchStartPos 对应的 pointerId，配合 setPointerCapture 在拖出画面外仍能收到 pointerup */
let activePointerId = null

/** 待贴到 img 的最新帧 Blob URL；配合 rAF 合并积压帧 */
let pendingFrameBlobUrl = null
let rafScheduled = false

function cleanupScreenFrameUrls() {
  if (pendingFrameBlobUrl) {
    try {
      URL.revokeObjectURL(pendingFrameBlobUrl)
    } catch (_) { /* noop */ }
    pendingFrameBlobUrl = null
  }
  rafScheduled = false
  const el = screenImg.value
  if (el?.dataset?.blobUrl) {
    try {
      URL.revokeObjectURL(el.dataset.blobUrl)
    } catch (_) { /* noop */ }
    delete el.dataset.blobUrl
  }
}

function flushFrameToImg() {
  rafScheduled = false
  if (!screenImg.value || !pendingFrameBlobUrl) return
  const url = pendingFrameBlobUrl
  pendingFrameBlobUrl = null
  const prev = screenImg.value.dataset.blobUrl
  if (prev) {
    try {
      URL.revokeObjectURL(prev)
    } catch (_) { /* noop */ }
  }
  screenImg.value.dataset.blobUrl = url
  screenImg.value.src = url
}

function applyFrameFromBlob(blob) {
  if (pendingFrameBlobUrl) {
    try {
      URL.revokeObjectURL(pendingFrameBlobUrl)
    } catch (_) { /* noop */ }
  }
  pendingFrameBlobUrl = URL.createObjectURL(blob)
  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(flushFrameToImg)
  }
}

function applyLegacyBase64Jpeg(b64) {
  try {
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    applyFrameFromBlob(new Blob([u8], { type: 'image/jpeg' }))
  } catch (_) { /* noop */ }
}

function handleScreenBinaryFrame(u8) {
  if (u8.length < 6 || u8[0] !== 1 || !screenImg.value) return
  const w = (u8[1] << 8) | u8[2]
  const h = (u8[3] << 8) | u8[4]
  if (w > 0 && h > 0) {
    streamResolution.value = { width: w, height: h }
  }
  const blob = new Blob([u8.subarray(5)], { type: 'image/jpeg' })
  applyFrameFromBlob(blob)
  status.value = 'connected'
  receivedFrame.value = true
  frameCount++
}

let wheelFlushTimer = null
const wheelAccumState = { dx: 0, dy: 0, lastClientX: 0, lastClientY: 0 }

function resetWheelScrollState() {
  if (wheelFlushTimer) {
    clearTimeout(wheelFlushTimer)
    wheelFlushTimer = null
  }
  wheelAccumState.dx = 0
  wheelAccumState.dy = 0
}

// status: 'disconnected' | 'connecting' | 'connected'
const status = ref('disconnected')
const statusType = computed(() => ({ disconnected: 'info', connecting: 'warning', connected: 'success' }[status.value]))
const statusText = computed(() => ({ disconnected: '未连接', connecting: '连接中…', connected: '已连接' }[status.value]))

const streamStatusText = computed(() => {
  if (status.value === 'disconnected') return 'Web 未连接'
  if (!receivedFrame.value) {
    return status.value === 'connecting'
      ? '投屏：等待首帧（若首次需先在手机授权录屏）'
      : '投屏：等待画面…'
  }
  return '投屏：画面传输中'
})

const streamStatusTagType = computed(() => {
  if (status.value === 'disconnected') return 'info'
  if (!receivedFrame.value) return 'warning'
  return 'success'
})

function shareHas(scope) {
  if (!shareMode.value) return true
  const s = shareClaims.value?.scopes
  return Array.isArray(s) && s.includes(scope)
}

const canShareStop = computed(() => {
  if (!shareMode.value) return true
  const s = shareClaims.value?.scopes
  return Array.isArray(s) && s.includes('screen:stop')
})

const recordingPlayerTitle = computed(() => {
  const id = recordingPlayerId.value
  if (id == null) return '录屏播放'
  const rec = recordings.value.find((r) => r.id === id)
  return rec ? `播放：${rec.file_name}` : `录屏 #${id}`
})

let ws = null
let stompClient = null

/**
 * 是否可对当前设备使用「无 WebSocket 时回退 ADB 点击」。
 * 纯 Agent 设备 serial 为 agent- 前缀，服务端无 ADB，误走 /adb/input 会 500。
 */
function deviceUsableForAdbTouch() {
  const d = screenDevice.value || devices.value.find((x) => String(x.id) === String(deviceId.value))
  const s = d?.serial
  if (!s || String(s).startsWith('agent-')) return false
  return true
}

function primeResolutionFromDeviceList() {
  const d = devices.value.find((x) => String(x.id) === String(deviceId.value))
  if (!d?.resolution) return
  const [w, h] = d.resolution.split('x').map(Number)
  if (w > 0 && h > 0) {
    deviceResolution.value = { width: w, height: h }
    realDeviceResolution.value = { width: w, height: h }
  }
}

function disconnectRecordingStomp() {
  try {
    stompClient?.deactivate()
  } catch (_) { /* noop */ }
  stompClient = null
}

function onRecordingStompMessage(p) {
  if (!p || p.type !== 'recording_progress') return
  if (String(p.device_id) !== String(deviceId.value)) return
  switch (p.phase) {
    case 'server_recording_prepare':
      recordingProgressHint.value = '服务器录屏准备中…'
      break
    case 'server_recording_started':
      recordingProgressHint.value = '服务器正在缓存画面帧'
      break
    case 'server_recording_stop':
      recordingProgressHint.value = '正在停止录屏并编码…'
      break
    case 'server_encoding':
      recordingProgressHint.value = '正在将帧序列编码为 MP4…'
      break
    case 'start_command_sent':
      recordingProgressHint.value = '已下发开始录屏指令'
      break
    case 'stop_command_sent':
      recordingProgressHint.value = '已下发停止录屏，等待设备上传…'
      break
    case 'uploading':
      recordingProgressHint.value = '正在接收录屏文件…'
      break
    case 'saved':
      recordingProgressHint.value = ''
      if (p.recording) {
        recordingDownload.value = {
          id: p.recording.id,
          file_name: p.recording.file_name
        }
        loadRecordings()
        ElMessage.success('录屏已保存到服务器')
      }
      break
    case 'failed':
      recordingProgressHint.value = ''
      ElMessage.error(p.error || '录屏处理失败')
      break
    default:
      break
  }
}

function connectRecordingStomp() {
  disconnectRecordingStomp()
  if (!deviceId.value || !auth.token || shareMode.value) return
  const client = new Client({
    brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(auth.token)}`,
    reconnectDelay: 5000,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    onConnect: () => {
      client.subscribe(`/topic/device/${deviceId.value}/recording`, (message) => {
        try {
          onRecordingStompMessage(JSON.parse(message.body))
        } catch (e) {
          console.warn('STOMP recording message parse', e)
        }
      })
    },
    onStompError: (frame) => {
      console.warn('STOMP broker error', frame.headers?.message, frame.body)
    },
    onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
  })
  client.activate()
  stompClient = client
}

async function loadScreenDevice() {
  if (!deviceId.value) {
    screenDevice.value = null
    return
  }
  try {
    const res = await deviceApi.getDevice(deviceId.value)
    screenDevice.value = res.data ?? res ?? null
  } catch {
    screenDevice.value = null
  }
}

function onDeviceChange() {
  loadScreenDevice()
  connect()
}

async function loadShareClaims() {
  if (!deviceId.value || !shareToken.value) return
  try {
    shareClaims.value = await deviceApi.getScreenShareClaims(deviceId.value, shareToken.value)
  } catch {
    shareClaims.value = { valid: false }
  }
}

async function openShareDialog() {
  if (!deviceId.value) return
  lastCreatedShareUrl.value = ''
  shareForm.value = { touch: true, stop: false, expires_at: null }
  shareDialogVisible.value = true
  try {
    const res = await deviceApi.listScreenShares(deviceId.value)
    shareLinks.value = res.data || []
  } catch {
    shareLinks.value = []
  }
}

async function submitCreateShare() {
  if (!deviceId.value) return
  const scopes = ['screen:view']
  if (shareForm.value.touch) scopes.push('screen:touch')
  if (shareForm.value.stop) scopes.push('screen:stop')
  creatingShare.value = true
  try {
    const res = await deviceApi.createScreenShare(deviceId.value, {
      scopes,
      expires_at: shareForm.value.expires_at || null
    })
    const d = res.data
    lastCreatedShareUrl.value = `${window.location.origin}${d.share_path}`
    ElMessage.success('已生成分享链接')
    const res2 = await deviceApi.listScreenShares(deviceId.value)
    shareLinks.value = res2.data || []
  } finally {
    creatingShare.value = false
  }
}

function copyShareUrl() {
  if (!lastCreatedShareUrl.value) return
  navigator.clipboard?.writeText(lastCreatedShareUrl.value).then(
    () => ElMessage.success('已复制'),
    () => ElMessage.warning('复制失败，请手动复制')
  )
}

const shareScopeLabels = {
  'screen:view': '查看',
  'screen:touch': '触摸',
  'screen:stop': '停止'
}

function formatShareScopes(scopes) {
  if (!Array.isArray(scopes) || !scopes.length) return '—'
  return scopes.map((x) => shareScopeLabels[x] || x).join('、')
}

function formatShareExpiry(t) {
  if (!t) return '长期'
  return new Date(t).toLocaleString('zh-CN')
}

async function revokeShareRow(id) {
  await deviceApi.revokeScreenShare(deviceId.value, id)
  ElMessage.success('已撤销')
  const res = await deviceApi.listScreenShares(deviceId.value)
  shareLinks.value = res.data || []
}

/** 显式停止 Agent 端投屏（释放 MediaProjection）；刷新页面仅断 Web 不会触发此项。 */
async function disconnectViewer() {
  if (shareMode.value && !shareHas('screen:stop')) {
    ElMessage.warning('当前分享链接未授权「停止投屏」')
    return
  }
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'viewer_stop_screen' }))
    } catch (_) { /* noop */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  closeAll()
}

function closeAll() {
  try {
    const fs = document.fullscreenElement || document.webkitFullscreenElement
    if (fs) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    }
  } catch (_) { /* noop */ }
  isNativeFullscreen.value = false
  disconnectRecordingStomp()
  recordingProgressHint.value = ''
  receivedFrame.value = false
  latencyServer.value = 0
  pressPreview.value = null
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
  try {
    if (screenImg.value && activePointerId != null && screenImg.value.hasPointerCapture?.(activePointerId)) {
      screenImg.value.releasePointerCapture(activePointerId)
    }
  } catch (_) { /* noop */ }
  activePointerId = null
  touchStartPos = null
  resetWheelScrollState()
  streamResolution.value = null
  realDeviceResolution.value = null
  cleanupScreenFrameUrls()
  if (screenImg.value) {
    screenImg.value.removeAttribute('src')
  }
  ws?.close()
  ws = null
  status.value = 'disconnected'
}

function connect() {
  closeAll()
  if (!deviceId.value) return
  if (!shareMode.value) {
    primeResolutionFromDeviceList()
    loadScreenDevice()
  }

  status.value = 'connecting'

  const token = auth.token
  let url
  if (shareToken.value) {
    url = `${WS_BASE}/ws/screen/${deviceId.value}?share=${encodeURIComponent(shareToken.value)}`
  } else {
    if (!token) {
      status.value = 'disconnected'
      return
    }
    url = `${WS_BASE}/ws/screen/${deviceId.value}?token=${encodeURIComponent(token)}`
  }
  ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    status.value = 'connecting'
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        pingStartTime = Date.now()
        ws.send(JSON.stringify({
          type: 'screen_touch',
          data: { type: 'ping', ts: pingStartTime }
        }))
        const tsSrv = Date.now()
        ws.send(JSON.stringify({ type: 'client_ping', ts: tsSrv }))
      }
    }, 2000)
  }

  ws.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
    if (status.value !== 'disconnected') status.value = 'disconnected'
    receivedFrame.value = false
    cleanupScreenFrameUrls()
    if (screenImg.value) screenImg.value.removeAttribute('src')
  }

  ws.onerror = (e) => {
    console.error('Screen WS error', e)
    status.value = 'disconnected'
    receivedFrame.value = false
    cleanupScreenFrameUrls()
    if (screenImg.value) screenImg.value.removeAttribute('src')
  }

  ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      handleScreenBinaryFrame(new Uint8Array(e.data))
      return
    }
    if (typeof e.data !== 'string') return
    let msg
    try {
      msg = JSON.parse(e.data)
    } catch {
      return
    }
    if (msg.type === 'user_notice') {
      const text = msg.message || msg.msg || '设备提示'
      ElMessage.warning(text)
      return
    }
    if (msg.type === 'screen_pong') {
      const ts = Number(msg.ts)
      if (ts > 0) latency.value = Date.now() - ts
      return
    }
    if (msg.type === 'client_pong') {
      const ts = Number(msg.ts)
      if (ts > 0) latencyServer.value = Date.now() - ts
      return
    }
    if (msg.type === 'screen_meta') {
      const d = msg.data || {}
      const tw = Number(d.touch_width ?? d.width)
      const th = Number(d.touch_height ?? d.height)
      if (tw > 0 && th > 0) {
        realDeviceResolution.value = { width: tw, height: th }
      }
      const sw = Number(d.stream_width)
      const sh = Number(d.stream_height)
      if (sw > 0 && sh > 0) {
        streamResolution.value = { width: sw, height: sh }
      }
      return
    }
    if (msg.type === 'viewer_stop_ack') {
      return
    }
    if (msg.type === 'screen_frame') {
      const d = msg.data
      if (!d?.data || !screenImg.value) return
      applyLegacyBase64Jpeg(d.data)
      status.value = 'connected'
      receivedFrame.value = true
      frameCount++
      return
    }
  }

  connectRecordingStomp()
}

function onScreenImgLoad() {
  const el = screenImg.value
  if (!el || el.naturalWidth <= 0 || el.naturalHeight <= 0) return
  deviceResolution.value = { width: el.naturalWidth, height: el.naturalHeight }
}

/** 视口坐标 clientX/clientY */
function pointerClientXY(e) {
  const t = e.touches?.[0] || e.changedTouches?.[0]
  if (t) return { x: t.clientX, y: t.clientY }
  return { x: e.clientX, y: e.clientY }
}

/**
 * 输出坐标使用安卓物理分辨率；优先 screen_meta，其次图片 natural 尺寸与设备档案。
 */
function outputDeviceSize() {
  const phys = realDeviceResolution.value
  if (phys?.width > 0 && phys?.height > 0) return { width: phys.width, height: phys.height }
  const d = deviceResolution.value
  if (d?.width > 0 && d?.height > 0) return { width: d.width, height: d.height }
  const img = screenImg.value
  const iw = img?.naturalWidth
  const ih = img?.naturalHeight
  if (iw > 0 && ih > 0) return { width: iw, height: ih }
  return { width: 1080, height: 1920 }
}

/**
 * 元素用于 object-fit 计算的真实「内容框」（排除 border/padding），
 * 避免把边框算进宽高导致 picH 偏大 → ny 偏小 → 安卓触控偏上。
 */
function getElementContentBox(el) {
  const rect = el.getBoundingClientRect()
  const st = getComputedStyle(el)
  const bl = parseFloat(st.borderLeftWidth) || 0
  const br = parseFloat(st.borderRightWidth) || 0
  const bt = parseFloat(st.borderTopWidth) || 0
  const bb = parseFloat(st.borderBottomWidth) || 0
  const pl = parseFloat(st.paddingLeft) || 0
  const pr = parseFloat(st.paddingRight) || 0
  const pt = parseFloat(st.paddingTop) || 0
  const pb = parseFloat(st.paddingBottom) || 0
  return {
    left: rect.left + bl + pl,
    top: rect.top + bt + pt,
    width: rect.width - bl - br - pl - pr,
    height: rect.height - bt - bb - pt - pb
  }
}

/** 流像素宽高（与解码 JPEG 一致优先） */
function streamPixelSize(v) {
  if (!v) return { sw: 0, sh: 0 }
  const meta = streamResolution.value
  const nw = v.naturalWidth
  const nh = v.naturalHeight
  const sw = nw > 0 && nh > 0 ? nw : meta?.width > 0 ? meta.width : 0
  const sh = nw > 0 && nh > 0 ? nh : meta?.height > 0 ? meta.height : 0
  return { sw, sh }
}

/** object-fit:contain 下，画面在视口中的矩形（不含黑边） */
function getVideoPictureRect() {
  const v = screenImg.value
  if (!v) return null
  const box = getElementContentBox(v)
  const { sw, sh } = streamPixelSize(v)
  if (!sw || !sh || box.width <= 0 || box.height <= 0) return null

  const streamAspect = sw / sh
  const boxAspect = box.width / box.height

  let picLeft
  let picTop
  let picW
  let picH
  if (boxAspect > streamAspect) {
    picH = box.height
    picW = box.height * streamAspect
    picLeft = box.left + (box.width - picW) / 2
    picTop = box.top
  } else {
    picW = box.width
    picH = box.width / streamAspect
    picLeft = box.left
    picTop = box.top + (box.height - picH) / 2
  }
  return { picLeft, picTop, picW, picH, streamW: sw, streamH: sh }
}

function normalizedToDevice(nx, ny) {
  const out = outputDeviceSize()
  const maxX = Math.max(0, out.width - 1)
  const maxY = Math.max(0, out.height - 1)
  let x = Math.round(nx * maxX)
  let y = Math.round(ny * maxY)
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY))
  }
}

/**
 * 将视口坐标映射到设备像素：相对「当前页面上实际绘制的 Agent 画面」矩形（object-fit:contain 去掉黑边），
 * 再按 stream→touch 比例换算。与 getBoundingClientRect 同源，随 CSS 布局、页面缩放、flex 尺寸变化一致。
 */
function mapCoordinates(clientX, clientY) {
  const pic = getVideoPictureRect()
  if (!pic || pic.picW <= 0 || pic.picH <= 0) {
    return { x: 0, y: 0 }
  }

  let nx = (clientX - pic.picLeft) / pic.picW
  let ny = (clientY - pic.picTop) / pic.picH
  nx = Math.max(0, Math.min(1, nx))
  ny = Math.max(0, Math.min(1, ny))
  return normalizedToDevice(nx, ny)
}

/**
 * 统一用 pointer 的 clientX/clientY（与 img 的 getBoundingClientRect 同一视口坐标系）。
 * 不使用 offsetX/offsetY：各浏览器对 object-fit:contain 下 img 的 offset 与可见内容框不一致，分享页/缩放时易产生偏移。
 */
function mapPointerToDeviceCoords(e) {
  const { x: cx, y: cy } = pointerClientXY(e)
  return mapCoordinates(cx, cy)
}

/**
 * 滚轮/触控板：将 delta 映射为设备像素位移，合并后发送一次 swipe（不显示端上点击波纹）。
 * 与触控板方向一致：向下滚 → 手指上滑；向右横滚 → 手指左滑。
 */
function handleScreenWheel(e) {
  if (!wheelScrollRemote.value || !executeTouch.value) return
  if (activePointerId != null || touchStartPos != null) return
  if (e.ctrlKey) return
  if (status.value !== 'connected' || !receivedFrame.value) return
  const pic = getVideoPictureRect()
  if (!pic) return
  e.preventDefault()
  e.stopPropagation()

  let dXPx = e.deltaX
  let dYPx = e.deltaY
  if (e.deltaMode === 1) {
    dXPx *= 16
    dYPx *= 16
  } else if (e.deltaMode === 2) {
    dXPx *= pic.picW * 0.85
    dYPx *= pic.picH * 0.85
  }

  const out = outputDeviceSize()
  const scaleX = out.width / pic.picW
  const scaleY = out.height / pic.picH
  wheelAccumState.dx += dXPx * scaleX * 1.15
  wheelAccumState.dy += dYPx * scaleY * 1.15
  wheelAccumState.lastClientX = e.clientX
  wheelAccumState.lastClientY = e.clientY

  if (wheelFlushTimer) clearTimeout(wheelFlushTimer)
  wheelFlushTimer = setTimeout(flushWheelAccum, 48)
}

async function flushWheelAccum() {
  wheelFlushTimer = null
  let ddx = wheelAccumState.dx
  let ddy = wheelAccumState.dy
  wheelAccumState.dx = 0
  wheelAccumState.dy = 0

  if (Math.abs(ddx) < 3 && Math.abs(ddy) < 3) return
  if (!executeTouch.value || !wheelScrollRemote.value) return

  const cx = wheelAccumState.lastClientX
  const cy = wheelAccumState.lastClientY
  const anchor = mapCoordinates(cx, cy)
  const out = outputDeviceSize()

  const maxMove = Math.min(out.width, out.height) * 0.48
  const len = Math.hypot(ddx, ddy)
  if (len > maxMove && len > 0) {
    const s = maxMove / len
    ddx *= s
    ddy *= s
  }

  let x2 = Math.round(anchor.x - ddx)
  let y2 = Math.round(anchor.y - ddy)
  const maxX = Math.max(0, out.width - 1)
  const maxY = Math.max(0, out.height - 1)
  x2 = Math.max(0, Math.min(x2, maxX))
  y2 = Math.max(0, Math.min(y2, maxY))

  const dist = Math.hypot(anchor.x - x2, anchor.y - y2)
  if (dist < 10) return

  const duration = Math.min(580, Math.max(120, Math.round(dist * 1.1)))
  const touchData = {
    action: 'swipe',
    x: anchor.x,
    y: anchor.y,
    x2,
    y2,
    duration,
    showEffect: false,
    execute: executeTouch.value
  }

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'screen_touch', data: touchData }))
    return
  }
  if (deviceUsableForAdbTouch()) {
    try {
      const res = await fetch(`/api/devices/${deviceId.value}/adb/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(touchData)
      })
      if (!res.ok) {
        const t = await res.text()
        ElMessage.error(t?.slice(0, 120) || `滑屏失败 HTTP ${res.status}`)
      }
    } catch (err) {
      ElMessage.error(err.message || '滑屏请求失败')
    }
  }
}

async function handlePointerDown(e) {
  if (!screenImg.value || !e.isPrimary) return
  try {
    screenImg.value.setPointerCapture(e.pointerId)
  } catch (_) { /* 部分环境可能不支持 */ }
  activePointerId = e.pointerId

  const { x: cx, y: cy } = pointerClientXY(e)
  const { x, y } = mapPointerToDeviceCoords(e)
  touchStartPos = { x, y, time: Date.now() }

  if (videoWrap.value) {
    const wrect = videoWrap.value.getBoundingClientRect()
    pressPreview.value = { x: cx - wrect.left, y: cy - wrect.top }
  if (showClickEffect.value) {
      addClickEffect(cx - wrect.left, cy - wrect.top)
    }
  }
}

function addClickEffect(x, y) {
  const id = effectIdCounter++
  clickEffects.value.push({ id, x, y })
  setTimeout(() => {
    clickEffects.value = clickEffects.value.filter(e => e.id !== id)
  }, 600)
}

function releaseActivePointer(e) {
  try {
    if (screenImg.value?.hasPointerCapture?.(e.pointerId)) {
      screenImg.value.releasePointerCapture(e.pointerId)
    }
  } catch (_) { /* noop */ }
  if (e.pointerId === activePointerId) activePointerId = null
  pressPreview.value = null
}

async function handlePointerUp(e) {
  if (!screenImg.value || !touchStartPos || !e.isPrimary) return
  if (e.pointerId !== activePointerId) return

  releaseActivePointer(e)

  const { x, y } = mapPointerToDeviceCoords(e)
  const dx = Math.abs(x - touchStartPos.x)
  const dy = Math.abs(y - touchStartPos.y)
  const dt = Date.now() - touchStartPos.time

  const touchData = dx < 10 && dy < 10
    ? { action: 'tap', x: touchStartPos.x, y: touchStartPos.y, showEffect: showRemoteClickEffect.value, execute: executeTouch.value }
    : { action: 'swipe', x: touchStartPos.x, y: touchStartPos.y, x2: x, y2: y, duration: Math.min(dt, 1000), showEffect: showRemoteClickEffect.value, execute: executeTouch.value }

  // 正常路径：经屏幕 WebSocket → 服务端 → Agent screen_touch（与画面同源）
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'screen_touch', data: touchData }))
    touchStartPos = null
    return
  }
  // 历史回退：仅当设备有真实 ADB 串号时才有意义；Agent 占位设备禁止请求 adb/input
  if (deviceUsableForAdbTouch()) {
    try {
      const res = await fetch(`/api/devices/${deviceId.value}/adb/input`, {
      method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(touchData)
    })
      if (!res.ok) {
        const t = await res.text()
        ElMessage.error(t?.slice(0, 120) || `触控失败 HTTP ${res.status}`)
      }
    } catch (err) {
      ElMessage.error(err.message || '触控请求失败')
    }
  } else {
    ElMessage.warning(
      '屏幕连接未就绪，触控未发送。请确认画面 WebSocket 已连接后再点；纯 Agent 设备不走 ADB。'
    )
  }
  touchStartPos = null
}

function handlePointerCancel(e) {
  if (!e.isPrimary) return
  releaseActivePointer(e)
  touchStartPos = null
}

function handleLostPointerCapture(e) {
  if (e.pointerId !== activePointerId) return
  activePointerId = null
  touchStartPos = null
  pressPreview.value = null
}

function toggleRemoteEffect() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'screen_touch',
      data: { action: 'toggle_effect', enabled: showRemoteClickEffect.value }
    }))
  }
}

async function handleDrop(e) {
  if (shareMode.value) return
  e.preventDefault()
  const files = Array.from(e.dataTransfer.files)
  if (files.length === 0) return

  const file = files[0]
  uploading.value = true

  try {
    if (file.name.endsWith('.apk')) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/apps/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
        body: formData
      })
      const result = await res.json()
      const app = result.data || result

      const ins = await fetch(`/api/apps/${app.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify({
          device_ids: [Number(deviceId.value)],
          start_after_install: screenDropInstallAndLaunch.value
        })
      })
      if (!ins.ok) {
        const t = await ins.text()
        throw new Error(t?.slice(0, 200) || `安装请求失败 HTTP ${ins.status}`)
      }
      ElMessage.success('APK安装中...')
    } else {
      const formData = new FormData()
      formData.append('file', file)
      await fetch(`/api/devices/${deviceId.value}/adb/push-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
        body: formData
      })
      ElMessage.success('文件已推送到设备')
    }
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    uploading.value = false
  }
}

function handleDragOver(e) {
  if (shareMode.value) return
  e.preventDefault()
}

function syncNativeFullscreenState() {
  const el = fullscreenTargetEl.value
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement
  isNativeFullscreen.value = Boolean(el && fsEl === el)
}

async function toggleNativeFullscreen() {
  const el = fullscreenTargetEl.value
  if (!el) return
  const active = document.fullscreenElement || document.webkitFullscreenElement
  try {
    if (active === el) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
    } else if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    else ElMessage.warning('当前浏览器不支持全屏 API')
  } catch {
    ElMessage.warning('无法切换全屏（需由点击触发或浏览器已禁止）')
  }
}

watch(
  () => route.query.device,
  (q) => {
    if (shareMode.value) return
    const v = q != null && q !== '' ? String(q) : ''
    if (v && v !== deviceId.value) {
      deviceId.value = v
      loadScreenDevice()
      connect()
      loadRecordings()
    }
  }
)

async function initShareFromRoute() {
  if (!shareMode.value) return
  if (!shareToken.value) {
    ElMessage.error('分享链接缺少 share 参数')
    return
  }
  const dv = route.query.device != null && route.query.device !== '' ? String(route.query.device) : ''
  if (!dv) {
    ElMessage.error('分享链接缺少 device 参数')
    return
  }
  deviceId.value = dv
  await loadShareClaims()
  if (!shareClaims.value?.valid) {
    ElMessage.error('分享链接无效或已过期')
    return
  }
  executeTouch.value = shareHas('screen:touch')
  wheelScrollRemote.value = shareHas('screen:touch')
  connect()
}

watch(
  () => [route.query.device, route.query.share],
  () => {
    initShareFromRoute()
  },
  { immediate: true }
)

const profileStomp = createDeviceProfileStomp(
  (j) => {
    if (Number(j.device_id) === Number(deviceId.value)) loadScreenDevice()
  },
  () => localStorage.getItem('token')
)

onMounted(async () => {
  document.addEventListener('fullscreenchange', syncNativeFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncNativeFullscreenState)
  if (shareMode.value) {
    return
  }
  const res = await deviceApi.getDevices()
  devices.value = res.data
  if (deviceId.value) {
    await loadScreenDevice()
    connect()
    loadRecordings()
  }
  if (auth.token) profileStomp.connect()
})

const saveAdbScreenshot = async () => {
  if (!deviceId.value) return
  screenshotLoading.value = true
  const n = ElNotification({
    title: '正在截图',
    message: 'ADB 截图与传输可能需要数十秒，请勿重复点击。',
    type: 'info',
    duration: 0
  })
  try {
    const blob = await deviceApi.captureScreenshot(deviceId.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screenshot_${deviceId.value}_${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('截图已下载')
  } catch (e) {
    ElMessage.error(e.message || '截图失败')
  } finally {
    n.close()
    screenshotLoading.value = false
  }
}

function dismissRecordingDownload() {
  recordingDownload.value = null
}

async function promptRenameRecording(id, currentName) {
  try {
    const { value } = await ElMessageBox.prompt('修改后将用于在线播放标题与下载时的文件名（服务器上的存储路径不变）。', '重命名录屏', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: currentName || '',
      inputPlaceholder: '文件名',
      inputValidator: (v) => {
        if (!v || !String(v).trim()) return '不能为空'
        return true
      }
    })
    const name = String(value).trim()
    const res = await deviceApi.renameRecording(id, name)
    const saved = res?.data?.file_name ?? name
    ElMessage.success('已重命名')
    if (recordingDownload.value && recordingDownload.value.id === id) {
      recordingDownload.value = { ...recordingDownload.value, file_name: saved }
    }
    await loadRecordings()
  } catch (e) {
    if (e !== 'cancel' && !e?.response && e?.message) ElMessage.error(e.message)
  }
}

const toggleRecording = async () => {
  if (recording.value) {
    await fetch(`/api/devices/${deviceId.value}/adb/recording/stop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    recording.value = false
    clearInterval(recordingTimer)
    recordingTimer = null
  } else {
    recordingDownload.value = null
    recordingProgressHint.value = ''
    await fetch(`/api/devices/${deviceId.value}/adb/recording/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    recording.value = true
    recordingTime.value = 0
    recordingTimer = setInterval(() => recordingTime.value++, 1000)
  }
}

const loadRecordings = async () => {
  const res = await fetch(`/api/recordings?device_id=${deviceId.value}`, {
    headers: { 'Authorization': `Bearer ${auth.token}` }
  })
  const data = await res.json()
  recordings.value = data.data || []
}

const recordingStreamUrl = (id) => {
  const t = encodeURIComponent(auth.token || '')
  return `/api/recordings/${id}/stream?token=${t}`
}

const openRecordingPlayer = async (id) => {
  recordingPlayerId.value = id
  recordingPlayerVisible.value = true
  await nextTick()
  try {
    recordingPlayerRef.value?.play?.()
  } catch (_) { /* autoplay 可能被浏览器拦截，用户可手动点播放 */ }
}

function onRecordingPlayerClosed() {
  try {
    const v = recordingPlayerRef.value
    if (v) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  } catch (_) { /* noop */ }
  recordingPlayerId.value = null
}

const downloadRecording = (id) => {
  window.open(`/api/recordings/${id}/download?token=${auth.token}`, '_blank')
}

const deleteRecording = async (id) => {
  await fetch(`/api/recordings/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${auth.token}` }
  })
  ElMessage.success('删除成功')
  loadRecordings()
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncNativeFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncNativeFullscreenState)
  profileStomp.disconnect()
  closeAll()
})
</script>
