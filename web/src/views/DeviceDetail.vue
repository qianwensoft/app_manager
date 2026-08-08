<template>
  <div v-if="device">
    <el-tabs v-model="activeMainTab" @tab-change="onMainTabChange" class="device-detail-tabs">
      <el-tab-pane label="设备信息" name="info">
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="设备 ID">{{ device.id }}</el-descriptions-item>
          <el-descriptions-item label="Serial">{{ device.serial || '—' }}</el-descriptions-item>
          <el-descriptions-item label="硬件串号" :span="isMobile ? 1 : 2">
            {{ device.android_serial || '—' }}
            <el-text v-if="!device.android_serial" type="info" size="small" style="margin-left:8px">由 Agent 上报后显示</el-text>
          </el-descriptions-item>
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
          <el-descriptions-item label="Agent Token" :span="isMobile ? 1 : 2">
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

        <el-card
          v-if="!device.agent_connected"
          shadow="never"
          class="agent-reconnect-card"
        >
          <template #header>
            <span class="agent-reconnect-card-title">Agent 离线 · 扫码继续接入</span>
          </template>
          <template v-if="device.agent_token">
            <p class="agent-reconnect-desc">
              手机重装 Agent、清除数据或换机后，用 Agent 应用扫描下方二维码，将自动填入<strong>本设备已绑定的 Token</strong>与当前页面对应的 WebSocket 地址；连接成功后仍为同一台设备（服务端按硬件串号等与现有记录合并）。
            </p>
            <div class="agent-reconnect-qr-row">
              <canvas ref="reconnectQrCanvas" class="agent-reconnect-canvas" />
              <div class="agent-reconnect-meta">
                <p><span class="lbl">WebSocket 基址</span><code class="mono">{{ WS_BASE }}</code></p>
                <p><span class="lbl">Token</span><code class="mono tok">{{ device.agent_token }}</code></p>
                <el-space wrap>
                  <el-button type="primary" size="small" plain @click="copyAgentReconnectJson">复制接入 JSON</el-button>
                  <el-button size="small" @click="renderReconnectQr">刷新二维码</el-button>
                </el-space>
              </div>
            </div>
          </template>
          <template v-else>
            <el-alert type="info" :closable="false" show-icon title="尚未绑定 Agent Token">
              <p class="agent-reconnect-desc" style="margin: 0">
                请先到
                <router-link to="/qrcode">全局扫码接入</router-link>
                生成 Token，再在本页「设备管理」中粘贴保存；保存后即可在此处生成重装扫码。
              </p>
            </el-alert>
          </template>
        </el-card>

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

        <el-descriptions v-if="speedResult" :column="isMobile ? 1 : 2" border style="margin-top:12px;max-width:640px" title="最近一次测速（服务器 ↔ Agent）">
          <el-descriptions-item label="WS 往返 (RTT)">{{ speedResult.rtt_ms != null ? `${speedResult.rtt_ms} ms` : '-' }}</el-descriptions-item>
          <el-descriptions-item label="下行">
            <template v-if="speedResult.download_ms != null">{{ fmtMbps(speedResult.download_mbps) }}（{{ speedResult.download_ms }} ms / {{ fmtBytes(speedResult.download_bytes) }}）</template>
            <template v-else>-</template>
          </el-descriptions-item>
          <el-descriptions-item label="上行">
            <template v-if="speedResult.upload_ms != null">{{ fmtMbps(speedResult.upload_mbps) }}（{{ speedResult.upload_ms }} ms / {{ fmtBytes(speedResult.upload_bytes) }}）</template>
            <template v-else>-</template>
          </el-descriptions-item>
          <el-descriptions-item v-if="speedResult.error" label="说明" :span="isMobile ? 1 : 2">
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

      <el-tab-pane label="事件与出站" name="events">
        <div style="max-width: 960px">
          <el-card shadow="never" class="events-out-card">
            <template #header>
              <span>自定义事件监听</span>
              <el-button
                v-if="canMutate"
                text
                type="primary"
                size="small"
                style="float: right; margin-top: -2px"
                :loading="deviceListenLoading"
                @click="loadDeviceListenState"
              >
                刷新
              </el-button>
            </template>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 12px"
              title="说明"
              description="与「自定义事件中心」一致：启用会按当前已选规则向本机 Agent 下发监听；停用会下发停止并标记未激活；删除会向 Agent 下发停止监听并移除本机监听快照。"
            />
            <el-table :data="deviceListenTableData" border size="small" v-loading="deviceListenLoading" empty-text="暂无监听记录">
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.active" type="success" size="small">激活</el-tag>
                  <el-tag v-else type="info" size="small">未激活</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="上报键 / 事件" min-width="220">
                <template #default="{ row }">
                  <el-tag v-for="k in row.event_keys || []" :key="k" size="small" style="margin: 2px 4px 2px 0">
                    {{ k }}
                  </el-tag>
                  <span v-if="!(row.event_keys || []).length">—</span>
                </template>
              </el-table-column>
              <el-table-column prop="updated_at" label="更新时间" width="178" />
              <el-table-column v-if="canMutate" label="操作" width="220" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" :disabled="row.active" @click="startDeviceCustomListen">启用</el-button>
                  <el-button link type="warning" size="small" :disabled="!row.active" @click="stopDeviceCustomListen">停用</el-button>
                  <el-button link type="danger" size="small" @click="deleteDeviceCustomListen">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="canMutate && !deviceListenSnapshot && !deviceListenLoading" style="margin-top: 12px">
              <el-button type="primary" @click="startDeviceCustomListen">启用监听</el-button>
            </div>
          </el-card>

          <el-card shadow="never" class="events-out-card" style="margin-top: 16px">
            <template #header>
              <span>事件分析</span>
              <el-tag v-if="eventAnalysisActive" type="warning" size="small" style="float: right; margin-top: 2px">
                分析中
              </el-tag>
            </template>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 12px"
              title="自动识别扫码广播"
              description="点击「开始分析」后，请在设备上连续扫码 2～3 次。Agent 将捕获广播 Action 与 Extra 键，经 STOMP 实时推送匹配建议（与 ADB logcat 分析流程一致）。分析期间会暂停正式监听。"
            />
            <el-form label-width="88px" size="small" style="margin-bottom: 12px" :disabled="eventAnalysisActive">
              <el-form-item label="探针模式">
                <el-radio-group v-model="eventAnalysisProbeMode">
                  <el-radio value="preset">预设探针</el-radio>
                  <el-radio value="custom">自定义探针</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="eventAnalysisProbeMode === 'custom'" label="Action">
                <el-select
                  v-model="eventAnalysisProbeActions"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="输入广播 Action，如 com.se4500.onDecodeComplete 或 com.se4500.*"
                  style="width: 100%"
                />
                <div style="font-size: 12px; color: #909399; margin-top: 4px">
                  支持精确 Action 与通配：<code>com.vendor.*</code>、<code>*</code>（匹配预设目录内全部动作）
                </div>
              </el-form-item>
            </el-form>
            <el-space wrap style="margin-bottom: 12px">
              <el-button
                v-if="canMutate"
                type="primary"
                :loading="eventAnalysisLoading"
                :disabled="eventAnalysisActive || !device.agent_connected"
                @click="startEventAnalysis"
              >
                开始分析
              </el-button>
              <el-button
                v-if="canMutate && eventAnalysisActive"
                type="warning"
                :loading="eventAnalysisLoading"
                @click="stopEventAnalysis"
              >
                结束分析
              </el-button>
              <el-button
                v-if="canMutate && eventAnalysisSuggestions.length"
                type="success"
                :disabled="eventAnalysisActive"
                @click="applyEventAnalysisSuggestions"
              >
                应用推荐监听
              </el-button>
            </el-space>
            <div v-if="!device.agent_connected" style="font-size: 12px; color: #e6a23c; margin-bottom: 8px">
              需 Agent 在线才能下发探针。
            </div>
            <div v-if="eventAnalysisActive || eventAnalysisScanCount > 0" style="font-size: 12px; color: #606266; margin-bottom: 8px">
              已捕获扫码 <strong>{{ eventAnalysisScanCount }}</strong> 次
              <span v-if="eventAnalysisMinScans > 0">（建议 ≥ {{ eventAnalysisMinScans }} 次）</span>
              <span v-if="eventAnalysisSessionId" style="margin-left: 8px; color: #909399">会话 {{ eventAnalysisSessionId.slice(0, 8) }}…</span>
              <span v-if="eventAnalysisProbeMode === 'custom' && eventAnalysisProbePatterns.length" style="margin-left: 8px; color: #909399">
                探针 {{ eventAnalysisProbePatterns.join('、') }}
              </span>
            </div>
            <el-table
              :data="eventAnalysisObservations"
              border
              size="small"
              empty-text="暂无观测；开始分析后在设备上扫码"
              style="margin-bottom: 12px"
            >
              <el-table-column prop="intent_action" label="广播 Action" min-width="220" show-overflow-tooltip />
              <el-table-column prop="extra_key" label="Extra 键" width="140" show-overflow-tooltip />
              <el-table-column label="样例值" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ (row.sample_values || [])[0] || '—' }}
                </template>
              </el-table-column>
              <el-table-column prop="hit_count" label="次数" width="72" align="center" />
            </el-table>
            <div v-if="eventAnalysisSuggestions.length" style="font-size: 13px; font-weight: 500; margin-bottom: 8px">匹配建议</div>
            <el-table
              v-if="eventAnalysisSuggestions.length"
              :data="eventAnalysisSuggestions"
              border
              size="small"
              empty-text="暂无匹配定义"
            >
              <el-table-column prop="name" label="事件定义" min-width="160" show-overflow-tooltip />
              <el-table-column prop="key" label="上报键" width="160" show-overflow-tooltip />
              <el-table-column prop="score" label="匹配分" width="80" align="center" />
              <el-table-column label="命中组合" min-width="200">
                <template #default="{ row }">
                  <el-tag v-for="p in (row.matched_pairs || []).slice(0, 2)" :key="p" size="small" style="margin: 2px 4px 2px 0">
                    {{ p }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" class="events-out-card" style="margin-top: 16px">
            <template #header>
              <span>连接器（本机）</span>
              <el-button
                v-if="canMutate"
                text
                type="primary"
                size="small"
                style="float: right; margin-top: -2px"
                :loading="outboundLoading"
                @click="loadOutboundConnectorsForDevice"
              >
                刷新
              </el-button>
            </template>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 12px"
              title="说明"
              description="仅列出对本机生效的连接器（未限制设备或已勾选本机）。启用：清除暂停/排除；停用：本机暂停出站；删除：排除本机直至再次启用。与「出站」页一致。"
            />
            <el-table :data="outboundConnectorRows" border size="small" v-loading="outboundLoading" empty-text="无适用连接器">
              <el-table-column prop="id" label="ID" width="72" align="center" />
              <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
              <el-table-column label="本机状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row._state === 'active'" type="success" size="small">正常</el-tag>
                  <el-tag v-else-if="row._state === 'paused'" type="warning" size="small">已暂停</el-tag>
                  <el-tag v-else type="info" size="small">已排除</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="全局启用" width="88" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="canMutate" label="操作" width="200" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" :disabled="row._state === 'active'" @click="outboundDeviceEnable(row)">启用</el-button>
                  <el-button
                    link
                    type="warning"
                    size="small"
                    :disabled="row._state === 'paused' || row._state === 'excluded'"
                    @click="outboundDevicePause(row)"
                  >
                    停用
                  </el-button>
                  <el-button link type="danger" size="small" :disabled="row._state === 'excluded'" @click="outboundDeviceExclude(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
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
            <div style="font-weight:600;margin-bottom:8px">Agent 文件</div>
            <el-alert
              v-if="!device?.agent_connected"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom:12px"
              title="Agent 未在线"
              description="需 Agent 在线才可列出与上传文件。"
            />
            <el-alert
              v-else
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom:12px"
              title="权限提示"
              description="Android 10+ 受系统限制，可能无法写入 /sdcard/Download 等公共目录。建议优先使用 app://external_files（应用专属目录）。访问 /data/data 等私有目录通常会被拒绝。"
            />

            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px">
              <el-select v-model="agentFsPath" filterable allow-create placeholder="输入路径" style="width: 360px" size="small" @change="loadAgentFs">
                <el-option v-for="p in agentFsQuickRoots" :key="p" :label="p" :value="p" />
              </el-select>
              <el-checkbox v-model="agentFsIncludeHidden" size="small" @change="loadAgentFs">显示隐藏文件</el-checkbox>
              <el-button size="small" :loading="agentFsLoading" :disabled="!device?.agent_connected" @click="loadAgentFs">刷新</el-button>
              <el-upload
                :show-file-list="false"
                :disabled="!device?.agent_connected || agentFsUploading"
                :http-request="uploadAgentFileToCurrentPath"
              >
                <el-button size="small" type="primary" :loading="agentFsUploading" :disabled="!device?.agent_connected">
                  上传到当前目录
                </el-button>
              </el-upload>
              <el-text v-if="agentFsUploadHint" type="warning" size="small">{{ agentFsUploadHint }}</el-text>
            </div>

            <el-progress
              v-if="agentFsUploading"
              :percentage="agentFsUploadPct"
              :status="agentFsUploadStatus"
              style="margin: 6px 0 12px"
            />

            <el-table
              :data="agentFsEntries"
              border
              size="small"
              v-loading="agentFsLoading"
              empty-text="暂无内容"
            >
              <el-table-column label="名称" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <el-button v-if="row.type === 'dir'" link type="primary" @click="enterAgentDir(row.name)">
                    {{ row.name }}
                  </el-button>
                  <span v-else>{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="80" />
              <el-table-column label="大小" width="120">
                <template #default="{ row }">{{ row.type === 'file' ? formatFileSize(row.size) : '-' }}</template>
              </el-table-column>
              <el-table-column label="修改时间" width="180">
                <template #default="{ row }">{{ formatFileDate(row.mtime) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="row.type === 'file' && isImageFile(row.name)" link type="primary" size="small" @click="previewAgentFile(row)">
                    预览
                  </el-button>
                  <el-button v-else-if="row.type === 'file' && isVideoFile(row.name)" link type="primary" size="small" @click="previewAgentFile(row)">
                    播放
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

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
              <el-table-column v-if="canMutate" label="操作" width="240" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="renameMediaRow(row)">重命名</el-button>
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
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <el-button :type="isRecording ? 'danger' : 'success'" @click="toggleRecording" :disabled="!canMutate">
                {{ isRecording ? '停止录音' : '开始录音' }}
              </el-button>
              <el-text v-if="isRecording" type="danger">录音中 {{ recordingDuration }}s</el-text>
              <el-upload
                :http-request="onAudioUpload"
                :show-file-list="false"
                accept=".m4a,.mp3,.wav,.aac,.ogg,.flac"
                :disabled="audioUploading || !canMutate"
              >
                <el-button type="primary" :loading="audioUploading" :disabled="!canMutate">上传音频</el-button>
              </el-upload>
            </div>
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
              <el-table-column v-if="canMutate" label="操作" width="240" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="renameMediaRow(row)">重命名</el-button>
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
          <el-select v-model="appTypeFilter" placeholder="应用类型" style="width:120px" clearable>
            <el-option label="全部" value="" />
            <el-option label="用户应用" value="user" />
            <el-option label="系统应用" value="system" />
          </el-select>
          <el-button :loading="appsRefreshing" :disabled="!device?.agent_connected" @click="refreshAppsFromAgent">
            从 Agent 刷新
          </el-button>
          <el-button
            v-if="canMutate"
            type="primary"
            :disabled="selectedApps.length === 0"
            @click="batchExportApps"
          >
            导出选中应用 ({{ selectedApps.length }})
          </el-button>
        </el-space>
        <div v-if="device?.agent_connected" style="font-size:12px;color:#909399;margin:-4px 0 8px">
          列表含系统应用；安装/卸载后请点「从 Agent 刷新」。下载 APK 依赖系统是否允许读取安装包路径，失败时请用 ADB 或 Root 环境。
        </div>
        <el-table
          :data="filteredApps"
          border
          height="500"
          @selection-change="handleAppSelectionChange"
        >
          <el-table-column type="selection" width="55" />
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

      <el-tab-pane label="ADB 管理" name="adb">
        <el-space direction="vertical" alignment="stretch" :size="16" style="width:100%;max-width:860px">

          <!-- USB ADB 状态 -->
          <el-card shadow="never">
            <template #header>
              <span style="font-weight:600">USB ADB</span>
            </template>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span style="color:#606266;white-space:nowrap">Serial：</span>
              <code v-if="usbSerial" style="font-family:monospace;background:#f4f4f5;padding:2px 8px;border-radius:4px">{{ usbSerial }}</code>
              <el-text v-else type="info" size="small">暂无 USB Serial（纯 Agent 或无线设备）</el-text>
              <el-tag
                v-if="wirelessAdb.adbStatus.usb"
                :type="usbStateType(wirelessAdb.adbStatus.usb.state)"
                size="small"
              >{{ usbStateLabel(wirelessAdb.adbStatus.usb.state) }}</el-tag>
              <el-button size="small" :loading="wirelessAdb.adbStatusLoading" @click="wirelessAdb.refreshAdbStatus">检测状态</el-button>
            </div>
          </el-card>

          <!-- 无线 ADB -->
          <el-card shadow="never">
            <template #header>
              <span style="font-weight:600">无线 ADB</span>
            </template>
            <WirelessAdbPanel :device-id="route.params.id" />
          </el-card>

          <!-- ADB 工具 -->
          <el-card shadow="never">
            <template #header><span style="font-weight:600">ADB 工具</span></template>

            <!-- 授权 READ_LOGS -->
            <el-divider content-position="left" style="margin-top:0">授权日志权限</el-divider>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
              <el-button :loading="wirelessAdb.grantingReadLogs" @click="wirelessAdb.doGrantReadLogs">
                授权 Agent READ_LOGS
              </el-button>
              <el-text type="info" size="small">
                允许 Agent 读取系统全量日志（需已建立 ADB 连接）
              </el-text>
            </div>
            <el-alert
              v-if="wirelessAdb.grantReadLogsResult"
              :type="wirelessAdb.grantReadLogsSuccess ? 'success' : 'error'"
              :title="wirelessAdb.grantReadLogsResult"
              :closable="true"
              show-icon
              style="margin-top:4px;margin-bottom:8px"
              @close="wirelessAdb.grantReadLogsResult = ''"
            />

            <!-- Shell Runner -->
            <el-divider content-position="left">ADB Shell</el-divider>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <el-input
                v-model="shellCommand"
                placeholder="输入命令，例如：ls /sdcard"
                clearable
                style="flex:1"
                @keyup.enter="runShellCommand"
              />
              <el-button
                type="primary"
                :loading="shellRunning"
                :disabled="!shellCommand.trim()"
                @click="runShellCommand"
              >执行</el-button>
              <el-button @click="shellOutput = null; shellCommand = ''">清空</el-button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
              <span style="font-size:12px;color:#909399;align-self:center">快捷：</span>
              <el-button size="small" text type="primary" @click="shellCommand = 'getprop ro.product.model'">型号</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'pm list packages -3'">第三方应用</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'df -h /data'">存储空间</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'dumpsys battery'">电池信息</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'wm size'">屏幕分辨率</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'ip addr show wlan0'">WLAN 地址</el-button>
              <el-button size="small" text type="primary" @click="shellCommand = 'settings list global | grep adb'">ADB 设置</el-button>
            </div>
            <el-input
              v-if="shellOutput !== null"
              v-model="shellOutput"
              type="textarea"
              :rows="10"
              readonly
              style="font-family:monospace;font-size:12px"
              placeholder="命令输出将显示在这里"
            />
          </el-card>

        </el-space>
      </el-tab-pane>

      <el-tab-pane label="设备管理" name="manage">
        <el-form :model="editForm" label-width="100px" style="max-width:500px">
          <el-form-item label="设备别名">
            <el-input v-model="editForm.server_alias" placeholder="可选" />
          </el-form-item>
          <el-form-item label="分组">
            <el-input v-model="editForm.group_name" placeholder="可选" />
          </el-form-item>
          <el-form-item label="名称">
            <el-input v-model="editForm.name" />
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

      <!-- MDM 管理 -->
      <el-tab-pane label="MDM 管理" name="mdm">
        <div v-loading="mdmLoading" style="padding:4px 0">

          <!-- 模式开关 + 企业绑定 -->
          <el-card shadow="never" style="margin-bottom:16px">
            <template #header>
              <span style="font-weight:600">MDM 模式</span>
              <el-tag v-if="mdmConfig.mdm_enabled" type="success" size="small" style="margin-left:8px">已开启</el-tag>
              <el-tag v-else type="info" size="small" style="margin-left:8px">未开启</el-tag>
            </template>
            <el-form label-width="100px" size="small">
              <el-form-item label="MDM 模式">
                <el-switch
                  v-model="mdmConfig.mdm_enabled"
                  :disabled="!canMutate"
                  @change="saveMdmConfig"
                />
                <span style="margin-left:10px;color:#909399;font-size:12px">
                  开启后可使用 NTP 配置、设备策略等 MDM 功能
                </span>
              </el-form-item>
              <el-form-item label="关联企业">
                <el-select
                  v-model="mdmConfig.enterprise_id"
                  placeholder="选择企业标识（可选）"
                  clearable
                  :disabled="!canMutate"
                  style="width:260px"
                  @change="saveMdmConfig"
                >
                  <el-option
                    v-for="e in mdmEnterprises"
                    :key="e.id"
                    :label="`${e.name}（${e.code}）`"
                    :value="e.id"
                  />
                </el-select>
              </el-form-item>
            </el-form>

            <!-- DO 激活提示：MDM 开启且 DO 未激活时，显示在模式卡内 -->
            <div
              v-if="mdmConfig.mdm_enabled && mdmCapabilities && !mdmCapabilities.is_device_owner"
              style="margin-top:8px;display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1px solid #bee3f8;border-radius:6px;padding:8px 12px"
            >
              <el-icon color="#409eff" size="16"><InfoFilled /></el-icon>
              <span style="flex:1;font-size:12px;color:#1a56db">
                激活 Device Owner 可解锁全部高级策略（相机/截屏/密码/擦除等）
              </span>
              <el-button size="small" type="primary" plain @click="showDoActivationGuide">
                🔳 生成激活二维码
              </el-button>
            </div>
          </el-card>

          <!-- 能力矩阵 -->
          <el-card shadow="never" style="margin-bottom:16px">
            <template #header>
              <span style="font-weight:600">当前设备 MDM 能力</span>
              <el-button
                v-if="canMutate"
                size="small"
                :loading="mdmSyncing"
                style="margin-left:12px"
                @click="syncMdmStatus"
              >同步能力</el-button>
              <span v-if="mdmConfig.last_sync_at" style="margin-left:12px;color:#909399;font-size:12px">
                最后同步：{{ mdmConfig.last_sync_at }}
              </span>
            </template>

            <div v-if="!mdmCapabilities" style="color:#909399;font-size:13px;padding:8px 0">
              尚未同步，点击「同步能力」获取设备最新 MDM 权限状态。
            </div>
            <div v-else style="display:flex;flex-wrap:wrap;gap:12px">
              <el-tag
                v-for="cap in mdmCapabilityList"
                :key="cap.key"
                :type="cap.value ? 'success' : 'danger'"
                effect="light"
                size="large"
                style="padding:8px 14px"
              >
                <el-icon style="margin-right:4px">
                  <component :is="cap.value ? 'CircleCheck' : 'CircleClose'" />
                </el-icon>
                {{ cap.label }}
              </el-tag>
            </div>

            <!-- Device Owner 提示 -->
            <el-alert
              v-if="mdmCapabilities && !mdmCapabilities.is_device_owner"
              type="warning"
              :closable="false"
              show-icon
              style="margin-top:12px"
              title="Device Owner 未激活"
              description="部分高级 MDM 功能（密码策略、禁用相机、远程擦除等）需要将本 Agent 设为 Device Owner。请在设备初始化阶段通过 QR 码注册或 ADB 命令激活。"
            />
            <el-alert
              v-if="mdmCapabilities && !mdmCapabilities.has_write_secure_settings"
              type="info"
              :closable="false"
              show-icon
              style="margin-top:8px"
              title="WRITE_SECURE_SETTINGS 未授权"
              :description="`NTP 写入、系统全局设置修改等功能需要此权限，可通过 ADB 一次性授权：adb shell pm grant com.appmanager.agent android.permission.WRITE_SECURE_SETTINGS`"
            />
          </el-card>

          <!-- NTP 配置 -->
          <el-card v-if="mdmConfig.mdm_enabled" shadow="never">
            <template #header>
              <span style="font-weight:600">NTP 服务器配置</span>
              <el-button
                v-if="canMutate"
                size="small"
                :loading="ntpFetching"
                style="margin-left:12px"
                @click="fetchNtpConfig"
              >从设备读取</el-button>
            </template>
            <el-form :model="ntpForm" label-width="120px" size="small" style="max-width:480px">
              <el-form-item label="NTP 服务器">
                <el-input v-model="ntpForm.ntp_server" placeholder="如：pool.ntp.org" :disabled="!canMutate" />
              </el-form-item>
              <el-form-item label="超时（ms）">
                <el-input-number
                  v-model="ntpForm.ntp_timeout"
                  :min="1000"
                  :max="60000"
                  :step="1000"
                  :disabled="!canMutate"
                  style="width:160px"
                />
              </el-form-item>
              <el-form-item v-if="canMutate">
                <el-button type="primary" :loading="ntpSaving" @click="saveNtpConfig">下发到设备</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <!-- ── Device Owner 高级策略管理 ── -->
          <el-card
            v-if="mdmConfig.mdm_enabled"
            shadow="never"
            style="margin-top:16px"
          >
            <template #header>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:600;font-size:14px">🛡️ 高级策略管理</span>
                <el-tag v-if="mdmCapabilities?.is_device_owner" type="success" size="small">Device Owner ✓</el-tag>
                <el-tag v-else type="warning" size="small">Device Owner 未激活（高级策略禁用）</el-tag>
                <span style="flex:1" />
                <span v-if="policySnapshot" style="font-size:12px;color:#909399">
                  已同步 {{ policySnapshotTime }}
                </span>
                <el-button size="small" :loading="snapshotLoading" @click="doGetPolicySnapshot">
                  🔄 同步状态
                </el-button>
                <el-button
                  v-if="mdmCapabilities?.is_device_owner && canMutate"
                  size="small" type="warning" plain
                  :loading="clearingPolicies"
                  @click="doClearAllPolicies"
                >
                  🧹 清除所有策略
                </el-button>
                <el-button
                  v-if="mdmCapabilities?.is_device_owner && auth.user?.role === 'admin'"
                  size="small" type="danger" plain
                  :loading="revokingDO"
                  @click="doRevokeDO"
                >
                  ⚠️ 撤销 Device Owner
                </el-button>
              </div>
            </template>

            <!-- 策略列表表格 -->
            <el-table
              :data="policyRows"
              border
              size="small"
              v-loading="snapshotLoading"
              style="margin-bottom:12px"
              :row-class-name="({row}) => row.danger ? 'policy-row-danger' : ''"
            >
              <!-- 策略名称 -->
              <el-table-column label="策略" width="160" show-overflow-tooltip>
                <template #default="{ row }">
                  <span>{{ row.icon }} {{ row.label }}</span>
                </template>
              </el-table-column>

              <!-- 当前状态 -->
              <el-table-column label="当前状态" width="200">
                <template #default="{ row }">
                  <el-tag
                    v-if="row.statusTag"
                    :type="row.statusTag.type"
                    size="small"
                  >{{ row.statusTag.text }}</el-tag>
                  <span v-else style="color:#c0c4cc;font-size:12px">未同步</span>
                </template>
              </el-table-column>

              <!-- 快捷操作 -->
              <el-table-column label="操作" min-width="300">
                <template #default="{ row }">
                  <component :is="'div'" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">

                    <!-- 开关类：相机/截屏 -->
                    <template v-if="row.type === 'toggle'">
                      <el-switch
                        v-model="row.value"
                        :disabled="!canMutate || row.saving || (row.requiresDO && !mdmCapabilities?.is_device_owner)"
                        :active-text="row.activeText || '禁用'"
                        :inactive-text="row.inactiveText || '正常'"
                        @change="(v) => row.onChange(v)"
                      />
                    </template>

                    <!-- 锁屏/重启 快捷按钮 -->
                    <template v-else-if="row.type === 'action'">
                      <el-button
                        v-for="act in row.actions"
                        :key="act.label"
                        size="small"
                        :type="act.type || 'default'"
                        :loading="act.loading && act.loading.value"
                        :disabled="!canMutate || (row.requiresDO && !mdmCapabilities?.is_device_owner)"
                        @click="act.handler"
                      >{{ act.label }}</el-button>
                    </template>

                    <!-- 密码策略 -->
                    <template v-else-if="row.type === 'password'">
                      <el-select v-model="pwdPolicy.quality" size="small" style="width:130px" :disabled="!canMutate">
                        <el-option label="不限制" value="none" />
                        <el-option label="纯数字" value="numeric" />
                        <el-option label="字母" value="alphabetic" />
                        <el-option label="字母+数字" value="alphanumeric" />
                        <el-option label="复杂" value="complex" />
                      </el-select>
                      <el-input-number v-model="pwdPolicy.minLength" :min="0" :max="16" size="small" style="width:90px" :disabled="!canMutate" />
                      <el-button size="small" type="primary" :loading="pwdSaving" :disabled="!canMutate" @click="applyPasswordPolicy">下发</el-button>
                    </template>

                    <!-- Kiosk 模式 -->
                    <template v-else-if="row.type === 'kiosk'">
                      <el-input v-model="kioskForm.packages" size="small" placeholder="com.example.kiosk" style="width:180px" :disabled="!canMutate" />
                      <el-button size="small" :loading="kioskAppLoading" @click="openKioskAppPicker">📱 选择</el-button>
                      <el-button size="small" type="primary" :loading="kioskSaving" :disabled="!canMutate" @click="enableKiosk">启用</el-button>
                      <el-button size="small" :loading="kioskSaving" :disabled="!canMutate" @click="disableKiosk">退出</el-button>
                    </template>

                    <!-- 时区 -->
                    <template v-else-if="row.type === 'timezone'">
                      <el-input v-model="timeForm.timezone" size="small" placeholder="Asia/Shanghai" style="width:150px" :disabled="!canMutate" />
                      <el-button size="small" type="primary" :loading="timeSaving" :disabled="!canMutate" @click="applyDeviceTime">下发</el-button>
                    </template>

                    <!-- 应用管控（包名输入） -->
                    <template v-else-if="row.type === 'app'">
                      <el-input v-model="appRestrForm.packageName" size="small" placeholder="com.example.app" style="width:160px" :disabled="!canMutate" />
                      <el-switch v-model="appRestrForm.hidden" :disabled="!canMutate" active-text="隐藏" inactive-text="" />
                      <el-switch v-model="appRestrForm.uninstallBlocked" :disabled="!canMutate" active-text="禁卸载" inactive-text="" />
                      <el-button size="small" type="primary" :loading="appRestrSaving" :disabled="!canMutate" @click="applyAppRestriction">下发</el-button>
                    </template>

                    <!-- 危险操作 -->
                    <template v-else-if="row.type === 'danger'">
                      <el-button
                        v-if="auth.user?.role === 'admin' && canMutate"
                        size="small"
                        type="danger"
                        :loading="wipePreparing || wipeConfirming"
                        @click="startWipeFlow"
                      >擦除设备（恢复出厂）</el-button>
                    </template>

                  </component>
                </template>
              </el-table-column>
            </el-table>

            <!-- 用户限制 - 独立展开区 -->
            <el-collapse accordion style="border:1px solid #ebeef5;border-radius:4px">
              <el-collapse-item title="👤 用户限制（UserRestrictions）" name="ur">
                <div style="display:flex;flex-wrap:wrap;gap:8px 24px;padding:4px 0">
                  <el-checkbox
                    v-for="r in userRestrictionList"
                    :key="r.key"
                    v-model="r.enabled"
                    :disabled="!canMutate || urSaving"
                    @change="(v) => applyUserRestriction(r.key, v)"
                  >{{ r.label }}</el-checkbox>
                </div>
              </el-collapse-item>
            </el-collapse>
          </el-card>

        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 擦除设备确认对话框 -->
    <el-dialog v-model="wipeDialogVisible" title="⚠️ 擦除设备确认" width="420px" :close-on-click-modal="false">
      <p style="margin:0 0 12px;color:#606266">此操作将擦除设备所有数据并恢复出厂设置，<strong>不可撤销</strong>。</p>
      <p style="margin:0 0 8px">请输入设备型号「<strong>{{ device && device.model }}</strong>」进行确认：</p>
      <el-input v-model="wipeConfirmInput" :placeholder="device && device.model" clearable />
      <template #footer>
        <el-button @click="wipeDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="wipeConfirming"
          :disabled="wipeConfirmInput !== (device && device.model)"
          @click="doConfirmWipe">确认擦除</el-button>
      </template>
    </el-dialog>

    <!-- Device Owner 激活向导对话框 -->
    <el-dialog v-model="doGuideDialogVisible" title="🔳 Device Owner 激活向导" width="560px" destroy-on-close>
      <el-tabs>
        <!-- Tab 1: Agent 扫码激活（root 设备） -->
        <el-tab-pane label="📷 Agent 扫码激活（root 设备）">
          <div style="text-align:center;padding:12px 0">
            <img v-if="doQrDataUrl" :src="doQrDataUrl" style="width:200px;height:200px;border:1px solid #eee;border-radius:4px" />
            <div v-else style="width:200px;height:200px;background:#f5f7fa;display:inline-flex;align-items:center;justify-content:center;border-radius:4px">
              <span style="color:#909399">生成中...</span>
            </div>
            <div style="margin-top:12px;font-size:13px;color:#606266;line-height:1.8">
              1. 打开 Agent 主界面的 MDM 状态卡片<br>
              2. 点击「第二步」中的 <strong>📷 扫码激活</strong> 按钮<br>
              3. 扫描上方二维码，设备将自动尝试 root 激活<br>
              <span style="color:#e6a23c">⚠️ 仅适用于已获取 root 权限的设备</span>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 2: ADB 命令（通用） -->
        <el-tab-pane label="💻 ADB 命令（通用）">
          <div style="padding:12px 0">
            <div style="margin-bottom:10px;font-size:13px;color:#606266">
              在电脑上通过 USB ADB 执行（debug 包支持有账号激活）：
            </div>
            <div style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all">
              {{ doAdbCommand }}
            </div>
            <el-button size="small" style="margin-top:8px" @click="copyDoAdbCommand">📋 复制命令</el-button>
            <div style="margin-top:12px;font-size:13px;color:#606266">
              <strong>debug APK 安装命令：</strong>
              <div style="background:#1e1e1e;color:#d4d4d4;padding:8px 12px;border-radius:4px;font-family:monospace;font-size:12px;margin-top:6px">
                adb install -t &lt;agent-debug.apk&gt;
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 3: 出厂重置 DPC 二维码（新设备） -->
        <el-tab-pane label="🏭 出厂重置引导（新设备）">
          <div style="text-align:center;padding:12px 0">
            <img v-if="dpcQrDataUrl" :src="dpcQrDataUrl" style="width:200px;height:200px;border:1px solid #eee;border-radius:4px" />
            <div v-else style="width:200px;height:200px;background:#f5f7fa;display:inline-flex;align-items:center;justify-content:center;border-radius:4px">
              <span style="color:#909399">生成中...</span>
            </div>
            <div style="margin-top:12px;font-size:13px;color:#606266;line-height:1.8">
              1. 将设备<strong>恢复出厂设置</strong><br>
              2. 进入初始化向导，连续点击欢迎页面 <strong>6次</strong> 进入 QR 扫码模式<br>
              3. 扫描上方二维码，Android 会自动下载并安装 Agent 并设为 DO<br>
              <span style="color:#e6a23c">⚠️ 需要设备能访问服务器下载 APK</span>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- Kiosk 应用选择对话框 -->
    <el-dialog v-model="kioskAppPickerVisible" title="📱 选择 Kiosk 锁定应用" width="580px" destroy-on-close>
      <div v-if="kioskAppLoading" style="text-align:center;padding:24px">
        <el-icon class="is-loading" size="32"><Loading /></el-icon>
        <div style="margin-top:8px;color:#909399">正在获取设备应用列表...</div>
      </div>
      <template v-else>
        <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center">
          <el-input v-model="kioskAppSearch" placeholder="搜索包名 / 应用名" size="small" clearable style="flex:1" />
          <el-button size="small" @click="refreshKioskAppList" :disabled="!device?.agent_connected">
            🔄 从设备刷新
          </el-button>
          <span style="font-size:12px;color:#909399">
            {{ kioskDeviceApps.length }} 个应用，已选 {{ kioskSelectedApps.length }}
          </span>
        </div>
        <el-alert
          v-if="kioskDeviceApps.length === 0"
          type="info" :closable="false" show-icon style="margin-bottom:10px"
          title="未获取到应用列表"
          description="请点击「从设备刷新」从设备实时拉取已安装应用（需 Agent 在线）"
        />
        <el-table
          :data="kioskFilteredApps"
          size="small"
          max-height="360"
          @selection-change="kioskSelectedApps = $event"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="app_label" label="应用名" min-width="120" show-overflow-tooltip />
          <el-table-column prop="package_name" label="包名" min-width="180" show-overflow-tooltip />
          <el-table-column prop="version_name" label="版本" width="90" show-overflow-tooltip />
        </el-table>
      </template>
      <template #footer>
        <el-button @click="kioskAppPickerVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!kioskSelectedApps.length" @click="applyKioskAppSelection">
          确定（{{ kioskSelectedApps.length }} 个应用）
        </el-button>
      </template>
    </el-dialog>

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

    <el-dialog v-model="agentFilePreviewVisible" :title="agentFilePreviewName" :width="isMobile ? '96vw' : '80%'" destroy-on-close>
      <img v-if="agentFilePreviewType === 'image'" :src="agentFilePreviewUrl" style="max-width:100%;display:block;margin:0 auto" />
      <video v-else-if="agentFilePreviewType === 'video'" :src="agentFilePreviewUrl" controls playsinline style="max-width:100%;display:block;margin:0 auto" />
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { copyText } from '@/utils/clipboard'
import * as deviceApi from '@/api/device'
import * as appApi from '@/api/app'
import { useEventListenerStore } from '@/stores/eventListeners'
import { WS_BASE } from '@/utils/ws'
import http from '@/api/http'
import * as eventsApi from '@/api/events'
import * as ob from '@/api/outbound'
import * as mdmApi from '@/api/mdm'
import { createEventAnalysisStomp } from '@/utils/eventAnalysisStomp'
import QRCode from 'qrcode'
import WirelessAdbPanel from '@/components/WirelessAdbPanel.vue'
import { useWirelessAdb } from '@/composables/useWirelessAdb'
import { usePortalContext } from '@/composables/usePortalContext'
import { useIsMobile } from '@/composables/useIsMobile'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useIsMobile()
// 资源中心前台模式：详情操作按选中节点的 detail_perms 逐项显隐。
const { ctx: portalCtx, portalMode } = usePortalContext()
const portalDetailPerms = computed(() => {
  if (!portalMode.value || !portalCtx?.activeNode?.value) return null
  const n = portalCtx.activeNode.value
  return Array.isArray(n.detail_perms) ? n.detail_perms : []
})
// hasPortalPerm 在前台模式下判断某操作是否被授予；非前台模式恒 true。
const hasPortalPerm = (perm) => {
  if (!portalMode.value) return true
  const list = portalDetailPerms.value || []
  return list.includes(perm)
}
const wirelessAdb = useWirelessAdb(computed(() => route.params.id))
// provide('wirelessAdb', wirelessAdb)  // 🔧 移除 provide，避免 ref 嵌套导致模板无法自动解包
const device = ref(null)
const apps = ref([])
const appFilter = ref('')
const appTypeFilter = ref('')
const selectedApps = ref([])
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

// ─── ADB 管理 ─────────────────────────────────────────────────────────────────
const reconnectQrCanvas = ref(null)
const shellCommand = ref('')
const shellOutput = ref(null)
const shellRunning = ref(false)

const agentFilePreviewVisible = ref(false)
const agentFilePreviewType = ref('')
const agentFilePreviewUrl = ref('')
const agentFilePreviewName = ref('')

const activeMainTab = ref(
  route.query.tab === 'files'
    ? 'files'
    : route.query.tab === 'apps'
      ? 'apps'
      : route.query.tab === 'manage'
        ? 'manage'
        : route.query.tab === 'adb'
          ? 'adb'
          : route.query.tab === 'events'
            ? 'events'
            : route.query.tab === 'mdm'
              ? 'mdm'
              : 'info'
)
const fileHub = ref({ recordings: [], media: [] })
const fileHubLoading = ref(false)
const archiveShotLoading = ref(false)
const audioUploading = ref(false)
const isRecording = ref(false)
const recordingDuration = ref(0)
let recordingTimer = null
const recordingPlayerVisible = ref(false)
const recordingPlayerId = ref(null)

// ─── Agent 文件系统 ─────────────────────────────────────────────────────────
const agentFsQuickRoots = [
  '/storage/emulated/0',
  '/storage/emulated/0/Download',
  'app://external_files',
  'app://files',
  'app://cache'
]
const agentFsPath = ref('/storage/emulated/0')
const agentFsIncludeHidden = ref(false)
const agentFsEntries = ref([])
const agentFsLoading = ref(false)

let agentFsWs = null
const agentFsUploading = ref(false)
const agentFsUploadPct = ref(0)
const agentFsUploadStatus = ref('')
const agentFsUploadHint = ref('')

function ensurePathJoin(dir, name) {
  const d = String(dir || '').replace(/\/+$/, '')
  const n = String(name || '').replace(/^\/+/, '')
  return d ? `${d}/${n}` : `/${n}`
}

function enterAgentDir(name) {
  agentFsPath.value = ensurePathJoin(agentFsPath.value, name)
  loadAgentFs()
}

async function loadAgentFs() {
  if (!device.value?.agent_connected) return
  agentFsLoading.value = true
  try {
    const res = await deviceApi.listAgentFs(route.params.id, agentFsPath.value, {
      includeHidden: agentFsIncludeHidden.value
    })
    const box = res.data || {}
    agentFsEntries.value = box.entries || []
  } catch (e) {
    agentFsEntries.value = []
    ElMessage.error(e?.message || '列目录失败')
  } finally {
    agentFsLoading.value = false
  }
}

function closeAgentFsWs() {
  try {
    agentFsWs?.close?.()
  } catch {
    /* noop */
  }
  agentFsWs = null
}

function openAgentFsWs() {
  closeAgentFsWs()
  const tok = auth.token || localStorage.getItem('token') || ''
  const url = `${WS_BASE}/ws/agent-fs/${encodeURIComponent(route.params.id)}?token=${encodeURIComponent(tok)}`
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (e) => {
    let text = e.data
    if (text instanceof ArrayBuffer) {
      text = new TextDecoder('utf-8', { fatal: false }).decode(text)
    }
    if (typeof text !== 'string') return
    try {
      const j = JSON.parse(text)
      if (j.type === 'fs_upload_progress') {
        const rec = Number(j.received_bytes || 0)
        const pct = Math.max(0, Math.min(100, Math.round((rec * 100) / (agentFsUploadTotalBytes || 1))))
        agentFsUploadPct.value = pct
      } else if (j.type === 'fs_upload_done') {
        agentFsUploading.value = false
        agentFsUploadStatus.value = j.success ? 'success' : 'exception'
        if (!j.success) {
          agentFsUploadHint.value = j.error || '上传失败'
          ElMessage.error(agentFsUploadHint.value)
        } else {
          agentFsUploadHint.value = ''
          ElMessage.success('上传完成')
          loadAgentFs()
        }
        closeAgentFsWs()
      } else if (j.type === 'error') {
        agentFsUploadHint.value = j.error || '上传失败'
      }
    } catch {
      /* ignore */
    }
  }
  ws.onclose = () => {
    if (agentFsUploading.value) {
      agentFsUploading.value = false
      agentFsUploadStatus.value = 'exception'
      agentFsUploadHint.value = '连接已断开'
    }
  }
  agentFsWs = ws
}

let agentFsUploadTotalBytes = 0

async function uploadAgentFileToCurrentPath(opt) {
  const f = opt?.file
  if (!f || !device.value?.agent_connected) return
  if (agentFsUploading.value) return
  agentFsUploadHint.value = ''
  agentFsUploadStatus.value = ''
  agentFsUploadPct.value = 0
  agentFsUploadTotalBytes = Number(f.size || 0)
  if (agentFsUploadTotalBytes <= 0) {
    ElMessage.error('文件为空')
    return
  }
  agentFsUploading.value = true

  const uploadId = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  openAgentFsWs()
  // wait ws open
  await new Promise((resolve, reject) => {
    const ws = agentFsWs
    if (!ws) return reject(new Error('ws not ready'))
    if (ws.readyState === WebSocket.OPEN) return resolve()
    const t = setTimeout(() => reject(new Error('连接超时')), 8000)
    ws.onopen = () => {
      clearTimeout(t)
      resolve()
    }
    ws.onerror = () => {
      clearTimeout(t)
      reject(new Error('连接失败'))
    }
  }).catch((e) => {
    agentFsUploading.value = false
    agentFsUploadStatus.value = 'exception'
    agentFsUploadHint.value = e.message || '连接失败'
    closeAgentFsWs()
    return null
  })
  if (!agentFsWs || agentFsWs.readyState !== WebSocket.OPEN) return

  agentFsWs.send(
    JSON.stringify({
      type: 'upload_begin',
      upload_id: uploadId,
      path: agentFsPath.value,
      file_name: f.name,
      size: agentFsUploadTotalBytes
    })
  )

  const chunkSize = 64 * 1024
  let off = 0
  while (off < f.size && agentFsWs && agentFsWs.readyState === WebSocket.OPEN) {
    const blob = f.slice(off, off + chunkSize)
    const buf = await blob.arrayBuffer()
    agentFsWs.send(buf)
    off += chunkSize
    agentFsUploadPct.value = Math.max(agentFsUploadPct.value, Math.round((off * 100) / f.size))
  }
  if (agentFsWs && agentFsWs.readyState === WebSocket.OPEN) {
    agentFsWs.send(JSON.stringify({ type: 'upload_end', upload_id: uploadId }))
  }
}

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
    if (t === 'adb') {
      activeMainTab.value = 'adb'
      wirelessAdb.refreshAdbStatus()
    }
    if (t === 'events') {
      activeMainTab.value = 'events'
      loadDeviceEventsOutbound()
    }
    if (t === 'mdm') {
      activeMainTab.value = 'mdm'
      loadMdmConfig()
    }
  }
)

