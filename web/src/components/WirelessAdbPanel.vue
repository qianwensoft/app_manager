<template>
  <div class="wireless-adb-panel">
    <div v-if="!deviceId" class="wireless-adb-empty">
      <el-text type="info" size="small">请先选择设备</el-text>
    </div>

    <template v-else>
      <!-- 状态栏 -->
      <div class="wireless-adb-header">
        <template v-if="adb.adbStatus.wireless?.state === 'device'">
          <el-tag type="success" size="small">已连接</el-tag>
          <code class="wireless-endpoint">{{ adb.wirelessAdbEndpoint }}</code>
          <el-button
            type="danger"
            plain
            size="small"
            :loading="adb.adbDisconnecting"
            @click="adb.doAdbDisconnect"
          >断开</el-button>
        </template>
        <template v-else>
          <el-tag
            v-if="adb.adbStatus.wireless"
            :type="wirelessStateType(adb.adbStatus.wireless.state)"
            size="small"
          >{{ wirelessStateLabel(adb.adbStatus.wireless.state) }}</el-tag>
          <el-button size="small" :loading="adb.adbStatusLoading" @click="adb.refreshAdbStatus">检测状态</el-button>
        </template>
      </div>

      <template v-if="adb.adbStatus.wireless?.state === 'device'">
        <div class="wireless-connected-hint">
          无线 ADB 连接正常，配对与连接操作已隐藏。如需重新配置请点击「断开」后重新操作。
        </div>
      </template>

      <template v-else>
        <el-alert
          v-if="adb.savedWirelessAdbPort && adb.adbStatus.wireless && adb.adbStatus.wireless.state !== 'not_configured'"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom:12px"
          :title="`无线 ADB 连接已断开（${adb.wirelessAdbEndpoint || `端口 ${adb.savedWirelessAdbPort}` }}）`"
          :description="`上次连接端口 ${adb.wirelessConnectPort} 已自动填入；重连时将使用 Agent 当前上报的 IP。`"
        >
          <template #default>
            <el-button
              size="small"
              type="danger"
              plain
              :loading="adb.adbDisconnecting"
              style="margin-top:6px"
              @click="adb.doAdbClearRecord"
            >清除记录</el-button>
          </template>
        </el-alert>

        <div class="wireless-agent-actions">
          <el-button
            type="primary"
            plain
            size="small"
            :loading="adb.openingWirelessAdb"
            :disabled="!adb.device?.agent_connected"
            @click="adb.openWirelessAdbViaAgent"
          >Agent 打开无线调试</el-button>
          <el-button
            plain
            size="small"
            :loading="adb.triggeringWirelessMenu"
            :disabled="!adb.device?.agent_connected"
            @click="adb.triggerWirelessAdbMenu"
          >触发 Agent 菜单</el-button>
          <el-text v-if="adb.wirelessAdbScanAck" type="success" size="small">{{ adb.wirelessAdbScanAck }}</el-text>
        </div>
        <el-text v-if="!adb.device?.agent_connected" type="warning" size="small" class="wireless-agent-warn">
          远程打开无线调试需 Agent 在线；也可在手机 Agent 首页右上角扫码。
        </el-text>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom:12px"
          title="Agent 菜单"
          description="系统已内置「无线 ADB」菜单项，可在「Agent 菜单」页下发到本设备后，在 Agent 首页点击打开无线调试。"
        />

        <el-divider content-position="left" style="margin-top:0">第一步：配对（Android 11+）</el-divider>
        <el-radio-group v-model="adb.pairMethod" style="margin-bottom:14px">
          <el-radio-button value="code">配对码</el-radio-button>
          <el-radio-button value="qrcode">二维码</el-radio-button>
        </el-radio-group>

        <template v-if="adb.pairMethod === 'code'">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom:12px"
            description="在手机「开发者选项 → 无线调试」开启「使用配对码配对设备」，获取配对端口和 6 位配对码。"
          />
          <div class="wireless-form-row">
            <div>
              <div class="field-label">配对端口</div>
              <el-input-number
                v-model="adb.wirelessPairPort"
                :min="1"
                :max="65535"
                :controls="false"
                style="width:110px"
                placeholder="端口"
              />
            </div>
            <div>
              <div class="field-label">6 位配对码</div>
              <el-input v-model="adb.wirelessPairCode" placeholder="例：123456" style="width:130px" maxlength="6" />
            </div>
            <el-button
              :loading="adb.pairing"
              :disabled="!adb.wirelessPairPort || adb.wirelessPairCode.length < 4"
              @click="adb.doPair"
            >{{ adb.pairing ? '配对中...' : '配对' }}</el-button>
          </div>
        </template>

        <template v-else>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom:12px"
            description="用手机 Agent 首页右上角「扫码」扫描下方二维码，将自动打开「无线调试」并通知管理平台。启用调试后，将页面上显示的端口号填入下方「连接」步骤中。"
          />
          <div class="wireless-qr-row">
            <canvas
              :ref="(el) => { if (adb.pairQrCanvas) adb.pairQrCanvas.value = el }"
              style="border-radius:8px;border:1px solid #e4e7ed"
            />
            <ol class="wireless-qr-steps">
              <li>打开 Agent 应用首页</li>
              <li>点击右上角扫码图标，扫描左侧二维码</li>
              <li>手机自动跳转到「无线调试」设置页面</li>
              <li>手机上启用无线调试，记录显示的端口号</li>
              <li>将端口号填入下方「连接端口」后点「连接」</li>
            </ol>
          </div>
        </template>

        <el-alert
          v-if="adb.pairResult"
          :type="adb.pairSuccess ? 'success' : 'error'"
          :title="adb.pairResult"
          :closable="true"
          show-icon
          style="margin-top:10px"
          @close="adb.pairResult = ''"
        />

        <el-divider content-position="left">第二步：连接</el-divider>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom:12px"
          description="填写「无线调试」页面显示的主端口（非配对端口）。跳过配对直接连接时默认填 5555。"
        />
        <div class="wireless-form-row">
          <div>
            <div class="field-label">连接端口</div>
            <el-input-number
              v-model="adb.wirelessConnectPort"
              :min="1"
              :max="65535"
              :controls="false"
              style="width:110px"
            />
          </div>
          <el-button type="primary" :loading="adb.connecting" @click="adb.doConnect">
            {{ adb.connecting ? '连接中...' : '连接' }}
          </el-button>
        </div>
        <el-alert
          v-if="adb.connectResult"
          :type="adb.connectSuccess ? 'success' : 'error'"
          :title="adb.connectResult"
          :closable="true"
          show-icon
          style="margin-top:10px"
          @close="adb.connectResult = ''"
        />
      </template>

      <template v-if="includeGrantReadLogs">
        <el-divider content-position="left">授权日志权限</el-divider>
        <div class="wireless-form-row">
          <el-button :loading="adb.grantingReadLogs" @click="adb.doGrantReadLogs">授权 Agent READ_LOGS</el-button>
          <el-text type="info" size="small">允许 Agent 读取系统全量日志（需已建立 ADB 连接）</el-text>
        </div>
        <el-alert
          v-if="adb.grantReadLogsResult"
          :type="adb.grantReadLogsSuccess ? 'success' : 'error'"
          :title="adb.grantReadLogsResult"
          :closable="true"
          show-icon
          style="margin-top:10px"
          @close="adb.grantReadLogsResult = ''"
        />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, inject, watch, nextTick } from 'vue'
