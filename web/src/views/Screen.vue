<template>
  <div class="screen-page-root">
    <div class="screen-page-main-col">
      <div v-show="!isNativeFullscreen" class="screen-page-toolbar">
        <!-- 第一行：设备选择 + 操作按钮 + 全屏 -->
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
          <el-tooltip
            v-if="!shareMode && auth.token && deviceId"
            :content="screenDropInstallAndLaunch ? '拖入 APK：安装后启动（点击关闭）' : '拖入 APK：仅安装不启动（点击开启自动启动）'"
            placement="bottom"
          >
            <button
              class="cfg-icon-btn"
              :class="{ active: screenDropInstallAndLaunch }"
              @click="screenDropInstallAndLaunch = !screenDropInstallAndLaunch"
              title=""
              style="width:auto;padding:0 8px;gap:4px;font-size:12px;color:inherit"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              APK 安装
            </button>
          </el-tooltip>
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
          <el-button type="primary" plain @click="toggleNativeFullscreen">
            <el-icon class="screen-btn-icon"><FullScreen /></el-icon>
            全屏画面
          </el-button>
        </div>

        <!-- 第二行：虚拟按键 -->
        <div
          v-if="deviceId"
          style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px"
        >
          <span style="font-size:12px;color:#909399;margin-right:2px">虚拟按键</span>
          <el-button-group>
            <el-button size="small" title="返回 (KEYCODE_BACK)" @click="sendKeyEvent(4)">
              ← 返回
            </el-button>
            <el-button size="small" title="Home (KEYCODE_HOME)" @click="sendKeyEvent(3)">
              ○ Home
            </el-button>
            <el-button size="small" title="最近任务 (KEYCODE_APP_SWITCH)" @click="sendKeyEvent(187)">
              □ 任务
            </el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" title="音量+ (KEYCODE_VOLUME_UP)" @click="sendKeyEvent(24)">
              VOL+
            </el-button>
            <el-button size="small" title="音量- (KEYCODE_VOLUME_DOWN)" @click="sendKeyEvent(25)">
              VOL-
            </el-button>
            <el-button size="small" title="静音 (KEYCODE_VOLUME_MUTE)" @click="sendKeyEvent(164)">
              静音
            </el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" title="电源键 (KEYCODE_POWER)" @click="sendKeyEvent(26)">
              电源
            </el-button>
            <el-button size="small" title="亮屏 (KEYCODE_WAKEUP)" @click="sendKeyEvent(224)">
              亮屏
            </el-button>
            <el-button size="small" title="锁屏 (KEYCODE_SLEEP)" @click="sendKeyEvent(223)">
              锁屏
            </el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" title="截图 (KEYCODE_SYSRQ)" @click="sendKeyEvent(120)">
              截屏键
            </el-button>
            <el-button size="small" title="菜单 (KEYCODE_MENU)" @click="sendKeyEvent(82)">
              菜单
            </el-button>
          </el-button-group>
        </div>

        <!-- 第三行：连接状态 + Agent 状态 -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
          <el-tag v-if="status === 'connected'" type="success" size="small">端到端: {{ latency || '—' }}ms</el-tag>
          <el-tag v-if="status === 'connected'" type="info" size="small">到服务器: {{ latencyServer || '—' }}ms</el-tag>
          <template v-if="receivedFrame">
            <el-tag size="small" type="info">分辨率 {{ screenResolutionText }}</el-tag>
            <el-tag size="small" type="info">{{ fps }} fps</el-tag>
            <el-tag size="small" type="info">{{ screenKbps }} kbps</el-tag>
          </template>
          <template v-if="!shareMode && screenDevice && deviceId">
            <el-divider direction="vertical" />
            <el-tag size="small" :type="screenDevice.agent_connected ? 'success' : 'info'">
              {{ screenDevice.agent_connected ? 'Agent 在线' : 'Agent 离线' }}
            </el-tag>
            <el-tag size="small" :type="screenDevice.allow_remote_screen ? 'success' : 'warning'">
              {{ screenDevice.allow_remote_screen ? '端上已允许远程屏幕' : '端上未允许远程屏幕' }}
            </el-tag>
            <el-tag size="small" :type="streamStatusTagType">{{ streamStatusText }}</el-tag>
          </template>
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
          <template v-if="receivedFrame">
            <el-tag size="small" type="info">{{ screenResolutionText }}</el-tag>
            <el-tag size="small" type="info">{{ fps }}fps · {{ screenKbps }}kbps</el-tag>
          </template>
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
            <div v-if="receivedFrame" class="screen-stream-stats">
              {{ screenResolutionText }} · {{ fps }}fps · {{ screenKbps }}kbps
            </div>
            <div
              v-if="uploading"
              style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:20px;border-radius:8px"
            >
          上传中...
      </div>

            <!-- 摄像头侧边模式：紧贴实际画面左侧 -->
            <div
              v-if="cameraWindows.length > 0 && cameraDisplayMode === 'sidebar'"
              class="camera-sidebar"
              :style="cameraSidebarStyle"
            >
              <div
                v-for="cam in cameraWindows"
                :key="cam.id"
                class="camera-sidebar-window"
                :class="{ 'camera-sidebar-window--connecting': cam.state === 'connecting' }"
              >
                <div class="camera-overlay-header">
                  <span class="camera-overlay-label">{{ cam.id === 'back' ? '后置' : '前置' }}</span>
                  <el-tooltip
                    :content="cameraStats[cam.id] ? `${cameraStats[cam.id].width}×${cameraStats[cam.id].height}  ${cameraStats[cam.id].fps}fps  ${cameraStats[cam.id].kbps}kbps` : '暂无统计'"
                    placement="top"
                    :disabled="cam.state !== 'connected'"
                  >
                    <el-tag size="small" :type="cam.state === 'connected' ? 'success' : 'info'" style="scale:0.8;cursor:default">
                      {{ cam.state === 'connected' ? '直播' : cam.state === 'connecting' ? '连接中' : '断开' }}
                    </el-tag>
                  </el-tooltip>
                  <button class="camera-overlay-close" @click="stopCameraStream(cam.id)" title="关闭">✕</button>
                </div>
                <video
                  :ref="el => { if (el) cameraVideoRefs[cam.id] = el }"
                  class="camera-sidebar-video"
                  autoplay
                  playsinline
                  muted
                />
              </div>
            </div>

            <!-- 摄像头浮窗模式 -->
            <div v-if="cameraWindows.length > 0 && cameraDisplayMode === 'overlay'" class="camera-overlay-container">
              <div
                v-for="cam in cameraWindows"
                :key="cam.id"
                class="camera-overlay-window"
                :class="{ 'camera-overlay-window--connecting': cam.state === 'connecting' }"
              >
                <div class="camera-overlay-header">
                  <span class="camera-overlay-label">{{ cam.id === 'back' ? '后置' : '前置' }}</span>
                  <el-tooltip
                    :content="cameraStats[cam.id] ? `${cameraStats[cam.id].width}×${cameraStats[cam.id].height}  ${cameraStats[cam.id].fps}fps  ${cameraStats[cam.id].kbps}kbps` : '暂无统计'"
                    placement="top"
                    :disabled="cam.state !== 'connected'"
                  >
                    <el-tag size="small" :type="cam.state === 'connected' ? 'success' : 'info'" style="scale:0.8;cursor:default">
                      {{ cam.state === 'connected' ? '直播' : cam.state === 'connecting' ? '连接中' : '断开' }}
                    </el-tag>
                  </el-tooltip>
                  <button class="camera-overlay-close" @click="stopCameraStream(cam.id)" title="关闭">✕</button>
                </div>
                <video
                  :ref="el => { if (el) cameraVideoRefs[cam.id] = el }"
                  class="camera-overlay-video"
                  autoplay
                  playsinline
                  muted
                />
              </div>
            </div>
          </div>

          <aside v-if="!shareMode" class="screen-quick-rail" aria-label="快速操作">
            <div class="screen-quick-panel" :class="{ 'screen-quick-panel--open': quickPanelOpen }">
              <div class="screen-quick-panel__scroll">

                <!-- 操作卡片：录屏 + 截图 -->
                <div style="flex-shrink:0;padding:8px 12px;border-bottom:1px solid #e4e7ed;display:flex;flex-direction:column;gap:6px;background:#fff">
                  <!-- 录屏行 -->
                  <div style="display:flex;align-items:center;gap:6px">
                    <!-- 录制音频 toggle -->
                    <el-tooltip :content="recordAudio ? '录制音频（点击关闭）' : '不录制音频（点击开启）'" placement="top">
                      <button class="cfg-icon-btn" :class="{ active: recordAudio }" @click="recordAudio = !recordAudio" title="">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="23"/>
                          <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                      </button>
                    </el-tooltip>
                    <!-- 开始/停止录屏 -->
                    <el-tooltip :content="recording ? `停止录屏（${recordingTime}s）` : '开始录屏'" placement="top">
                      <button
                        class="cfg-icon-btn"
                        :class="{ active: recording, 'cfg-icon-btn--danger': recording }"
                        @click="toggleRecording"
                        title=""
                      >
                        <svg v-if="!recording" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"/>
                          <circle cx="12" cy="12" r="4" fill="currentColor"/>
                        </svg>
                        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <rect x="6" y="6" width="12" height="12" rx="2"/>
                        </svg>
                      </button>
                    </el-tooltip>
                    <!-- 录制中状态 -->
                    <span v-if="recording" style="font-size:12px;color:#f56c6c;font-weight:600">● {{ recordingTime }}s</span>
                    <span v-if="recordingProgressHint && !recording" style="font-size:11px;color:#909399;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ recordingProgressHint }}</span>
                    <!-- 截图 -->
                    <el-tooltip content="截图" placement="top">
                      <button class="cfg-icon-btn" :class="{ 'cfg-icon-btn--loading': screenshotLoading }" :disabled="!deviceId" @click="saveAdbScreenshot" title="">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </button>
                    </el-tooltip>
                  </div>
                  <!-- 摄像头行 -->
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:11px;color:#909399">摄像头</span>
                    <!-- 后置摄像头 -->
                    <el-tooltip :content="isCameraActive('back') ? '关闭后置摄像头' : '开启后置摄像头'" placement="top">
                      <button class="cfg-icon-btn" :class="{ active: isCameraActive('back') }" @click="toggleCameraStream('back')" title="">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </button>
                    </el-tooltip>
                    <span style="font-size:11px;color:#606266">后</span>
                    <!-- 前置摄像头 -->
                    <el-tooltip :content="isCameraActive('front') ? '关闭前置摄像头' : '开启前置摄像头'" placement="top">
                      <button class="cfg-icon-btn" :class="{ active: isCameraActive('front') }" @click="toggleCameraStream('front')" title="">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="3"/>
                          <circle cx="12" cy="13" r="1" fill="currentColor"/>
                        </svg>
                      </button>
                    </el-tooltip>
                    <span style="font-size:11px;color:#606266">前</span>
                  </div>
                  <!-- 录屏完成提示 -->
                  <el-alert
                    v-if="recordingDownload"
                    type="success"
                    :closable="true"
                    show-icon
                    style="padding:4px 8px"
                    @close="dismissRecordingDownload"
                  >
                    <template #title>
                      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                        <span style="font-size:12px">录屏已保存</span>
                        <el-button size="small" type="primary" @click="openRecordingPlayer(recordingDownload.id)">播放</el-button>
                        <el-button size="small" @click="downloadRecording(recordingDownload.id)">下载</el-button>
                        <el-button size="small" @click="promptRenameRecording(recordingDownload.id, recordingDownload.file_name)">重命名</el-button>
                      </div>
                    </template>
                  </el-alert>
                </div>

                <!-- 文件区：截图 & 录屏 Tabs，flex-grow 占满中间空间 -->
                <el-card shadow="never" class="screen-quick-files-card">
                  <template #header>
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <span style="font-weight:600">文件</span>
                      <el-button size="small" @click="loadRecordings" circle>
                        <el-icon><Refresh /></el-icon>
                      </el-button>
                    </div>
                  </template>
                  <el-tabs v-model="fileTab" style="--el-tabs-header-height:32px">
                    <!-- 截图 Tab -->
                    <el-tab-pane label="截图" name="screenshots">
                      <div class="screen-quick-files-list">
                        <div v-if="screenshots.length === 0" style="text-align:center;color:#909399;padding:20px 0">暂无截图</div>
                        <div v-for="shot in screenshots" :key="shot.id" style="padding:8px 0;border-bottom:1px solid #eee">
                          <div style="font-size:13px;margin-bottom:4px;word-break:break-all">{{ shot.file_name }}</div>
                          <div style="font-size:12px;color:#909399;margin-bottom:6px">
                            {{ formatSize(shot.file_size) }} · {{ formatDate(shot.created_at) }}
                          </div>
                          <div style="display:flex;flex-wrap:wrap;gap:6px">
                            <el-button size="small" type="primary" plain @click="viewScreenshot(shot.id)">查看</el-button>
                            <el-button size="small" @click="downloadScreenshot(shot.id, shot.file_name)">下载</el-button>
                            <el-button size="small" type="danger" @click="deleteScreenshot(shot.id)">删除</el-button>
                          </div>
                        </div>
                      </div>
                    </el-tab-pane>
                    <!-- 录屏 Tab -->
                    <el-tab-pane label="录屏" name="recordings">
                      <div class="screen-quick-files-list">
                        <div v-if="recordings.length === 0" style="text-align:center;color:#909399;padding:20px 0">暂无录屏</div>
                        <div v-for="rec in recordings" :key="rec.id" style="padding:8px 0;border-bottom:1px solid #eee">
                          <div style="font-size:13px;margin-bottom:4px;word-break:break-all">{{ rec.file_name }}</div>
                          <div style="font-size:12px;color:#909399;margin-bottom:6px">
                            {{ formatSize(rec.file_size) }} · {{ formatDate(rec.created_at) }}
                          </div>
                          <div style="display:flex;flex-wrap:wrap;gap:6px">
                            <el-button size="small" type="primary" plain @click="openRecordingPlayer(rec.id)">播放</el-button>
                            <el-button size="small" @click="downloadRecording(rec.id)">下载</el-button>
                            <el-button size="small" @click="promptRenameRecording(rec.id, rec.file_name)">重命名</el-button>
                            <el-button size="small" type="danger" @click="deleteRecording(rec.id)">删除</el-button>
                          </div>
                        </div>
                      </div>
                    </el-tab-pane>
                  </el-tabs>
                </el-card>

                <!-- 配置卡片：固定在底部，图标行紧凑布局 -->
                <div style="flex-shrink:0;padding:8px 12px;border-top:1px solid #e4e7ed;display:flex;align-items:center;gap:4px;background:#f5f7fa">
                  <span style="font-size:11px;color:#909399;margin-right:4px">配置</span>

                  <!-- Web端点击效果 -->
                  <el-tooltip content="Web端点击效果" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: showClickEffect }" @click="showClickEffect = !showClickEffect" title="">
                      <!-- 鼠标点击涟漪图标 -->
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <circle cx="12" cy="12" r="7" stroke-dasharray="3 2" opacity="0.5"/>
                      </svg>
                    </button>
                  </el-tooltip>

                  <!-- Android端点击效果 -->
                  <el-tooltip content="Android端点击效果" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: showRemoteClickEffect }" @click="showRemoteClickEffect = !showRemoteClickEffect; toggleRemoteEffect()" title="">
                      <!-- 手机+点击图标 -->
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="7" y="2" width="10" height="18" rx="2"/>
                        <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.4"/>
                        <line x1="16" y1="13" x2="16" y2="11"/>
                        <line x1="19" y1="16" x2="21" y2="16"/>
                        <line x1="13" y1="16" x2="11" y2="16"/>
                      </svg>
                    </button>
                  </el-tooltip>

                  <div style="width:1px;height:16px;background:#dcdfe6;margin:0 4px"/>

                  <!-- 执行触摸操作 -->
                  <el-tooltip content="执行触摸操作" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: executeTouch }" @click="executeTouch = !executeTouch" title="">
                      <!-- 手指触控图标 -->
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 11V6a2 2 0 0 1 4 0v5"/>
                        <path d="M13 11V9a2 2 0 0 1 4 0v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-1a2 2 0 0 1 4 0"/>
                      </svg>
                    </button>
                  </el-tooltip>

                  <!-- 滚轮映射滑屏 -->
                  <el-tooltip :content="executeTouch ? '滚轮/触控板映射为滑屏' : '需先开启触摸操作'" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: wheelScrollRemote && executeTouch, disabled: !executeTouch }" @click="executeTouch && (wheelScrollRemote = !wheelScrollRemote)" title="">
                      <!-- 滚轮图标 -->
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="8" y="2" width="8" height="14" rx="4"/>
                        <line x1="12" y1="6" x2="12" y2="10"/>
                        <path d="M5 20l7 2 7-2"/>
                      </svg>
                    </button>
                  </el-tooltip>

                  <div style="width:1px;height:16px;background:#dcdfe6;margin:0 4px"/>

                  <!-- 摄像头显示模式：浮窗 / 侧边 -->
                  <el-tooltip :content="cameraDisplayMode === 'overlay' ? '摄像头：浮窗模式（点击切换为侧边）' : '摄像头：侧边模式（点击切换为浮窗）'" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: cameraDisplayMode === 'sidebar' }" @click="toggleCameraDisplayMode" title="">
                      <svg v-if="cameraDisplayMode === 'overlay'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <rect x="13" y="10" width="7" height="5" rx="1" fill="currentColor" opacity="0.4"/>
                      </svg>
                      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <line x1="15" y1="3" x2="15" y2="17"/>
                      </svg>
                    </button>
                  </el-tooltip>

                  <!-- 查看模式：内弹窗 / 新标签页 -->
                  <el-tooltip :content="mediaViewMode === 'dialog' ? '查看模式：内弹窗（点击切换为新标签页）' : '查看模式：新标签页（点击切换为内弹窗）'" placement="top">
                    <button class="cfg-icon-btn" :class="{ active: mediaViewMode === 'dialog' }" @click="toggleMediaViewMode" title="">
                      <!-- 内弹窗图标（窗口层叠） -->
                      <svg v-if="mediaViewMode === 'dialog'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="5" width="14" height="11" rx="1"/>
                        <path d="M7 19h14V9" stroke-dasharray="2 2" opacity="0.5"/>
                      </svg>
                      <!-- 新标签页图标（外链箭头） -->
                      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </button>
                  </el-tooltip>
                </div>

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

    <!-- 截图预览 Dialog -->
    <el-dialog
      v-model="screenshotPreviewVisible"
      title="截图预览"
      width="min(960px, 96vw)"
      destroy-on-close
      align-center
    >
      <div style="text-align:center;background:#000;border-radius:4px;overflow:hidden">
        <img
          :src="screenshotPreviewUrl"
          style="max-width:100%;max-height:78vh;object-fit:contain;display:block;margin:0 auto"
          alt="截图预览"
        />
      </div>
      <template #footer>
        <el-button @click="screenshotPreviewVisible = false">关闭</el-button>
        <el-button type="primary" @click="openScreenshotInTab">在新标签页打开</el-button>
      </template>
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
  overflow: hidden;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.screen-quick-files-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.screen-quick-files-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 12px 12px;
}