const canMutate = computed(() => {
  // 前台模式：以选中节点是否含 "adb" 操作权限为主开关（细粒度操作各自叠加 hasPortalPerm）。
  if (portalMode.value) return hasPortalPerm('adb')
  const r = auth.user?.role
  if (!r) return true
  return r === 'admin' || r === 'operator'
})
// canPortalAction 供模板按操作键（install_apk/wireless_adb/record/file/...）逐项显隐。
const canPortalAction = (perm) => hasPortalPerm(perm)

const deviceListenSnapshot = ref(null)
const deviceListenLoading = ref(false)
const outboundConnectorRows = ref([])
const outboundLoading = ref(false)

const deviceListenTableData = computed(() => {
  if (!deviceListenSnapshot.value) return []
  return [deviceListenSnapshot.value]
})

const eventAnalysisActive = ref(false)
const eventAnalysisLoading = ref(false)
const eventAnalysisSessionId = ref('')
const eventAnalysisScanCount = ref(0)
const eventAnalysisMinScans = ref(2)
const eventAnalysisProbeMode = ref('preset')
const eventAnalysisProbeActions = ref([])
const eventAnalysisProbePatterns = ref([])
const eventAnalysisObservations = ref([])
const eventAnalysisSuggestions = ref([])
let eventAnalysisStomp = null

