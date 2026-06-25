/**
 * 跨设备事件载荷契约（基于 docs/A2-跨设备事件载荷契约设计.md v1.1）。
 *
 * 第 7a 步（同设备跨 form-app）：经 AndroidBridge 本地中继。
 * 第 7b 步（跨设备 STOMP）：经服务端 /api/form-app/cross-event 端点。
 */

/** 跨设备事件信封（序列化后经 AndroidBridge/STOMP 传输） */
export interface CrossDeviceEvent {
  /** 事件名（对端以 custom_event 源监听此名） */
  event: string
  /** 自包含数据快照（纯 JSON，对端经 $event.x 读取） */
  payload: Record<string, any>
  /** 来源标识（诊断 + 防回环，非寻址依赖） */
  origin: {
    formCode: string      // 来源 form-app
    deviceId?: string     // 来源设备（agent 注册 id，同设备跨 app 时可选）
    emittedAt: number     // 毫秒时间戳
    eventId: string       // 幂等去重键（uuid）
  }
  /** 跨设备跳数（诊断/防风暴；超限 log 不丢弃） */
  hop: number
}

/** 同设备跨 app：目标寻址 */
export interface CrossAppTarget {
  /** 目标 form-app 编码（必填） */
  formCode: string
}

/** 跨设备 STOMP：topic 寻址（7b 步） */
export interface CrossDeviceTarget {
  /** 目标 form-app（广播给所有订阅该 app 的运行时） */
  formCode?: string
  /** 定向到某设备（点对点） */
  deviceId?: string
}