.screen-quick-files-card :deep(.el-tabs) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.screen-quick-files-card :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.screen-quick-files-card :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.screen-quick-files-list {
  height: 100%;
  overflow-y: auto;
}

/* 配置区图标按钮 */
.cfg-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #c0c4cc;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
  flex-shrink: 0;
}
.cfg-icon-btn:hover:not(.disabled):not(:disabled) {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}
.cfg-icon-btn.active {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}
.cfg-icon-btn.cfg-icon-btn--danger {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #fef0f0;
}
.cfg-icon-btn.cfg-icon-btn--danger:hover {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #fde2e2;
}
.cfg-icon-btn.cfg-icon-btn--loading {
  opacity: 0.6;
  cursor: wait;
}
.cfg-icon-btn.disabled,
.cfg-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cfg-icon-btn:hover:not(.disabled) {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.cfg-icon-btn.active {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.cfg-icon-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.screen-stream-stats {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 5;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: #e8eaed;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
/* 摄像头浮窗 */
.camera-overlay-container {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20;
  pointer-events: none;
}
.camera-overlay-window {
  width: 160px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  pointer-events: all;
  border: 1px solid rgba(255,255,255,0.15);
}
.camera-overlay-window--connecting {
  opacity: 0.7;
}
.camera-overlay-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(0,0,0,0.6);
}
.camera-overlay-label {
  font-size: 11px;
  color: #fff;
  flex: 1;
}
.camera-overlay-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  line-height: 1;
}
.camera-overlay-close:hover { color: #fff; }
.camera-overlay-video {
  width: 100%;
  aspect-ratio: 9/16;
  object-fit: cover;
  display: block;
  background: #111;
}

/* 摄像头侧边模式：绝对定位，紧贴实际画面左侧 */
.camera-sidebar {
  position: absolute;
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 0;
  background: transparent;
  z-index: 5;
  box-sizing: border-box;
  overflow: visible;
}
.camera-sidebar-window {
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.15);
  height: 100%;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.camera-sidebar-window--connecting {
  opacity: 0.7;
}
.camera-sidebar-video {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #111;
}

</style>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventListenerStore } from '@/stores/eventListeners'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { FullScreen, Close, Refresh } from '@element-plus/icons-vue'
import { Client } from '@stomp/stompjs'
import * as deviceApi from '@/api/device'
import { WS_BASE } from '@/utils/ws'

const route = useRoute()
const auth = useAuthStore()
const eventListeners = useEventListenerStore()
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
const fileTab = ref('screenshots') // 文件区 tab：screenshots | recordings
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
const screenshots = ref([])
const recordingPlayerVisible = ref(false)
const recordingPlayerId = ref(null)
const recordingPlayerRef = ref(null)
const screenshotPreviewVisible = ref(false)
const screenshotPreviewUrl = ref('')
const mediaViewMode = ref(localStorage.getItem('screen-media-view-mode') === 'tab' ? 'tab' : 'dialog')
const cameraDisplayMode = ref(localStorage.getItem('screen-camera-display-mode') === 'sidebar' ? 'sidebar' : 'overlay')

// 侧边栏紧贴实际画面左侧：响应式样式，由 updateCameraSidebarStyle 驱动
const cameraSidebarStyle = ref({})
function updateCameraSidebarStyle() {
  const pic = getVideoPictureRect()
  if (!pic || !videoWrap.value) { cameraSidebarStyle.value = { display: 'none' }; return }
  const wrapRect = videoWrap.value.getBoundingClientRect()
  const top = pic.picTop - wrapRect.top
  const picLeft = pic.picLeft - wrapRect.left

  // 每个摄像头按 9:16 比例计算宽度，多个并排
  const camCount = cameraWindows.value.length || 1
  const camW = Math.round(pic.picH * 9 / 16)
  const totalW = camW * camCount + (camCount - 1) * 4 // 4px gap

  // 优先放在画面左侧，空间不足时从画面左边缘内缩
  const idealLeft = picLeft - totalW
  const left = Math.max(0, idealLeft)

  cameraSidebarStyle.value = {
    top: top + 'px',
    left: left + 'px',
    height: pic.picH + 'px',
    width: totalW + 'px',
  }
}
// ── 摄像头 WebRTC ──────────────────────────────────────────────────────────────
const cameraWindows = ref([])   // [{ id: 'back'|'front', state: 'connecting'|'connected'|'disconnected' }]
const cameraVideoRefs = {}      // { 'back': HTMLVideoElement, 'front': HTMLVideoElement }
const cameraPCs = {}            // { 'back': RTCPeerConnection, 'front': RTCPeerConnection }
const cameraWSs = {}            // { 'back': WebSocket, 'front': WebSocket }
const cameraStats = ref({})     // { 'back': { width, height, fps, kbps }, ... }
const cameraStatsTimers = {}    // { 'back': intervalId }

async function pollCameraStats(camId) {
  const pc = cameraPCs[camId]
  if (!pc) return
  try {
    const stats = await pc.getStats()
    let width = 0, height = 0, fps = 0, kbps = 0
    let prevBytes = cameraStats.value[camId]?._bytes ?? 0
    let prevTs = cameraStats.value[camId]?._ts ?? 0
    stats.forEach(r => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') {
        fps = Math.round(r.framesPerSecond ?? 0)
        width = r.frameWidth ?? 0
        height = r.frameHeight ?? 0
        const now = r.timestamp
        const dt = (now - prevTs) / 1000
        if (dt > 0 && prevTs > 0) {
          kbps = Math.round((r.bytesReceived - prevBytes) * 8 / dt / 1000)
        }
        prevBytes = r.bytesReceived
        prevTs = now
      }
    })
    cameraStats.value[camId] = { width, height, fps, kbps, _bytes: prevBytes, _ts: prevTs }
  } catch (_) {}
}