function applyEventAnalysisPayload(payload) {
  if (!payload) return
  eventAnalysisSessionId.value = payload.session_id || ''
  eventAnalysisActive.value = payload.active === true
  eventAnalysisScanCount.value = Number(payload.scan_count) || 0
  if (payload.probe_mode) eventAnalysisProbeMode.value = payload.probe_mode
  if (Array.isArray(payload.probe_patterns)) {
    eventAnalysisProbePatterns.value = payload.probe_patterns
  }
  eventAnalysisObservations.value = payload.observations || []
  eventAnalysisSuggestions.value = payload.suggestions || []
}

function ensureEventAnalysisStomp() {
  const did = Number(device.value?.id)
  if (!did) return
  if (!eventAnalysisStomp) {
    eventAnalysisStomp = createEventAnalysisStomp(did, () => auth.token, applyEventAnalysisPayload)
  }
  eventAnalysisStomp.start()
}

function stopEventAnalysisStomp() {
  eventAnalysisStomp?.stop()
  eventAnalysisStomp = null
}

async function loadEventAnalysisSession() {
  const id = Number(device.value?.id)
  if (!id) return
  try {
    const res = await eventsApi.getCustomEventAnalyzeSession(id)
    const data = res?.data
    if (!data?.session) {
      eventAnalysisActive.value = false
      return
    }
    applyEventAnalysisPayload({
      session_id: data.session.session_id,
      active: data.session.active,
      scan_count: data.session.scan_count,
      probe_mode: data.session.probe_mode,
      probe_patterns: data.session.probe_patterns,
      observations: data.observations,
      suggestions: data.suggestions
    })
    if (data.session.active) ensureEventAnalysisStomp()
  } catch {
    /* */
  }
}

