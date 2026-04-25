/** STOMP 推送与列表中的 device_id 过滤一致（未选设备则不过滤） */
export function traceTickFiltersDevice(tick, deviceFilter) {
  const fid = deviceFilter != null && deviceFilter !== '' ? Number(deviceFilter) : 0
  if (!fid) return true
  return Number(tick.device_id) === fid
}

function fallbackTraceLabel(row) {
  const typ = String(row.step_type || '')
  if (typ === 'http' && row.endpoint_id) return `HTTP #${row.endpoint_id}`
  if (typ === 'app_script' && row.config?.app_id) {
    const hk = row.config?.hook || 'before_request'
    return `应用脚本 #${row.config.app_id} · ${hk}`
  }
  if (typ === 'view_url') return '打开网页'
  if (typ === 'broadcast_intent') return '广播 Intent'
  if (typ === 'message') return '消息提醒'
  if (typ) return typ
  return row.step_id ? `步骤 #${row.step_id}` : '节点'
}

/**
 * 将单次投递 STOMP tick 合并进 node_stats（与 GET execution-trace 行结构对齐）。
 * @param {Array} nodeStats
 * @param {object} tick
 */
export function mergeOutboundTraceNodeTick(nodeStats, tick) {
  const stepId = Number(tick.step_id)
  if (!stepId) return nodeStats
  const list = Array.isArray(nodeStats) ? [...nodeStats] : []
  const idx = list.findIndex((r) => Number(r.step_id) === stepId)
  const base =
    idx >= 0
      ? { ...list[idx] }
      : {
          phase_id: tick.phase_id,
          step_id: stepId,
          step_type: tick.step_type || '',
          endpoint_id: tick.endpoint_id,
          label: '',
          total: 0,
          success: 0,
          failed: 0,
          last_run: undefined
        }
  if (!base.label) base.label = fallbackTraceLabel(base)
  base.total = Number(base.total || 0) + 1
  const st = String(tick.status || '')
  if (st === 'success') base.success = Number(base.success || 0) + 1
  else if (st === 'failed') base.failed = Number(base.failed || 0) + 1
  if (tick.created_at) base.last_run = tick.created_at
  if (idx >= 0) list[idx] = base
  else list.push(base)
  return list
}
