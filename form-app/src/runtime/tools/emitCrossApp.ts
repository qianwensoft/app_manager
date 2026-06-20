import { registerTool } from './types'
import { emitCrossApp, isCrossAppBridgeAvailable } from '../crossDevice/bridge'

/**
 * 跨 form-app emit（第 7a 步：同设备 AndroidBridge 中继）。
 *
 * 动作参数：
 * - target_form_code: 目标 form-app 编码（必填）
 * - event_name: 事件名（必填）
 * - data_src: 载荷数据源（可选，支持 $form/$app/$event/$node）
 *
 * 对端收到后构造 EventContext：
 * - ctx.event = payload（唯一可信数据源）
 * - ctx.form/app/nodeOutputs = 对端本地值（非来源端）
 *
 * 典型场景：PDA 盘点 app → 触发入库 app 刷新列表。
 */
registerTool({
  name: 'emit_cross_app',
  execute: async (a, { resolve, ctx, deps }) => {
    if (!a.target_form_code || !a.event_name) {
      console.warn('[emit_cross_app] target_form_code 和 event_name 必填')
      return
    }

    // 检查 AndroidBridge 可用性
    if (!isCrossAppBridgeAvailable()) {
      console.warn('[emit_cross_app] AndroidBridge 不可用（非 Agent 环境或版本过旧），跳过跨 app emit')
      return
    }

    // 当前 form-app 编码（origin.formCode）
    const currentFormCode = deps.formAppCode || 'unknown'

    // 解析载荷数据源
    let payload: Record<string, any> = {}
    if (a.data_src !== undefined && a.data_src !== '') {
      const raw = resolve(a.data_src)
      // 载荷必须是纯 JSON 对象（A2 契约）
      if (raw != null && typeof raw === 'object') {
        payload = raw
      } else if (raw != null) {
        // 非对象转为 {value: x}
        payload = { value: raw }
      }
    }

    // 父事件的 hop（若当前事件由跨设备事件触发，从 ctx 取；否则 0）
    const parentHop = (ctx as any)._crossDeviceHop || 0

    emitCrossApp(
      currentFormCode,
      { formCode: a.target_form_code },
      a.event_name,
      payload,
      parentHop,
    )
  },
})