async function startEventAnalysis() {
  const id = Number(device.value?.id)
  if (!id) return
  if (eventAnalysisProbeMode.value === 'custom' && !eventAnalysisProbeActions.value.length) {
    ElMessage.warning('自定义探针请至少填写一个 Action')
    return
  }
  eventAnalysisLoading.value = true
  try {
    const res = await eventsApi.startCustomEventAnalyze(id, {
      minScans: 2,
      probeMode: eventAnalysisProbeMode.value,
      probeActions: eventAnalysisProbeMode.value === 'custom' ? eventAnalysisProbeActions.value : undefined
    })
    const d = res?.data || {}
    eventAnalysisMinScans.value = d.min_scans || 2
    eventAnalysisSessionId.value = d.session_id || ''
    eventAnalysisActive.value = true
    eventAnalysisScanCount.value = 0
    eventAnalysisObservations.value = []
    eventAnalysisSuggestions.value = []
    if (d.probe_mode) eventAnalysisProbeMode.value = d.probe_mode
    eventAnalysisProbePatterns.value = d.probe_patterns || []
    ensureEventAnalysisStomp()
    if (!d.agent_notified) {
      ElMessage.warning('分析会话已创建，但 Agent 未在线，请待设备上线后重新开始')
    } else if (d.probe_mode === 'custom') {
      const pat = (d.probe_patterns || []).join('、') || '—'
      ElMessage.success(`自定义探针已下发（${pat}，注册 ${d.action_count || 0} 个动作），请在设备上连续扫码`)
    } else {
      ElMessage.success(`探针已下发（覆盖 ${d.action_count || 0} 个广播动作），请在设备上连续扫码`)
    }
  } catch (e) {
    ElMessage.error(e?.message || '开始分析失败')
  } finally {
    eventAnalysisLoading.value = false
  }
}