function startCameraStatsPolling(camId) {
  stopCameraStatsPolling(camId)
  cameraStatsTimers[camId] = setInterval(() => pollCameraStats(camId), 1500)
}

function stopCameraStatsPolling(camId) {
  if (cameraStatsTimers[camId]) {
    clearInterval(cameraStatsTimers[camId])
    delete cameraStatsTimers[camId]
  }
  const s = { ...cameraStats.value }
  delete s[camId]
  cameraStats.value = s
}

watch(cameraWindows, () => updateCameraSidebarStyle(), { deep: true })
watch(cameraDisplayMode, () => updateCameraSidebarStyle())

const isCameraActive = (camId) => cameraWindows.value.some(c => c.id === camId)

const toggleCameraStream = (camId) => {
  if (isCameraActive(camId)) {
    stopCameraStream(camId)
  } else {
    startCameraStream(camId)
  }
}

const startCameraStream = (camId) => {
  if (!deviceId.value) return
  if (!cameraWindows.value.find(c => c.id === camId)) {
    cameraWindows.value.push({ id: camId, state: 'connecting' })
  }

  const token = auth.token || ''
  const wsUrl = `${WS_BASE}/ws/camera/${deviceId.value}?camera=${camId}&token=${token}`
  const ws = new WebSocket(wsUrl)
  cameraWSs[camId] = ws

  // 默认不配 STUN：局域网下仅用 host 候选即可秒连；跨网段时由服务端在 offer
  // 里下发 ice_servers（与服务端 webrtc.ice_servers 配置统一）后再 setConfiguration。
  const pc = new RTCPeerConnection({ iceServers: [] })
  cameraPCs[camId] = pc

  // Server sends track to browser — bind to video element
  pc.ontrack = (event) => {
    const win = cameraWindows.value.find(c => c.id === camId)
    if (win) win.state = 'connected'
    nextTick(() => {
      const videoEl = cameraVideoRefs[camId]
      if (videoEl) {
        videoEl.srcObject = event.streams[0] || new MediaStream([event.track])
      }
    })
    startCameraStatsPolling(camId)
  }

  // Send ICE candidates to server
  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'webrtc_ice_candidate',
        camera: camId,
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      }))
    }
  }

  pc.onconnectionstatechange = () => {
    const win = cameraWindows.value.find(c => c.id === camId)
    if (!win) return
    if (pc.connectionState === 'connected') win.state = 'connected'
    else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      win.state = 'disconnected'
    }
  }

  // Server is the offerer — browser receives offer and sends answer
  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'webrtc_offer') {
      // 应用服务端下发的 ICE 配置（跨网段才有；LAN 通常为空，保持纯 host 秒连）
      if (Array.isArray(msg.ice_servers) && msg.ice_servers.length > 0) {
        try { pc.setConfiguration({ iceServers: msg.ice_servers }) } catch (_) {}
      }
      // Server sends offer when publisher track is ready
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      ws.send(JSON.stringify({ type: 'webrtc_answer', camera: camId, sdp: answer.sdp }))
    } else if (msg.type === 'webrtc_ice_candidate' && msg.candidate) {
      try { await pc.addIceCandidate(msg.candidate) } catch (_) {}
    } else if (msg.type === 'error') {
      ElMessage.error('摄像头连接失败：' + msg.message)
      stopCameraStream(camId)
    }
  }

  ws.onerror = () => {
    const win = cameraWindows.value.find(c => c.id === camId)
    if (win) win.state = 'disconnected'
  }

  ws.onclose = () => {
    const win = cameraWindows.value.find(c => c.id === camId)
    if (win && win.state !== 'disconnected') win.state = 'disconnected'
  }
}

