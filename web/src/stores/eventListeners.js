import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { addProfileHubListener, removeProfileHubListener } from '@/utils/deviceProfileStompHub'

let idSeq = 0
function genId() {
  return `lst-${++idSeq}-${Date.now()}`
}

export const useEventListenerStore = defineStore('eventListeners', () => {
  const entries = ref([])

  function unregister(id) {
    const i = entries.value.findIndex((e) => e.id === id)
    if (i >= 0) entries.value.splice(i, 1)
  }

  /**
   * 撤销监听并从列表移除
   * @param {string} id
   */
  function revoke(id) {
    const e = entries.value.find((x) => x.id === id)
    if (!e) return
    try {
      e.revoke()
    } catch (err) {
      console.warn('listener revoke', err)
    }
    unregister(id)
  }

  /**
   * 共享 /topic/devices：多页面共用一条连接，按作用域过滤
   * @param {{ sourceLabel: string, deviceScopeId?: number|string|null, deviceScopeLabel?: string, onEvent: (j: object) => void }} opts
   */
  function attachProfileListener(opts) {
    const id = genId()
    const { sourceLabel, deviceScopeId = null, deviceScopeLabel, onEvent } = opts

    const scopeLabel =
      deviceScopeLabel ??
      (deviceScopeId != null && deviceScopeId !== ''
        ? `设备 #${deviceScopeId}`
        : '全部设备')

    const wrapped = (j) => {
      if (j?.type !== 'device_profile_updated') return
      if (
        deviceScopeId != null &&
        deviceScopeId !== '' &&
        Number(j.device_id) !== Number(deviceScopeId)
      ) {
        return
      }
      onEvent(j)
    }

    addProfileHubListener(id, wrapped)

    entries.value.push({
      id,
      eventKey: 'device_profile_updated',
      eventLabel: '设备资料更新',
      topic: '/topic/devices',
      deviceId:
        deviceScopeId != null && deviceScopeId !== '' ? Number(deviceScopeId) : null,
      deviceScopeLabel: scopeLabel,
      sourceLabel,
      createdAt: Date.now(),
      kind: 'stomp_profile',
      revoke: () => {
        removeProfileHubListener(id)
      }
    })
    return id
  }

  /**
   * 录屏进度等独立 STOMP 连接，由调用方在 onRevoke 里关闭连接
   */
  function registerRecordingListener({ deviceId, deviceLabel, sourceLabel, onRevoke }) {
    const id = genId()
    entries.value.push({
      id,
      eventKey: 'recording_progress',
      eventLabel: '录屏进度',
      topic: `/topic/device/${deviceId}/recording`,
      deviceId: Number(deviceId),
      deviceScopeLabel: deviceLabel || `设备 #${deviceId}`,
      sourceLabel,
      createdAt: Date.now(),
      kind: 'stomp_recording',
      revoke: () => {
        try {
          onRevoke()
        } catch {
          /* noop */
        }
      }
    })
    return id
  }

  /**
   * 注册一个“外部管理”的监听（例如某个页面内自建 STOMP Client）。
   * store 仅负责展示与触发 onRevoke。
   */
  function registerExternalListener({
    eventKey,
    eventLabel,
    topic,
    deviceId = null,
    deviceLabel,
    sourceLabel,
    onRevoke
  }) {
    const id = genId()
    entries.value.push({
      id,
      eventKey,
      eventLabel: eventLabel || eventKey,
      topic,
      deviceId: deviceId == null || deviceId === '' ? null : Number(deviceId),
      deviceScopeLabel:
        deviceLabel ??
        (deviceId == null || deviceId === '' ? '全部设备' : `设备 #${deviceId}`),
      sourceLabel,
      createdAt: Date.now(),
      kind: 'external',
      revoke: () => {
        try {
          onRevoke?.()
        } catch {
          /* noop */
        }
      }
    })
    return id
  }

  const groupedByEvent = computed(() => {
    const m = new Map()
    for (const e of entries.value) {
      const key = e.eventKey
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(e)
    }
    return Array.from(m.entries()).map(([eventKey, list]) => ({
      eventKey,
      eventLabel: list[0]?.eventLabel ?? eventKey,
      items: list
    }))
  })

  const groupedByDevice = computed(() => {
    const m = new Map()
    for (const e of entries.value) {
      const key = e.deviceId == null ? '__global__' : String(e.deviceId)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(e)
    }
    return Array.from(m.entries()).map(([key, list]) => ({
      deviceKey: key,
      deviceTitle:
        key === '__global__'
          ? '全局（未绑定单台设备）'
          : list[0]?.deviceScopeLabel || `设备 #${key}`,
      items: list
    }))
  })

  return {
    entries,
    groupedByEvent,
    groupedByDevice,
    revoke,
    unregister,
    attachProfileListener,
    registerRecordingListener,
    registerExternalListener
  }
})