async function stopEventAnalysis() {
  const id = Number(device.value?.id)
  if (!id) return
  eventAnalysisLoading.value = true
  try {
    const res = await eventsApi.stopCustomEventAnalyze(id)
    const d = res?.data || {}
    eventAnalysisActive.value = false
    if (d.session) {
      applyEventAnalysisPayload({
        session_id: d.session.session_id,
        active: false,
        scan_count: d.session.scan_count,
        probe_mode: d.session.probe_mode,
        probe_patterns: d.session.probe_patterns,
        observations: d.observations,
        suggestions: d.suggestions
      })
    }
    ElMessage.success('分析已结束')
  } catch (e) {
    ElMessage.error(e?.message || '结束分析失败')
  } finally {
    eventAnalysisLoading.value = false
  }
}

async function applyEventAnalysisSuggestions() {
  const id = Number(device.value?.id)
  if (!id || !eventAnalysisSuggestions.value.length) return
  const defIds = eventAnalysisSuggestions.value.map((s) => s.definition_id).filter(Boolean)
  if (!defIds.length) return
  try {
    await eventsApi.batchStartCustomEventListen([id], { definitionIds: defIds })
    ElMessage.success(`已按推荐启用 ${defIds.length} 条事件定义`)
    await loadDeviceListenState()
  } catch {
    /* */
  }
}

const screenshots = computed(() => (fileHub.value.media || []).filter((m) => m.category === 'screenshot'))
const audios = computed(() => (fileHub.value.media || []).filter((m) => m.category === 'audio'))

const filteredApps = computed(() => {
  const q = appFilter.value.trim().toLowerCase()
  const typeFilter = appTypeFilter.value

  let filtered = apps.value

  // 类型筛选
  if (typeFilter === 'user') {
    filtered = filtered.filter(a => !a.is_system)
  } else if (typeFilter === 'system') {
    filtered = filtered.filter(a => a.is_system)
  }

  // 关键词搜索
  if (q) {
    filtered = filtered.filter((a) => {
      const pkg = (a.package_name || '').toLowerCase()
      const label = (a.app_label || '').toLowerCase()
      return pkg.includes(q) || label.includes(q)
    })
  }

  return filtered
})

// ─── ADB 状态辅助 ──────────────────────────────────────────────────────────────
const usbSerial = computed(() => {
  const s = device.value?.serial || ''
  if (!s || s.startsWith('agent-') || s.includes(':')) return ''
  return s
})

const usbStateType = (state) => {
  if (state === 'device') return 'success'
  if (state === 'unauthorized') return 'warning'
  if (state === 'offline' || state === 'no_device') return 'danger'
  return 'info'
}
const usbStateLabel = (state) => {
  const map = { device: '已连接', offline: '离线', unauthorized: '未授权', no_device: '未找到', not_configured: '未配置' }
  return map[state] || state
}
const runShellCommand = async () => {
  if (!shellCommand.value.trim()) return
  shellRunning.value = true
  shellOutput.value = '执行中...'
  try {
    const res = await deviceApi.adbShellRun(route.params.id, shellCommand.value.trim())
    shellOutput.value = res.output ?? ''
  } catch (e) {
    shellOutput.value = '错误：' + (e.response?.data?.error || e.message || '执行失败')
  } finally {
    shellRunning.value = false
  }
}

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

const isImageFile = (name) => {
  const ext = name.toLowerCase().split('.').pop()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
}

const isVideoFile = (name) => {
  const ext = name.toLowerCase().split('.').pop()
  return ['mp4', 'avi', 'mov', 'mkv', 'webm', '3gp'].includes(ext)
}

const previewAgentFile = async (file) => {
  agentFilePreviewName.value = file.name
  agentFilePreviewType.value = isImageFile(file.name) ? 'image' : 'video'
  agentFilePreviewUrl.value = `/api/devices/${device.value.id}/agent/fs/download?path=${encodeURIComponent(agentFsPath.value + '/' + file.name)}&token=${auth.token}`
  agentFilePreviewVisible.value = true
}

