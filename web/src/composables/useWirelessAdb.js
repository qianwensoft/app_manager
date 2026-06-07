import { ref, computed, watch, nextTick, onUnmounted, unref } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Client } from '@stomp/stompjs'
import QRCode from 'qrcode'
import * as deviceApi from '@/api/device'
import { useAuthStore } from '@/stores/auth'
import { WS_BASE, httpBaseFromWs } from '@/utils/ws'
import { savedWirelessPortFromDevice, WIRELESS_ADB_MENU_INTENT } from '@/utils/wirelessAdb'

/**
 * 无线 ADB 状态与操作（与设备详情 ADB 管理一致）
 * @param {import('vue').MaybeRefOrGetter<string|number|null|undefined>} deviceIdSource
 */
export function useWirelessAdb(deviceIdSource) {
  const auth = useAuthStore()
  const device = ref(null)
  const adbStatus = ref({ usb: null, wireless: null })
  const adbStatusLoading = ref(false)
  const adbDisconnecting = ref(false)
  const pairMethod = ref('code')
  const pairQrCanvas = ref(null)
  const wirelessPairPort = ref(null)
  const wirelessPairCode = ref('')
  const pairing = ref(false)
  const pairResult = ref('')
  const pairSuccess = ref(false)
  const wirelessConnectPort = ref(5555)
  const connecting = ref(false)
  const connectResult = ref('')
  const connectSuccess = ref(false)
  const openingWirelessAdb = ref(false)
  const triggeringWirelessMenu = ref(false)
  const wirelessAdbScanAck = ref('')
  const grantingReadLogs = ref(false)
  const grantReadLogsResult = ref('')
  const grantReadLogsSuccess = ref(false)

  let wirelessAdbStomp = null
  let connectingPollTimer = null

  function stopConnectingPoll() {
    if (connectingPollTimer) {
      clearInterval(connectingPollTimer)
      connectingPollTimer = null
    }
  }

  /** connecting 态短轮询，避免 adb 列表长期卡在 connecting 时页面不更新 */
  function scheduleConnectingPoll() {
    stopConnectingPoll()
    if (adbStatus.value.wireless?.state !== 'connecting') return
    let tries = 0
    connectingPollTimer = setInterval(async () => {
      tries += 1
      if (tries > 8) {
        stopConnectingPoll()
        return
      }
      try {
        const res = await deviceApi.getAdbStatus(deviceId.value)
        adbStatus.value = res || {}
        if (adbStatus.value.wireless?.state !== 'connecting') {
          stopConnectingPoll()
          if (adbStatus.value.wireless?.state === 'device') await loadDevice()
        }
      } catch {
        stopConnectingPoll()
      }
    }, 2000)
  }

  const deviceId = computed(() => {
    const id = unref(deviceIdSource)
    if (id == null || id === '') return null
    return Number(id) || null
  })

  const savedWirelessAdbPort = computed(() => savedWirelessPortFromDevice(device.value))

  const wirelessAdbEndpoint = computed(() => {
    if (adbStatus.value.wireless?.serial) return adbStatus.value.wireless.serial
    const ip = device.value?.ip || adbStatus.value.wireless?.ip || ''
    const port = savedWirelessAdbPort.value || adbStatus.value.wireless?.port
    if (ip && port) return `${ip}:${port}`
    if (port) return `端口 ${port}`
    return ''
  })

  function applyWirelessConnectPortFromDevice(dev = device.value) {
    const p = savedWirelessPortFromDevice(dev)
    if (p != null) wirelessConnectPort.value = p
  }

  async function loadDevice() {
    const id = deviceId.value
    if (!id) {
      device.value = null
      return
    }
    try {
      const res = await deviceApi.getDevice(id)
      device.value = res?.data ?? res
      applyWirelessConnectPortFromDevice(device.value)
    } catch {
      device.value = null
    }
  }

  async function refreshAdbStatus() {
    const id = deviceId.value
    if (!id) return
    adbStatusLoading.value = true
    try {
      const res = await deviceApi.getAdbStatus(id)
      adbStatus.value = res || {}
      if (adbStatus.value.wireless?.state === 'device') {
        await loadDevice()
      } else {
        applyWirelessConnectPortFromDevice()
      }
    } catch (e) {
      ElMessage.error(e?.message || '检测失败')
    } finally {
      adbStatusLoading.value = false
      scheduleConnectingPoll()
    }
  }

  async function renderPairQrCode() {
    await nextTick()
    if (!pairQrCanvas.value || !deviceId.value) return
    const payload = JSON.stringify({
      type: 'wireless_adb_guide',
      deviceId: deviceId.value,
      serverUrl: httpBaseFromWs(WS_BASE),
      deviceToken: String(device.value?.agent_token || '').trim()
    })
    await QRCode.toCanvas(pairQrCanvas.value, payload, { width: 200, margin: 2 })
  }

  function connectWirelessAdbStomp() {
    wirelessAdbStomp?.deactivate()
    const id = deviceId.value
    if (!auth.token || !id) return
    const client = new Client({
      brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(auth.token)}`,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/device/${id}/wireless-adb`, (msg) => {
          try {
            const body = JSON.parse(msg.body)
            if (body.type === 'wireless_adb_guide_ack') {
              const matched = body.data?.token_matched !== false
              wirelessAdbScanAck.value = matched
                ? '手机已扫码并打开无线调试'
                : '手机已扫码（设备 Token 与当前记录不一致，请核对）'
              ElNotification.success({ title: '无线 ADB', message: wirelessAdbScanAck.value, duration: 5000 })
            }
          } catch {
            /* noop */
          }
        })
      }
    })
    client.activate()
    wirelessAdbStomp = client
  }

  function disconnectWirelessAdbStomp() {
    wirelessAdbStomp?.deactivate()
    wirelessAdbStomp = null
  }

  async function openWirelessAdbViaAgent() {
    const id = deviceId.value
    if (!id) return
    openingWirelessAdb.value = true
    try {
      const res = await deviceApi.openWirelessAdbOnAgent(id)
      ElMessage.success(res?.message || res?.data?.message || '已通知 Agent 打开无线调试')
    } catch (e) {
      ElMessage.error(e?.response?.data?.error || e?.message || '下发失败')
    } finally {
      openingWirelessAdb.value = false
    }
  }

  async function triggerWirelessAdbMenu() {
    const id = deviceId.value
    if (!id) return
    triggeringWirelessMenu.value = true
    try {
      const res = await deviceApi.triggerAgentMenu(id, WIRELESS_ADB_MENU_INTENT)
      ElMessage.success(res?.message || res?.data?.message || '已触发 Agent 菜单')
    } catch (e) {
      ElMessage.error(e?.response?.data?.error || e?.message || '触发失败')
    } finally {
      triggeringWirelessMenu.value = false
    }
  }

  async function doAdbDisconnect() {
    const id = deviceId.value
    if (!id) return
    try {
      await ElMessageBox.confirm(
        '确认断开无线 ADB 连接？上次使用的连接端口将保留，便于重新连接。',
        '提示',
        { type: 'warning' }
      )
    } catch {
      return
    }
    adbDisconnecting.value = true
    try {
      await deviceApi.adbWirelessDisconnect(id, false)
      ElMessage.success('已断开，连接端口已保留')
      await refreshAdbStatus()
    } catch (e) {
      ElMessage.error(e?.response?.data?.error || e?.message || '断开失败')
    } finally {
      adbDisconnecting.value = false
    }
  }

  async function doAdbClearRecord() {
    const id = deviceId.value
    if (!id) return
    try {
      await ElMessageBox.confirm('确认清除上次无线 ADB 连接记录？连接端口将恢复为默认 5555。', '提示', {
        type: 'warning'
      })
    } catch {
      return
    }
    adbDisconnecting.value = true
    try {
      await deviceApi.adbWirelessDisconnect(id, true)
      ElMessage.success('已清除记录')
      wirelessConnectPort.value = 5555
      await loadDevice()
      await refreshAdbStatus()
    } catch (e) {
      ElMessage.error(e?.response?.data?.error || e?.message || '清除失败')
    } finally {
      adbDisconnecting.value = false
    }
  }

  async function doPair() {
    const id = deviceId.value
    if (!id) return
    pairResult.value = ''
    pairing.value = true
    try {
      await deviceApi.adbPairByAgentIP(id, wirelessPairPort.value, wirelessPairCode.value)
      pairResult.value = '配对成功，请在第二步中点击「连接」完成建立'
      pairSuccess.value = true
    } catch (e) {
      pairResult.value = e?.response?.data?.error || e?.message || '配对失败'
      pairSuccess.value = false
    } finally {
      pairing.value = false
    }
  }

  async function doConnect() {
    const id = deviceId.value
    if (!id) return
    connectResult.value = ''
    connecting.value = true
    try {
      const res = await deviceApi.adbConnectByAgentIP(id, wirelessConnectPort.value)
      connectResult.value = res?.message || '连接成功'
      connectSuccess.value = true
      if (res?.port) wirelessConnectPort.value = res.port
      await loadDevice()
      applyWirelessConnectPortFromDevice()
      await refreshAdbStatus()
    } catch (e) {
      connectResult.value = e?.response?.data?.error || e?.message || '连接失败'
      connectSuccess.value = false
    } finally {
      connecting.value = false
    }
  }

  async function doGrantReadLogs() {
    const id = deviceId.value
    if (!id) return
    grantReadLogsResult.value = ''
    grantingReadLogs.value = true
    try {
      const res = await deviceApi.grantAgentReadLogs(id)
      grantReadLogsResult.value = res?.message || '授权成功'
      grantReadLogsSuccess.value = true
      ElMessage.success(grantReadLogsResult.value)
    } catch (e) {
      grantReadLogsResult.value = e?.response?.data?.error || e?.message || '授权失败'
      grantReadLogsSuccess.value = false
    } finally {
      grantingReadLogs.value = false
    }
  }

  watch(pairMethod, (v) => {
    if (v === 'qrcode') nextTick(renderPairQrCode)
  })

  watch(
    deviceId,
    async (id) => {
      disconnectWirelessAdbStomp()
      wirelessAdbScanAck.value = ''
      if (!id) {
        device.value = null
        adbStatus.value = { usb: null, wireless: null }
        return
      }
      await loadDevice()
      await refreshAdbStatus()
      connectWirelessAdbStomp()
    },
    { immediate: true }
  )

  onUnmounted(() => {
    stopConnectingPoll()
    disconnectWirelessAdbStomp()
  })

  return {
    device,
    adbStatus,
    adbStatusLoading,
    adbDisconnecting,
    pairMethod,
    pairQrCanvas,
    wirelessPairPort,
    wirelessPairCode,
    pairing,
    pairResult,
    pairSuccess,
    wirelessConnectPort,
    connecting,
    connectResult,
    connectSuccess,
    openingWirelessAdb,
    triggeringWirelessMenu,
    wirelessAdbScanAck,
    grantingReadLogs,
    grantReadLogsResult,
    grantReadLogsSuccess,
    savedWirelessAdbPort,
    wirelessAdbEndpoint,
    WIRELESS_ADB_MENU_INTENT,
    loadDevice,
    refreshAdbStatus,
    renderPairQrCode,
    openWirelessAdbViaAgent,
    triggerWirelessAdbMenu,
    doAdbDisconnect,
    doAdbClearRecord,
    doPair,
    doConnect,
    doGrantReadLogs
  }
}
