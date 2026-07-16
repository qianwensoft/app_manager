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
  reopened: 'warning'
}[s])

export const priorityType = (p) => ({ normal: 'info', high: 'warning', urgent: 'danger' }[p] || 'info')

// 优先级中文展示（避免列表/看板直接显示 normal/high/urgent）
export const priorityLabel = (p) => ({ normal: '普通', high: '较高', urgent: '紧急' }[p] || p || '普通')

// 工单事件（用于外发 webhook 监听配置）
export const workOrderEvents = [
  { value: 'work_order.created', label: '工单创建' },
  { value: 'work_order.updated', label: '工单更新' },
  { value: 'work_order.status_changed', label: '状态变更' },
  { value: 'work_order.assigned', label: '工单分配' },
  { value: 'work_order.closed', label: '工单关闭' },
  { value: 'work_order.reopened', label: '工单重开' },
  { value: 'work_order.tags_changed', label: '标签变更' },
  { value: 'work_order.archived', label: '工单归档' },
  { value: 'work_order.commented', label: '工单评论' }
]

// 工单事件 payload 可用参数（外发 webhook 入参映射的「值来源」候选）。
// 须与 server/api/work_order_webhook.go workOrderEventPayload 的键保持一致。
// 分组展示，便于查找和理解
export const workOrderEventParams = [
  // 工单基础信息
  { key: 'event', label: '事件类型', category: '基础信息' },
  { key: 'id', label: '工单ID', category: '基础信息' },
  { key: 'code', label: '工单编号', category: '基础信息' },
  { key: 'type_code', label: '类型编码', category: '基础信息' },
  { key: 'type_name', label: '类型名称', category: '基础信息' },
  { key: 'type_description', label: '类型描述', category: '基础信息' },
  { key: 'title', label: '工单标题', category: '基础信息' },
  { key: 'description', label: '工单描述', category: '基础信息' },
  { key: 'status', label: '工单状态（编码）', category: '基础信息' },
  { key: 'status_name', label: '工单状态（名称）', category: '基础信息' },
  { key: 'priority', label: '优先级（编码）', category: '基础信息' },
  { key: 'priority_name', label: '优先级（名称）', category: '基础信息' },
  { key: 'visibility', label: '可见性', category: '基础信息' },
  { key: 'external_ref', label: '外部系统工单号', category: '基础信息' },
  { key: 'other_codes', label: '其他编码', category: '基础信息' },
  { key: 'data_json', label: '表单字段JSON', category: '基础信息' },
  { key: 'tags', label: '工单标签（编码）', category: '基础信息' },
  { key: 'tags_names', label: '工单标签（名称）', category: '基础信息' },
  { key: 'archived', label: '是否已归档', category: '基础信息' },
  { key: 'actor', label: '当前操作人', category: '基础信息' },

  // 提交设备信息（快照）
  { key: 'device_id', label: '设备ID', category: '设备（快照）' },
  { key: 'device_name', label: '设备名称', category: '设备（快照）' },
  { key: 'device_alias_server', label: '设备别名-后台', category: '设备（快照）' },
  { key: 'device_alias_agent', label: '设备别名-端侧', category: '设备（快照）' },
  { key: 'device_group', label: '设备分组', category: '设备（快照）' },

  // 提交设备信息（当前实时）
  { key: 'device_serial', label: '设备序列号', category: '设备（实时）' },
  { key: 'device_name_current', label: '设备当前名称', category: '设备（实时）' },
  { key: 'device_alias_server_current', label: '设备当前别名-后台', category: '设备（实时）' },
  { key: 'device_alias_agent_current', label: '设备当前别名-端侧', category: '设备（实时）' },
  { key: 'device_group_current', label: '设备当前分组', category: '设备（实时）' },
  { key: 'device_model', label: '设备型号', category: '设备（实时）' },
  { key: 'device_brand', label: '设备品牌', category: '设备（实时）' },
  { key: 'device_os_version', label: '操作系统版本', category: '设备（实时）' },
  { key: 'device_status', label: '设备状态', category: '设备（实时）' },
  { key: 'device_ip', label: '设备IP地址', category: '设备（实时）' },
  { key: 'device_battery', label: '设备电量', category: '设备（实时）' },

  // 提交用户信息
  { key: 'created_by_id', label: '提交人ID', category: '提交人' },
  { key: 'created_by_username', label: '提交人用户名', category: '提交人' },
  { key: 'created_by_role', label: '提交人角色', category: '提交人' },
  { key: 'submitter', label: '提交人（兼容）', category: '提交人' },

  // 分配人信息
  { key: 'assigned_to_id', label: '分配给ID', category: '分配人' },
  { key: 'assigned_to_username', label: '分配给用户名', category: '分配人' },

  // 关闭人信息
  { key: 'closed_by_id', label: '关闭人ID', category: '关闭人' },
  { key: 'closed_by_username', label: '关闭人用户名', category: '关闭人' },
  { key: 'closed_at', label: '关闭时间', category: '关闭人' },
  { key: 'settled_at', label: '结算时间(耗时终点)', category: '关闭人' },

  // 归档人信息
  { key: 'archived_by_id', label: '归档人ID', category: '归档人' },
  { key: 'archived_by_username', label: '归档人用户名', category: '归档人' },
  { key: 'archived_at', label: '归档时间', category: '归档人' },

  // 时间信息
  { key: 'created_at', label: '工单创建时间', category: '时间' },
  { key: 'updated_at', label: '工单更新时间', category: '时间' },
  { key: 'ts', label: '事件触发时间戳', category: '时间' }
]

// 按分类分组的参数（用于更好的 UI 展示）
export const workOrderEventParamsByCategory = workOrderEventParams.reduce((acc, param) => {
  const cat = param.category || '其他'
  if (!acc[cat]) acc[cat] = []
  acc[cat].push(param)
  return acc
}, {})

// 参数分类顺序
export const paramCategories = [
  '基础信息',
  '设备（快照）',
  '设备（实时）',
  '提交人',
  '分配人',
  '关闭人',
  '归档人',
  '时间'
]