const formatFileDate = (date) => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : (date instanceof Date ? date : new Date(date))
  if (!d || Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function connectorAppliesToDevice(c, deviceId) {
  const ids = c.device_ids || []
  if (!ids.length) return true
  return ids.map(Number).includes(Number(deviceId))
}

async function loadDeviceListenState() {
  if (!device.value?.id) return
  deviceListenLoading.value = true
  try {
    const r = await eventsApi.getCustomListenState({
      device_id: String(device.value.id),
      include_inactive: '1'
    })
    const arr = r.data || []
    deviceListenSnapshot.value = arr[0] || null
  } catch {
    deviceListenSnapshot.value = null
  } finally {
    deviceListenLoading.value = false
  }
}

async function loadOutboundConnectorsForDevice() {
  if (!device.value?.id) return
  const did = Number(device.value.id)
  outboundLoading.value = true
  try {
    const r = await ob.listOutboundConnectors()
    const all = r.data || []
    const applicable = all.filter((c) => connectorAppliesToDevice(c, did))
    const rows = []
    for (const c of applicable) {
      let stLabel = 'active'
      try {
        const st = await ob.getOutboundConnectorDeviceStates(c.id)
        const found = (st.data || []).find((x) => x.device_id === did)
        if (found) stLabel = found.status
      } catch {
        /* ignore */
      }
      rows.push({ ...c, _state: stLabel })
    }
    outboundConnectorRows.value = rows
  } catch {
    outboundConnectorRows.value = []
  } finally {
    outboundLoading.value = false
  }
}

async function loadDeviceEventsOutbound() {
  if (!device.value?.id) return
  await Promise.all([loadDeviceListenState(), loadOutboundConnectorsForDevice(), loadEventAnalysisSession()])
}

async function startDeviceCustomListen() {
  const id = Number(device.value.id)
  if (!id) return
  try {
    await eventsApi.batchStartCustomEventListen([id])
    ElMessage.success('已下发启用监听')
    await loadDeviceListenState()
  } catch {
    /* axios 拦截器已提示 */
  }
}

async function stopDeviceCustomListen() {
  const id = Number(device.value.id)
  if (!id) return
  try {
    await eventsApi.batchStopCustomEventListen([id])
    ElMessage.success('已停用监听')
    await loadDeviceListenState()
  } catch {
    /* */
  }
}

async function deleteDeviceCustomListen() {
  const id = Number(device.value.id)
  if (!id) return
  try {
    await ElMessageBox.confirm('将删除本机监听快照并向 Agent 下发停止监听。确定？', '删除监听记录', { type: 'warning' })
    const res = await eventsApi.deleteCustomEventListenState(id)
    const notified = res?.agent_notified === true
    if (device.value.agent_connected && !notified) {
      ElMessage.warning('已删除服务器记录，但 Agent 未确认在线，本机监听可能仍在运行；请待 Agent 上线后再次停用或在本机「事件监听」页删除')
    } else {
      ElMessage.success(notified ? '已删除并已通知 Agent 停止监听' : '已删除（Agent 离线，上线后不会自动恢复监听）')
    }
    await loadDeviceListenState()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e?.message || '删除失败')
    }
  }
}

async function outboundDeviceEnable(row) {
  const cid = row.id
  const did = Number(device.value.id)
  try {
    await ob.postOutboundConnectorDeviceEnable(cid, did)
    ElMessage.success('已启用')
    await loadOutboundConnectorsForDevice()
  } catch {
    /* */
  }
}

async function outboundDevicePause(row) {
  const cid = row.id
  const did = Number(device.value.id)
  try {
    await ob.postOutboundConnectorDevicePause(cid, did)
    ElMessage.success('已停用')
    await loadOutboundConnectorsForDevice()
  } catch {
    /* */
  }
}

async function outboundDeviceExclude(row) {
  const cid = row.id
  const did = Number(device.value.id)
  try {
    await ElMessageBox.confirm('将从本连接器出站中排除本设备，确定？', '排除', { type: 'warning' })
    await ob.postOutboundConnectorDeviceExclude(cid, did)
    ElMessage.success('已排除')
    await loadOutboundConnectorsForDevice()
  } catch (e) {
    if (e !== 'cancel') {
      /* */
    }
  }
}

const onMainTabChange = (name) => {
  // 同步到 URL：便于刷新后保持标签页，同时支持从「设备管理」页用 ?tab=files 直达
  try {
    const q = { ...(route.query || {}) }
    if (name && name !== 'info') q.tab = name
    else delete q.tab
    router.replace({ query: q }).catch(() => {})
  } catch {
    /* noop */
  }
  if (name === 'files') {
    loadFileHub()
  }
  if (name === 'apps') {
    loadApps()
  }
  if (name === 'adb') {
    wirelessAdb.refreshAdbStatus()
  }
  if (name === 'events') {
    loadDeviceEventsOutbound()
  }
  if (name === 'mdm') {
    loadMdmConfig()
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

const renameMediaRow = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新文件名', '重命名', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: row.file_name,
      inputValidator: (v) => v && v.trim() ? true : '文件名不能为空'
    })
    await deviceApi.renameDeviceMedia(row.id, value.trim())
    ElMessage.success('重命名成功')
    await loadFileHub()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '重命名失败')
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

