<template>
  <div>
    <el-button
      type="success"
      :loading="scanning"
      :disabled="!supported"
      @click="startScan"
    >
      {{ supported ? (scanning ? '连接中...' : '扫描本机 USB 设备') : 'WebUSB 不支持（需 Chrome）' }}
    </el-button>

    <!-- 扫描结果对话框 -->
    <el-dialog v-model="dialogVisible" title="USB 设备" width="500px" :close-on-click-modal="false">
      <div v-if="step === 'connecting'" style="text-align:center;padding:24px 0">
        <el-icon class="rotating" :size="40"><Loading /></el-icon>
        <div style="margin-top:12px;color:#606266">正在连接设备，请在手机上点击「允许 USB 调试」...</div>
      </div>

      <div v-else-if="step === 'info'" style="padding:8px 0">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="Serial">{{ deviceInfo.serial }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ deviceInfo.model }}</el-descriptions-item>
          <el-descriptions-item label="品牌">{{ deviceInfo.brand }}</el-descriptions-item>
          <el-descriptions-item label="Android 版本">{{ deviceInfo.osVersion }}</el-descriptions-item>
          <el-descriptions-item label="SDK">{{ deviceInfo.sdkVersion }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:16px">
          <div style="font-size:13px;color:#606266;margin-bottom:6px">设备名称（可选）</div>
          <el-input v-model="deviceName" placeholder="留空则使用型号作为名称" />
        </div>
      </div>

      <div v-else-if="step === 'error'" style="padding:8px 0">
        <el-alert type="error" :title="errorMsg" :closable="false" show-icon />
      </div>

      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button
          v-if="step === 'info'"
          type="primary"
          :loading="registering"
          @click="register"
        >注册到系统</el-button>
        <el-button v-if="step === 'error'" type="primary" @click="startScan">重试</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import * as deviceApi from '@/api/device'

const emit = defineEmits(['registered'])

const supported = ref(typeof navigator !== 'undefined' && !!navigator.usb)
const scanning = ref(false)
const dialogVisible = ref(false)
const step = ref('connecting') // connecting | info | error
const errorMsg = ref('')
const registering = ref(false)
const deviceName = ref('')

const deviceInfo = ref({
  serial: '',
  model: '',
  brand: '',
  osVersion: '',
  sdkVersion: '',
})

let adbInstance = null

async function startScan() {
  scanning.value = true
  dialogVisible.value = true
  step.value = 'connecting'
  errorMsg.value = ''
  deviceInfo.value = { serial: '', model: '', brand: '', osVersion: '', sdkVersion: '' }
  deviceName.value = ''
  adbInstance = null

  try {
    const { AdbDaemonWebUsbDeviceManager } = await import('@yume-chan/adb-daemon-webusb')
    const { Adb, AdbDaemonTransport } = await import('@yume-chan/adb')
    const { default: AdbWebCredentialStore } = await import('@yume-chan/adb-credential-web')

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER
    if (!manager) throw new Error('当前浏览器不支持 WebUSB')

    // 弹出设备选择框
    const usbDevice = await manager.requestDevice()
    if (!usbDevice) {
      // 用户取消
      close()
      return
    }

    // 建立 ADB 连接（会触发手机端「允许 USB 调试」弹窗）
    const credentialStore = new AdbWebCredentialStore()
    const transport = await AdbDaemonTransport.authenticate({
      serial: usbDevice.serial,
      connection: await usbDevice.connect(),
      credentialStore,
    })
    adbInstance = new Adb(transport)

    // 读取设备信息
    const [model, brand, osVersion, sdkVersion] = await Promise.all([
      adbInstance.getProp('ro.product.model').catch(() => ''),
      adbInstance.getProp('ro.product.brand').catch(() => ''),
      adbInstance.getProp('ro.build.version.release').catch(() => ''),
      adbInstance.getProp('ro.build.version.sdk').catch(() => ''),
    ])

    deviceInfo.value = {
      serial: usbDevice.serial,
      model: model.trim(),
      brand: brand.trim(),
      osVersion: osVersion.trim(),
      sdkVersion: sdkVersion.trim(),
    }
    deviceName.value = model.trim()
    step.value = 'info'
  } catch (e) {
    if (e?.name === 'NotFoundError') {
      // 用户取消选择
      close()
      return
    }
    errorMsg.value = e?.message || '连接失败'
    step.value = 'error'
  } finally {
    scanning.value = false
  }
}

async function register() {
  registering.value = true
  try {
    await deviceApi.createDevice({
      serial: deviceInfo.value.serial,
      name: deviceName.value || deviceInfo.value.model || deviceInfo.value.serial,
    })
    ElMessage.success('设备注册成功')
    emit('registered')
    close()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '注册失败')
  } finally {
    registering.value = false
  }
}

function close() {
  dialogVisible.value = false
  scanning.value = false
  // 断开 ADB 连接
  if (adbInstance) {
    try { adbInstance.close() } catch {}
    adbInstance = null
  }
}

onUnmounted(close)
</script>

<style scoped>
.rotating {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