const stopCameraStream = (camId) => {
  stopCameraStatsPolling(camId)
  // Close WebSocket
  const ws = cameraWSs[camId]
  if (ws) {
    ws.close()
    delete cameraWSs[camId]
  }
  // Close PeerConnection
  const pc = cameraPCs[camId]
  if (pc) {
    pc.close()
    delete cameraPCs[camId]
  }
  // Clear video
  const videoEl = cameraVideoRefs[camId]
  if (videoEl) {
    videoEl.srcObject = null
    delete cameraVideoRefs[camId]
  }
  // Remove window
  cameraWindows.value = cameraWindows.value.filter(c => c.id !== camId)
}

const stopAllCameraStreams = () => {
  Object.keys(cameraWSs).forEach(stopCameraStream)
}
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
const screenKbps = ref(0)
const latency = ref(0)
/** 浏览器 ↔ 服务器 RTT（client_ping，不经 Agent） */
const latencyServer = ref(0)
/** 按下未抬起时的触点提示（与「Web 端点击效果」独立，始终可显示） */
const pressPreview = ref(null)
let touchStartPos = null
let effectIdCounter = 0
let recordingTimer = null
let frameCount = 0
let screenFrameBytes = 0
let screenStatsPrevBytes = 0
let screenStatsPrevTs = 0
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
    recordScreenFrame(u8.length)
  } catch (_) { /* noop */ }
}