const toggleRecording = async () => {
  if (isRecording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

const startRecording = async () => {
  try {
    await http.post(`/devices/${route.params.id}/audio-recording/start`)
    isRecording.value = true
    recordingDuration.value = 0
    sessionStorage.setItem(`recording_${route.params.id}`, Date.now())
    recordingTimer = setInterval(() => {
      recordingDuration.value = Math.floor((Date.now() - parseInt(sessionStorage.getItem(`recording_${route.params.id}`))) / 1000)
    }, 1000)
    ElMessage.success('录音已开始')
  } catch (e) {
    ElMessage.error('启动录音失败：' + (e.response?.data?.error || e.message))
  }
}

const stopRecording = async () => {
  try {
    await http.post(`/devices/${route.params.id}/audio-recording/stop`)
    clearInterval(recordingTimer)
    isRecording.value = false
    sessionStorage.removeItem(`recording_${route.params.id}`)
    ElMessage.success('录音已停止，正在上传...')
    setTimeout(() => loadFileHub(), 2000)
  } catch (e) {
    ElMessage.error('停止录音失败：' + (e.response?.data?.error || e.message))
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

const reconnectQrPayload = computed(() => {
  if (!device.value?.agent_token || device.value.agent_connected) return ''
  return JSON.stringify({
    serverUrl: WS_BASE,
    deviceToken: String(device.value.agent_token).trim()
  })
})

async function renderReconnectQr() {
  await nextTick()
  const canvas = reconnectQrCanvas.value
  const payload = reconnectQrPayload.value
  if (!canvas || !payload) return
  try {
    await QRCode.toCanvas(canvas, payload, { width: 248, margin: 2 })
  } catch (e) {
    console.error('reconnect QR', e)
  }
}

function copyAgentReconnectJson() {
  const s = reconnectQrPayload.value
  if (!s) {
    ElMessage.warning('无可用接入数据')
    return
  }
  copyText(s).then(
    () => ElMessage.success('已复制'),
    () => ElMessage.error('复制失败')
  )
}

watch(reconnectQrPayload, () => {
  renderReconnectQr()
})

const load = async () => {
  const res = await deviceApi.getDevice(route.params.id)
  device.value = res.data
  editForm.value = {
    name: res.data.name || '',
    server_alias: res.data.server_alias || '',
    group_name: res.data.group_name || '',
    agent_token: res.data.agent_token || ''
  }
  await renderReconnectQr()
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

const handleAppSelectionChange = (selection) => {
  selectedApps.value = selection
}

const batchExportApps = async () => {
  if (!device.value?.agent_connected) {
    ElMessage.warning('需要 Agent 在线')
    return
  }

  if (selectedApps.value.length === 0) {
    ElMessage.warning('请先选择要导出的应用')
    return
  }

  ElMessageBox.confirm(
    `确认将选中的 ${selectedApps.value.length} 个应用导出到 APK 管理？导出后可在「APK 管理」页面下载。`,
    '批量导出',
    {
      confirmButtonText: '确认导出',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    const loadingNotification = ElNotification({
      title: '批量导出中',
      message: `正在导出 ${selectedApps.value.length} 个应用，请勿关闭页面...`,
      type: 'info',
      duration: 0
    })

    let successCount = 0
    let failCount = 0
    const failedApps = []

    for (let i = 0; i < selectedApps.value.length; i++) {
      const app = selectedApps.value[i]
      try {
        loadingNotification.message = `正在导出 ${i + 1}/${selectedApps.value.length}: ${app.app_label || app.package_name}`

        // 调用 Agent 导出 APK 到服务器
        await deviceApi.exportInstalledApkToServer(route.params.id, app.package_name)
        successCount++
      } catch (e) {
        console.error(`导出失败: ${app.package_name}`, e)
        failCount++
        failedApps.push(app.app_label || app.package_name)
      }
    }

    loadingNotification.close()

    if (failCount === 0) {
      ElNotification({
        title: '批量导出完成',
        message: `成功导出 ${successCount} 个应用到 APK 管理`,
        type: 'success',
        duration: 3000
      })
    } else {
      ElNotification({
        title: '批量导出完成（部分失败）',
        message: `成功: ${successCount}，失败: ${failCount}。失败应用: ${failedApps.join(', ')}`,
        type: 'warning',
        duration: 5000
      })
    }

    // 清空选中
    selectedApps.value = []
  }).catch(() => {
    // 用户取消
  })
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
    const res = await deviceApi.captureScreenshot(route.params.id)
    ElMessage.success('截图已保存到服务器')
    loadFileHub()
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
  if (route.query.tab === 'events') {
    loadDeviceEventsOutbound()
  }
  if (route.query.tab === 'mdm') {
    loadMdmConfig()
  }
  const recordingStart = sessionStorage.getItem(`recording_${route.params.id}`)
  if (recordingStart) {
    isRecording.value = true
    const elapsed = Math.floor((Date.now() - parseInt(recordingStart)) / 1000)
    recordingDuration.value = elapsed
    recordingTimer = setInterval(() => {
      recordingDuration.value = Math.floor((Date.now() - parseInt(sessionStorage.getItem(`recording_${route.params.id}`))) / 1000)
    }, 1000)
  }
  profileListenerId = eventListeners.attachProfileListener({
    sourceLabel: '设备详情',
    deviceScopeId: route.params.id,
    onEvent: () => load()
  })
})
onUnmounted(() => {
  if (profileListenerId) eventListeners.revoke(profileListenerId)
  if (isRecording.value) stopRecording()
  stopEventAnalysisStomp()
})

// ── MDM 管理 ──────────────────────────────────────────────────────────────
const mdmLoading   = ref(false)
const mdmSyncing   = ref(false)
const ntpFetching  = ref(false)
const ntpSaving    = ref(false)
const mdmConfig    = ref({ mdm_enabled: false, enterprise_id: null, last_sync_at: null })
const mdmEnterprises = ref([])
const mdmCapabilities = ref(null)
const ntpForm      = ref({ ntp_server: '', ntp_timeout: 5000 })

// 能力矩阵展示列表
const mdmCapabilityList = computed(() => {
  if (!mdmCapabilities.value) return []
  const c = mdmCapabilities.value
  return [
    { key: 'is_device_owner',            label: 'Device Owner',   value: c.is_device_owner },
    { key: 'has_write_secure_settings',  label: 'WRITE_SECURE_SETTINGS', value: c.has_write_secure_settings },
    { key: 'can_set_ntp',                label: '设置 NTP',        value: c.can_set_ntp },
    { key: 'can_set_system_time',        label: '设置系统时间',     value: c.can_set_system_time },
    { key: 'can_set_password_policy',    label: '密码策略',         value: c.can_set_password_policy },
    { key: 'can_control_apps',           label: '应用管控',         value: c.can_control_apps },
    { key: 'can_disable_camera',         label: '禁用相机',         value: c.can_disable_camera },
    { key: 'can_wipe_device',            label: '远程擦除',         value: c.can_wipe_device },
    { key: 'can_set_keyguard',           label: '锁屏策略',         value: c.can_set_keyguard },
  ]
})

const loadMdmConfig = async () => {
  mdmLoading.value = true
  try {
    const res = await mdmApi.getDeviceMDM(route.params.id)
    mdmConfig.value = {
      mdm_enabled:   res.config?.mdm_enabled   ?? false,
      enterprise_id: res.config?.enterprise_id || null,
      last_sync_at:  res.config?.last_sync_at  || null,
    }
    mdmEnterprises.value = res.enterprises || []
    if (res.config?.capabilities_json) {
      try { mdmCapabilities.value = JSON.parse(res.config.capabilities_json) } catch { /* ignore */ }
    }
    // 始终从DB字段补充/覆盖关键能力（DB字段比capabilities_json 更可靠）
    mdmCapabilities.value = {
      ...(mdmCapabilities.value || {}),
      is_device_owner:          res.config?.is_device_owner          ?? false,
      has_write_secure_settings:res.config?.has_write_secure_settings ?? false,
      can_set_ntp:              (res.config?.has_write_secure_settings || res.config?.is_device_owner) ?? false,
    }
    // Device Owner 已激活时自动同步策略快照
    if (mdmCapabilities.value?.is_device_owner) {
      doGetPolicySnapshot()
    }
    if (res.config?.ntp_server) {
      ntpForm.value.ntp_server  = res.config.ntp_server
      ntpForm.value.ntp_timeout = res.config.ntp_timeout || 5000
    }
  } catch {
    ElMessage.error('加载 MDM 配置失败')
  } finally {
    mdmLoading.value = false
  }
}

const saveMdmConfig = async () => {
  // 关闭 MDM 时弹确认：提示策略会被自动清除
  if (!mdmConfig.value.mdm_enabled) {
    try {
      await ElMessageBox.confirm(
        '关闭 MDM 模式将自动清除设备上所有已生效的策略：\n• 相机 / 截屏禁用\n• 密码策略\n• Kiosk 锁定\n• 应用卸载封锁 / 隐藏\n• 用户限制\n\n如需保留策略请取消，手动清除后再关闭。',
        '⚠️ 确认关闭 MDM 模式',
        { type: 'warning', confirmButtonText: '确认关闭并清除策略', cancelButtonText: '取消', distinguishCancelAndClose: true }
      )
    } catch {
      // 取消 → 恢复开关
      mdmConfig.value.mdm_enabled = true
      return
    }
  }
  try {
    await mdmApi.updateDeviceMDM(route.params.id, {
      mdm_enabled:   mdmConfig.value.mdm_enabled,
      enterprise_id: mdmConfig.value.enterprise_id || 0,
    })
    ElMessage.success('MDM 配置已保存')
    if (!mdmConfig.value.mdm_enabled) {
      // 重置前端策略快照（策略已被清除）
      policySnapshot.value = null
      hwPolicy.value = { cameraDisabled: false, screenCaptureDisabled: false }
      pwdPolicy.value = { quality: 'none', minLength: 0 }
      kioskForm.value.packages = ''
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.response?.data?.error || e.message))
  }
}

const syncMdmStatus = async () => {
  mdmSyncing.value = true
  try {
    const res = await mdmApi.syncDeviceMDMStatus(route.params.id)
    if (res.capabilities) mdmCapabilities.value = res.capabilities
    if (res.config?.last_sync_at) mdmConfig.value.last_sync_at = res.config.last_sync_at
    ElMessage.success('MDM 能力已同步')
  } catch (e) {
    ElMessage.error('同步失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    mdmSyncing.value = false
  }
}

const fetchNtpConfig = async () => {
  ntpFetching.value = true
  try {
    const res = await mdmApi.fetchDeviceNTPConfig(route.params.id)
    ntpForm.value.ntp_server  = res.ntp_server  || ''
    ntpForm.value.ntp_timeout = res.ntp_timeout || 5000
    ElMessage.success('已从设备读取 NTP 配置')
  } catch (e) {
    ElMessage.error('读取失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    ntpFetching.value = false
  }
}

const saveNtpConfig = async () => {
  if (!ntpForm.value.ntp_server) {
    ElMessage.warning('请输入 NTP 服务器地址')
    return
  }
  ntpSaving.value = true
  try {
    await mdmApi.setDeviceNTPConfig(route.params.id, {
      ntp_server:  ntpForm.value.ntp_server,
      ntp_timeout: ntpForm.value.ntp_timeout,
    })
    ElMessage.success('NTP 配置已下发到设备')
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    ntpSaving.value = false
  }
}

// ── Device Owner 策略 ────────────────────────────────────────────────────────
const dpmLocking     = ref(false)
const dpmRebooting   = ref(false)
const clearingPolicies = ref(false)
const revokingDO       = ref(false)
const snapshotLoading= ref(false)
const policySnapshot = ref(null)
const hwSaving       = ref(false)
const pwdSaving      = ref(false)
const urSaving       = ref(false)
const appRestrSaving = ref(false)
const kioskSaving    = ref(false)
const timeSaving     = ref(false)
const wipePreparing  = ref(false)
const wipeConfirming = ref(false)
const wipeDialogVisible = ref(false)
const wipeConfirmInput  = ref('')
const wipeToken         = ref('')

const hwPolicy = ref({ cameraDisabled: false, screenCaptureDisabled: false })
const pwdPolicy = ref({ quality: 'none', minLength: 0 })
const appRestrForm = ref({ packageName: '', hidden: false, uninstallBlocked: false })
const kioskForm = ref({ packages: '' })
const timeForm  = ref({ timezone: 'Asia/Shanghai' })

const userRestrictionList = ref([
  { key: 'no_factory_reset',         label: '禁止恢复出厂',    enabled: false },
  { key: 'no_install_apps',          label: '禁止安装应用',    enabled: false },
  { key: 'no_uninstall_apps',        label: '禁止卸载应用',    enabled: false },
  { key: 'no_usb_file_transfer',     label: '禁止 USB 传输',   enabled: false },
  { key: 'no_debugging_features',    label: '禁止调试功能',    enabled: false },
  { key: 'no_config_wifi',           label: '禁止修改 WiFi',   enabled: false },
  { key: 'no_config_bluetooth',      label: '禁止修改蓝牙',    enabled: false },
  { key: 'no_add_user',              label: '禁止添加用户',     enabled: false },
])

// 快捷操作
const doLockNow = async () => {
  dpmLocking.value = true
  try {
    await mdmApi.lockDevice(route.params.id)
    ElMessage.success('锁屏指令已下发')
  } catch (e) {
    ElMessage.error('锁屏失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    dpmLocking.value = false
  }
}

const doReboot = async () => {
  try {
    await ElMessageBox.confirm('确定通过 Device Owner 重启设备？', '确认重启', { type: 'warning' })
    dpmRebooting.value = true
    await mdmApi.mdmRebootDevice(route.params.id)
    ElMessage.success('重启指令已下发')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重启失败: ' + (e?.response?.data?.error || e?.message || ''))
  } finally {
    dpmRebooting.value = false
  }
}

const policySnapshotTime = ref('')

const doGetPolicySnapshot = async () => {
  snapshotLoading.value = true
  try {
    const res = await mdmApi.getPolicySnapshot(route.params.id)
    policySnapshot.value = res.snapshot
    policySnapshotTime.value = new Date().toLocaleTimeString()
    if (res.snapshot) {
      const s = res.snapshot
      hwPolicy.value.cameraDisabled        = s.camera_disabled ?? false
      hwPolicy.value.screenCaptureDisabled = s.screen_capture_disabled ?? false
      if (s.password_quality != null) {
        const qMap = { 0:'none', 65536:'numeric', 131072:'alphabetic', 196608:'alphanumeric', 262144:'complex' }
        pwdPolicy.value.quality   = qMap[s.password_quality] ?? 'none'
        pwdPolicy.value.minLength = s.password_min_length ?? 0
      }
      if (s.lock_task_packages) {
        kioskForm.value.packages = s.lock_task_packages
      }
    }
  } catch (e) {
    ElMessage.error('获取策略快照失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    snapshotLoading.value = false
  }
}

const doClearAllPolicies = async () => {
  try {
    await ElMessageBox.confirm(
      '将清除设备上所有已生效的策略（相机/截屏/密码/Kiosk/卸载封锁/用户限制），但不撤销 Device Owner 身份。',
      '确认清除所有策略', { type: 'warning' }
    )
  } catch { return }
  clearingPolicies.value = true
  try {
    await mdmApi.clearAllMDMPolicies(route.params.id)
    ElMessage.success('所有策略已清除')
    policySnapshot.value = null
    hwPolicy.value = { cameraDisabled: false, screenCaptureDisabled: false }
    pwdPolicy.value = { quality: 'none', minLength: 0 }
    kioskForm.value.packages = ''
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('清除失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    clearingPolicies.value = false
  }
}

const doRevokeDO = async () => {
  try {
    await ElMessageBox.confirm(
      '撤销 Device Owner 后：\n• 所有策略自动清除\n• Agent App 可以被正常卸载\n• 高级策略功能不再可用（除非重新激活）\n\n确认撤销？',
      '⚠️ 撤销 Device Owner', { type: 'error', confirmButtonText: '确认撤销' }
    )
  } catch { return }
  revokingDO.value = true
  try {
    const res = await mdmApi.revokeDeviceOwner(route.params.id)
    ElMessage.success(res.message || 'Device Owner 已撤销')
    // 刷新 MDM 能力状态
    await syncMdmStatus()
  } catch (e) {
    ElMessage.error('撤销失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    revokingDO.value = false
  }
}

const policyRows = computed(() => {
  const isDO = mdmCapabilities.value?.is_device_owner ?? false
  const hasSnap = !!policySnapshot.value
  const locked = isDO ? null : { type: 'info', text: '🔒 需要 Device Owner' }
  return [
    {
      icon: '📷', label: '相机', type: 'toggle', requiresDO: true,
      value: hwPolicy.value.cameraDisabled,
      activeText: '已禁用', inactiveText: '正常',
      saving: hwSaving.value,
      onChange: (v) => applyHardwarePolicy('camera_disabled', v),
      statusTag: isDO && hasSnap
        ? (hwPolicy.value.cameraDisabled ? { type: 'danger', text: '已禁用' } : { type: 'success', text: '正常' })
        : locked,
    },
    {
      icon: '📸', label: '截屏', type: 'toggle', requiresDO: true,
      value: hwPolicy.value.screenCaptureDisabled,
      activeText: '已禁用', inactiveText: '正常',
      saving: hwSaving.value,
      onChange: (v) => applyHardwarePolicy('screen_capture_disabled', v),
      statusTag: isDO && hasSnap
        ? (hwPolicy.value.screenCaptureDisabled ? { type: 'danger', text: '已禁用' } : { type: 'success', text: '正常' })
        : locked,
    },
    {
      icon: '🔐', label: '密码策略', type: 'password', requiresDO: true,
      statusTag: isDO && hasSnap && pwdPolicy.value.quality !== 'none'
        ? { type: 'warning', text: `${pwdPolicy.value.quality}${pwdPolicy.value.minLength > 0 ? '，最短' + pwdPolicy.value.minLength + '位' : ''}` }
        : (isDO && hasSnap ? { type: 'info', text: '不限制' } : locked),
    },
    {
      icon: '🏠', label: 'Kiosk', type: 'kiosk', requiresDO: true,
      statusTag: isDO && hasSnap
        ? (kioskForm.value.packages ? { type: 'warning', text: 'Kiosk: ' + kioskForm.value.packages.substring(0, 20) } : { type: 'success', text: '未启用' })
        : locked,
    },
    {
      icon: '⏰', label: '时区', type: 'timezone', requiresDO: true,
      statusTag: isDO && hasSnap ? { type: 'info', text: timeForm.value.timezone || 'Asia/Shanghai' } : locked,
    },
    {
      icon: '📦', label: '应用管控', type: 'app', requiresDO: true,
      statusTag: isDO ? null : locked,
    },
    {
      icon: '🔒', label: '锁屏 / 重启', type: 'action', requiresDO: true,
      actions: [
        { label: '立即锁屏', type: 'default', loading: dpmLocking, handler: doLockNow },
        { label: 'DPM 重启', type: 'default', loading: dpmRebooting, handler: doReboot },
      ],
      statusTag: isDO ? null : locked,
    },
    {
      icon: '⚠️', label: '擦除设备', type: 'danger', danger: true, requiresDO: true,
      statusTag: isDO ? { type: 'danger', text: '不可逆操作' } : locked,
    },
  ]
})

// 硬件管控
const applyHardwarePolicy = async (field, value) => {
  hwSaving.value = true
  try {
    await mdmApi.setHardwarePolicy(route.params.id, { [field]: value })
    ElMessage.success('硬件策略已下发')
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
    if (field === 'camera_disabled') hwPolicy.value.cameraDisabled = !value
    else hwPolicy.value.screenCaptureDisabled = !value
  } finally {
    hwSaving.value = false
  }
}

// 密码策略
const applyPasswordPolicy = async () => {
  pwdSaving.value = true
  try {
    await mdmApi.setPasswordPolicy(route.params.id, {
      quality: pwdPolicy.value.quality,
      min_length: pwdPolicy.value.minLength,
    })
    ElMessage.success('密码策略已下发')
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    pwdSaving.value = false
  }
}

// 用户限制
const applyUserRestriction = async (key, enabled) => {
  urSaving.value = true
  try {
    await mdmApi.setUserRestriction(route.params.id, { restriction: key, enabled })
    ElMessage.success(`限制 ${key} 已${enabled ? '添加' : '移除'}`)
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
    const r = userRestrictionList.value.find(x => x.key === key)
    if (r) r.enabled = !enabled
  } finally {
    urSaving.value = false
  }
}

// 应用管控
const applyAppRestriction = async () => {
  if (!appRestrForm.value.packageName) { ElMessage.warning('请输入包名'); return }
  appRestrSaving.value = true
  try {
    await mdmApi.setAppRestriction(route.params.id, {
      package_name:      appRestrForm.value.packageName,
      hidden:            appRestrForm.value.hidden,
      uninstall_blocked: appRestrForm.value.uninstallBlocked,
    })
    ElMessage.success('应用管控策略已下发')
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    appRestrSaving.value = false
  }
}

// Kiosk
const enableKiosk = async () => {
  const pkgs = kioskForm.value.packages.split(',').map(s => s.trim()).filter(Boolean)
  if (!pkgs.length) { ElMessage.warning('请输入至少一个包名'); return }
  kioskSaving.value = true
  try {
    await mdmApi.setKioskMode(route.params.id, { enabled: true, packages: pkgs })
    ElMessage.success('Kiosk 已启用')
    doGetPolicySnapshot()
  } catch (e) {
    ElMessage.error('启用失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    kioskSaving.value = false
  }
}

const disableKiosk = async () => {
  kioskSaving.value = true
  try {
    await mdmApi.setKioskMode(route.params.id, { enabled: false, packages: [] })
    ElMessage.success('Kiosk 已退出')
  } catch (e) {
    ElMessage.error('退出失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    kioskSaving.value = false
  }
}

// 时间
const applyDeviceTime = async () => {
  timeSaving.value = true
  try {
    await mdmApi.setDeviceTime(route.params.id, { timezone: timeForm.value.timezone })
    ElMessage.success('时区已下发')
  } catch (e) {
    ElMessage.error('下发失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    timeSaving.value = false
  }
}

// 擦除设备（两步流程）
const startWipeFlow = async () => {
  wipePreparing.value = true
  try {
    const res = await mdmApi.prepareWipeDevice(route.params.id)
    wipeToken.value = res.token
    wipeConfirmInput.value = ''
    wipeDialogVisible.value = true
  } catch (e) {
    ElMessage.error('准备失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    wipePreparing.value = false
  }
}

const doConfirmWipe = async () => {
  wipeConfirming.value = true
  try {
    await mdmApi.confirmWipeDevice(route.params.id, {
      token:   wipeToken.value,
      confirm: wipeConfirmInput.value,
    })
    wipeDialogVisible.value = false
    ElMessage.success('擦除指令已下发，设备即将恢复出厂设置')
  } catch (e) {
    ElMessage.error('擦除失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    wipeConfirming.value = false
  }
}


// ── Device Owner QR 激活向导 ───────────────────────────────────────────────
const doGuideDialogVisible = ref(false)
const doQrDataUrl  = ref('')
const dpcQrDataUrl = ref('')
const doAdbCommand = `adb shell dpm set-device-owner com.appmanager.agent/.admin.DeviceAdminReceiver`

const showDoActivationGuide = async () => {
  doGuideDialogVisible.value = true
  doQrDataUrl.value  = ''
  dpcQrDataUrl.value = ''
  await nextTick()

  try {
    // QR 1：Agent root 扫码激活
    doQrDataUrl.value = await QRCode.toDataURL(JSON.stringify({
      type: 'mdm_do_activate',
      component: 'com.appmanager.agent/.admin.DeviceAdminReceiver',
    }), { width: 200, margin: 2 })
  } catch (e) {
    ElMessage.error('生成激活码失败: ' + e.message)
  }

  try {
    // QR 2：DPC 出厂重置引导——服务器地址从当前页面推导（Vite dev→8081 port，生产同 origin）
    const serverBase = window.location.origin.replace(':3000', ':8081').replace(':3001', ':8081')
    dpcQrDataUrl.value = await QRCode.toDataURL(JSON.stringify({
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME':
        'com.appmanager.agent/.admin.DeviceAdminReceiver',
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION':
        `${serverBase}/api/agent-updates/latest/download`,
      'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
      'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': { server_url: serverBase },
    }), { width: 200, margin: 2 })
  } catch (e) {
    ElMessage.error('生成 DPC 二维码失败: ' + e.message)
  }
}

const copyDoAdbCommand = () => {
  navigator.clipboard.writeText(doAdbCommand).then(() => ElMessage.success('已复制'))
}

// ── Kiosk 快速应用选择 ──────────────────────────────────────────────────────
const kioskAppPickerVisible = ref(false)
const kioskAppLoading  = ref(false)
const kioskAppSearch   = ref('')
const kioskDeviceApps  = ref([])
const kioskSelectedApps = ref([])

const kioskFilteredApps = computed(() => {
  const q = kioskAppSearch.value.toLowerCase()
  if (!q) return kioskDeviceApps.value
  return kioskDeviceApps.value.filter(a =>
    (a.app_label || '').toLowerCase().includes(q) ||
    (a.package_name || '').toLowerCase().includes(q)
  )
})

const openKioskAppPicker = async () => {
  kioskAppPickerVisible.value = true
  kioskAppLoading.value = true
  kioskDeviceApps.value = []
  kioskSelectedApps.value = []
  kioskAppSearch.value = ''
  try {
    // 直接使用已导入的 deviceApi，获取设备已安装应用列表
    const res = await deviceApi.getDeviceApps(route.params.id)
    const list = res?.data || []
    if (list.length === 0 && device.value?.agent_connected) {
      // 缓存为空且 Agent 在线，自动从设备拉取一次
      ElMessage.info('应用列表为空，正在从设备实时获取...')
      const refreshRes = await deviceApi.refreshDeviceApps(route.params.id)
      kioskDeviceApps.value = refreshRes?.data || []
    } else {
      kioskDeviceApps.value = list
    }
  } catch (e) {
    ElMessage.error('获取应用列表失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    kioskAppLoading.value = false
  }
}

const refreshKioskAppList = async () => {
  if (!device.value?.agent_connected) {
    ElMessage.warning('Agent 未在线，无法从设备获取应用列表')
    return
  }
  kioskAppLoading.value = true
  try {
    ElMessage.info('正在从设备获取应用列表，请稍候...')
    const res = await deviceApi.refreshDeviceApps(route.params.id)
    kioskDeviceApps.value = res?.data || []
    ElMessage.success(`已从设备获取 ${kioskDeviceApps.value.length} 个应用`)
  } catch (e) {
    ElMessage.error('刷新失败: ' + (e?.response?.data?.error || e.message))
  } finally {
    kioskAppLoading.value = false
  }
}

const applyKioskAppSelection = () => {
  const pkgs = kioskSelectedApps.value.map(a => a.package_name).filter(Boolean)
  kioskForm.value.packages = pkgs.join(',')
  kioskAppPickerVisible.value = false
}


</script>

<style scoped>
.events-out-card :deep(.el-card__header) {
  overflow: hidden;
}
.file-hub-video {
  width: 100%;
  max-height: 72vh;
  background: #000;
  border-radius: 4px;
  vertical-align: middle;
}

.agent-reconnect-card {
  margin: 12px 0;
  max-width: 720px;
}
.agent-reconnect-card-title {
  font-weight: 600;
}
.agent-reconnect-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.55;
}
.agent-reconnect-qr-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}
.agent-reconnect-canvas {
  flex-shrink: 0;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}
.agent-reconnect-meta {
  flex: 1;
  min-width: 200px;
  font-size: 13px;
  line-height: 1.6;
}
.agent-reconnect-meta p {
  margin: 0 0 8px;
}
.agent-reconnect-meta .lbl {
  display: inline-block;
  min-width: 7.5em;
  margin-right: 6px;
  color: #909399;
  font-size: 12px;
}
.agent-reconnect-meta .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 4px;
  word-break: break-all;
}
.agent-reconnect-meta .mono.tok {
  display: inline-block;
  max-width: 100%;
}

/* ── 移动端适配 ─────────────────────────────────────────────── */
@media (max-width: 768px) {
  /* Tab 头允许横向滚动，避免标签换行挤压 */
  .device-detail-tabs :deep(.el-tabs__nav-wrap) {
    padding: 0 4px;
  }
  .device-detail-tabs :deep(.el-tabs__item) {
    padding: 0 12px;
    font-size: 14px;
  }
  /* 表格在窄屏可横向滚动，固定列仍可访问操作 */
  .device-detail-tabs :deep(.el-table) {
    font-size: 13px;
  }
  /* 行内表单在窄屏堆叠，避免输入框溢出 */
  .device-detail-tabs :deep(.el-form--inline .el-form-item) {
    display: flex;
    width: 100%;
    margin-right: 0;
  }
  .device-detail-tabs :deep(.el-form--inline .el-form-item__content) {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .device-detail-tabs :deep(.el-form--inline .el-form-item__content .el-select),
  .device-detail-tabs :deep(.el-form--inline .el-form-item__content .el-input) {
    width: auto !important;
    flex: 1;
    min-width: 140px;
  }
  /* 应用搜索/路径等固定宽度输入自适应 */
  .device-detail-tabs :deep(.el-input),
  .device-detail-tabs :deep(.el-select) {
    max-width: 100%;
  }
  /* 录屏播放/文件预览弹窗接近全屏 */
  .file-hub-video {
    max-height: 60vh;
  }
}
</style>
