// 工单状态/优先级常量与展示映射

export const statusOptions = [
  { value: 'open', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
  { value: 'reopened', label: '重新打开' }
]

const statusMap = Object.fromEntries(statusOptions.map(s => [s.value, s.label]))
export const statusLabel = (s) => statusMap[s] || s

export const statusType = (s) => ({
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  closed: '',
  reopened: 'warning'
}[s] || '')

export const priorityType = (p) => ({ normal: 'info', high: 'warning', urgent: 'danger' }[p] || 'info')

// 工单事件（用于外发 webhook 监听配置）
export const workOrderEvents = [
  { value: 'work_order.created', label: '工单创建' },
  { value: 'work_order.status_changed', label: '状态变更' },
  { value: 'work_order.closed', label: '工单关闭' }
]

// 工单事件 payload 可用参数（外发 webhook 入参映射的「值来源」候选）。
// 须与 server/api/work_order_webhook.go workOrderEventPayload 的键保持一致。
export const workOrderEventParams = [
  { key: 'event', label: '事件类型' },
  { key: 'id', label: '工单ID' },
  { key: 'code', label: '工单号' },
  { key: 'type_code', label: '类型编码' },
  { key: 'device_id', label: '设备ID' },
  { key: 'title', label: '标题' },
  { key: 'description', label: '描述' },
  { key: 'status', label: '状态' },
  { key: 'priority', label: '优先级' },
  { key: 'visibility', label: '可见性' },
  { key: 'external_ref', label: '外部单号' },
  { key: 'other_codes', label: '其他编码' },
  { key: 'device_name', label: '设备名称' },
  { key: 'device_alias_server', label: '设备别名(后台)' },
  { key: 'device_alias_agent', label: '设备别名(端)' },
  { key: 'device_group', label: '设备分组' },
  { key: 'actor', label: '操作人' },
  { key: 'data_json', label: '表单字段JSON' },
  { key: 'ts', label: '时间戳' }
]