function startScreenStatsTimer() {
  if (fpsTimer) return
  frameCount = 0
  screenFrameBytes = 0
  screenStatsPrevBytes = 0
  screenStatsPrevTs = Date.now()
  fpsTimer = setInterval(() => {
    const now = Date.now()
    fps.value = frameCount
    frameCount = 0
    const dt = (now - screenStatsPrevTs) / 1000
    if (dt > 0) {
      const delta = screenFrameBytes - screenStatsPrevBytes
      screenKbps.value = Math.max(0, Math.round(delta * 8 / dt / 1000))
    }
    screenStatsPrevBytes = screenFrameBytes
    screenStatsPrevTs = now
  }, 1000)
}

function stopScreenStatsTimer() {
  if (fpsTimer) {
    clearInterval(fpsTimer)
    fpsTimer = null
  }
  fps.value = 0
  screenKbps.value = 0
  frameCount = 0
  screenFrameBytes = 0
  screenStatsPrevBytes = 0
  screenStatsPrevTs = 0
}

function recordScreenFrame(byteLen) {
  if (byteLen > 0) screenFrameBytes += byteLen
  frameCount++
  startScreenStatsTimer()
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
  recordScreenFrame(u8.length)
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

const screenResolutionText = computed(() => {
  const s = streamResolution.value
  if (s?.width > 0 && s?.height > 0) return `${s.width}×${s.height}`
  const d = deviceResolution.value
  if (d?.width > 0 && d?.height > 0) return `${d.width}×${d.height}`
  return '—'
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
let recordingListenerId = null
let profileListenerId = null

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
  if (recordingListenerId) {
    const rid = recordingListenerId
    recordingListenerId = null
    eventListeners.revoke(rid)
    return
  }
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
      const d = devices.value.find((x) => String(x.id) === String(deviceId.value))
      const label = d?.name || d?.serial || `设备 #${deviceId.value}`
      recordingListenerId = eventListeners.registerRecordingListener({
        deviceId: deviceId.value,
        deviceLabel: label,
        sourceLabel: '屏幕查看',
        onRevoke: () => {
          try {
            client.deactivate()
          } catch (_) { /* noop */ }
          if (stompClient === client) stompClient = null
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
  stopScreenStatsTimer()
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
    stopScreenStatsTimer()
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
      return
    }
  }

  connectRecordingStomp()
}

function onScreenImgLoad() {
  const el = screenImg.value
  if (!el || el.naturalWidth <= 0 || el.naturalHeight <= 0) return
  deviceResolution.value = { width: el.naturalWidth, height: el.naturalHeight }
  updateCameraSidebarStyle()
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
  // 只响应实际画面区域内的点击，黑边区域不触发
  const pic = getVideoPictureRect()
  if (pic) {
    const { x: cx, y: cy } = pointerClientXY(e)
    if (cx < pic.picLeft || cx > pic.picLeft + pic.picW || cy < pic.picTop || cy > pic.picTop + pic.picH) return
  }
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

watch(
  () => [deviceId.value, shareMode.value, auth.token],
  () => {
    if (profileListenerId) {
      eventListeners.revoke(profileListenerId)
      profileListenerId = null
    }
    if (shareMode.value || !auth.token || !deviceId.value) return
    const d = devices.value.find((x) => String(x.id) === String(deviceId.value))
    const label = d?.name || d?.serial || `设备 #${deviceId.value}`
    profileListenerId = eventListeners.attachProfileListener({
      sourceLabel: '屏幕查看',
      deviceScopeId: deviceId.value,
      deviceScopeLabel: label,
      onEvent: () => loadScreenDevice()
    })
  },
  { immediate: true }
)

let sidebarResizeObserver = null

onMounted(async () => {
  document.addEventListener('fullscreenchange', syncNativeFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncNativeFullscreenState)
  sidebarResizeObserver = new ResizeObserver(() => updateCameraSidebarStyle())
  if (videoWrap.value) sidebarResizeObserver.observe(videoWrap.value)
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
})

// 发送虚拟按键
// keycode → Agent 无障碍导航键映射（仅这三类可用 performGlobalAction，无需 ADB）
const NAV_KEY_BY_KEYCODE = { 4: 'back', 3: 'home', 187: 'recents' }

const sendKeyEvent = async (keycode) => {
  if (!deviceId.value) return
  // Agent 在线且是导航键时，优先走无障碍通道（纯 Agent 设备无 ADB 也能用）；失败再回退 ADB
  const navKey = NAV_KEY_BY_KEYCODE[keycode]
  if (navKey && screenDevice.value?.agent_connected) {
    try {
      await deviceApi.agentNavKey(deviceId.value, navKey)
      return
    } catch (e) {
      // 无障碍未启用等情况，回退到 ADB keyevent
    }
  }
  try {
    await deviceApi.keyEvent(deviceId.value, keycode)
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '按键发送失败')
  }
}

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
    const res = await fetch(`/api/devices/${deviceId.value}/adb/screenshot`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '截图失败')
    ElMessage.success('截图已保存到服务器')
    loadRecordings()
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

  const hubRes = await fetch(`/api/devices/${deviceId.value}/file-hub`, {
    headers: { 'Authorization': `Bearer ${auth.token}` }
  })
  const hubData = await hubRes.json()
  screenshots.value = (hubData.data?.media || []).filter(m => m.category === 'screenshot')
}

const recordingStreamUrl = (id) => {
  const t = encodeURIComponent(auth.token || '')
  return `/api/recordings/${id}/stream?token=${t}`
}

const openRecordingPlayer = async (id) => {
  if (mediaViewMode.value === 'tab') {
    window.open(`/api/recordings/${id}/stream?token=${auth.token}`, '_blank')
    return
  }
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

const viewScreenshot = (id) => {
  if (mediaViewMode.value === 'tab') {
    window.open(`/api/device-media/${id}/stream?token=${auth.token}`, '_blank')
    return
  }
  screenshotPreviewUrl.value = `/api/device-media/${id}/stream?token=${auth.token}`
  screenshotPreviewVisible.value = true
}

const openScreenshotInTab = () => {
  window.open(screenshotPreviewUrl.value, '_blank')
}

const toggleMediaViewMode = () => {
  mediaViewMode.value = mediaViewMode.value === 'dialog' ? 'tab' : 'dialog'
  localStorage.setItem('screen-media-view-mode', mediaViewMode.value)
}
const toggleCameraDisplayMode = () => {
  cameraDisplayMode.value = cameraDisplayMode.value === 'overlay' ? 'sidebar' : 'overlay'
  localStorage.setItem('screen-camera-display-mode', cameraDisplayMode.value)
}

const downloadScreenshot = (id, fileName) => {
  window.open(`/api/device-media/${id}/download?token=${auth.token}`, '_blank')
}

const deleteScreenshot = async (id) => {
  await fetch(`/api/device-media/${id}`, {
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
  sidebarResizeObserver?.disconnect()
  if (profileListenerId) {
    eventListeners.revoke(profileListenerId)
    profileListenerId = null
  }
  closeAll()
  stopAllCameraStreams()
})
</script>