import { useWirelessAdb } from '@/composables/useWirelessAdb'
import { wirelessStateType, wirelessStateLabel } from '@/utils/wirelessAdb'

const props = defineProps({
  deviceId: {
    type: [Number, String],
    default: null
  },
  includeGrantReadLogs: {
    type: Boolean,
    default: false
  }
})

const injected = inject('wirelessAdb', null)
console.log('[WirelessAdbPanel] injected =', injected)
const deviceId = computed(() => props.deviceId)

// 🔧 FIX: 不使用 injected，总是创建新实例以避免 provide/inject 的 ref 嵌套问题
const adb = useWirelessAdb(deviceId)
console.log('[WirelessAdbPanel] adb created (独立实例):', adb)

watch(
  () => adb.pairMethod,
  (v) => {
    if (v === 'qrcode') nextTick(() => adb.renderPairQrCode())
  }
)

defineExpose({ adb })
</script>

<style scoped>
.wireless-adb-panel {
  font-size: 13px;
}
.wireless-adb-empty {
  padding: 8px 0;
}
.wireless-adb-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.wireless-endpoint {
  font-family: monospace;
  background: #f0f9eb;
  color: #67c23a;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid #b3e19d;
  font-size: 13px;
}
.wireless-connected-hint {
  color: #67c23a;
  font-size: 13px;
  padding: 4px 0;
}
.wireless-agent-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.wireless-agent-warn {
  display: block;
  margin-bottom: 10px;
}
.wireless-form-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field-label {
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
}
.wireless-qr-row {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}
.wireless-qr-steps {
  margin: 0;
  padding-left: 18px;
  color: #606266;
  line-height: 1.8;
  max-width: 320px;
}
</style>
