/**
 * app 级常驻事件流注册。
 *
 * 与页面级事件（随 SchemaFormRenderer 挂载/卸载）不同，scope==='app' 的事件流
 * 在 MultiPageRuntime 挂载时注册一次、跨页面存活，离开 form-app 时清理。
 *
 * current≠target 守卫（设计 4.2）：app 级事件触发时「当前活动页」可能不是动作
 * 想操作的页。page 作用域的写入（set_field / set_field_prop）经一个「活动页代理」
 * 转发——有活动页则写入，无活动页（如列表/详情页或切页间隙）则 no-op + 开发期 warn，
 * 不报错、不写脏数据。写 $app / toast / speak / navigate 等与当前页 DOM 无关的动作永远生效。
 *
 * 详见 docs/第2步-AppState落地设计.md。
 */
import type { StateScope } from './pageState'
import type { PageEvent } from './eventTypes'
import { setupPageEvents, type EventEngineDeps } from './eventEngine'
import { setupCrossDeviceReceiver, teardownCrossDeviceReceiver } from './crossDevice/receiver'
import { eventManager } from './EventHandler'

/** 当前活动页 pageState 的间接持有者：活动页挂载时 set、卸载时置 null。 */
export interface ActivePageRef {
  current: StateScope | null
}

const isDev = (() => {
  try { return Boolean((import.meta as any)?.env?.DEV) } catch { return false }
})()

/**
 * 构造「活动页代理」StateScope：读写转发给 ref.current；无活动页时安全降级。
 * - get/getValues：无活动页返回空，不抛错
 * - set/setProp：无活动页则 no-op + 开发期 warn（current≠target 守卫）
 * - subscribe：app 级事件不应通过此代理订阅页面字段（页面字段订阅属页面级事件），返回 no-op
 */
export function createActivePageProxy(ref: ActivePageRef): StateScope {
  const warnNoPage = (op: string, path: string) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(`[app-event] 当前无活动页，跳过 page 作用域 ${op}('${path}')。如需跨页传值请写 $app 并在目标页 page_enter 读取。`)
    }
  }
  return {
    getValues: () => ref.current?.getValues() ?? {},
    get: (path) => ref.current?.get(path),
    set: (path, value) => {
      if (!ref.current) { warnNoPage('set', path); return }
      ref.current.set(path, value)
    },
    setProp: (path, prop, value) => {
      if (!ref.current) { warnNoPage('setProp', path); return }
      ref.current.setProp(path, prop, value)
    },
    subscribe: () => () => {},
  }
}

export interface SetupAppEventsDeps {
  appState: StateScope
  formAppCode?: string
  activePageRef: ActivePageRef
  onScanInterface?: EventEngineDeps['onScanInterface']
  doPrint?: EventEngineDeps['doPrint']
  navigate?: EventEngineDeps['navigate']
  toast?: EventEngineDeps['toast']
}

/**
 * 注册所有 scope==='app' 的事件流。返回 cleanup。
 * triggerButton/triggerLifecycle 暂不向 app 级暴露（按钮/生命周期是页面级语义）。
 */
export function setupAppEvents(
  allEvents: PageEvent[],
  deps: SetupAppEventsDeps,
): () => void {
  const appEvents = (allEvents || []).filter(e => e.scope === 'app')
  if (appEvents.length === 0) return () => {}

  const pageProxy = createActivePageProxy(deps.activePageRef)
  const { cleanup } = setupPageEvents(appEvents, {
    pageState: pageProxy,
    appState: deps.appState,
    formAppCode: deps.formAppCode,
    onScanInterface: deps.onScanInterface,
    doPrint: deps.doPrint,
    navigate: deps.navigate,
    toast: deps.toast,
  })

  // 注册跨设备事件接收器（第 7a 步：同设备跨 app）
  if (deps.formAppCode) {
    setupCrossDeviceReceiver(deps.formAppCode, (event, payload, hop) => {
      // 构造 custom_event 源事件，携带 payload 和 hop
      // eventManager.emit 会触发所有监听该 event 的 custom_event 流
      const dataWithHop = JSON.stringify({ ...payload, _hop: hop })
      eventManager.emit(event, dataWithHop)
    })
  }

  return () => {
    cleanup()
    teardownCrossDeviceReceiver()
  }
}
