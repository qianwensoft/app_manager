import http from './http'

// ── 资源中心后台配置 API（仅 admin） ──

// 节点树
export const getResourceNodes = () => http.get('/resource-center/nodes')
export const createResourceNode = (data) => http.post('/resource-center/nodes', data)
export const updateResourceNode = (id, data) => http.put(`/resource-center/nodes/${id}`, data)
export const deleteResourceNode = (id) => http.delete(`/resource-center/nodes/${id}`)

// 资源角色
export const getResourceRoles = () => http.get('/resource-center/roles')
export const createResourceRole = (data) => http.post('/resource-center/roles', data)
export const updateResourceRole = (id, data) => http.put(`/resource-center/roles/${id}`, data)
export const deleteResourceRole = (id) => http.delete(`/resource-center/roles/${id}`)
export const setResourceRoleNodes = (id, nodeIds) =>
  http.put(`/resource-center/roles/${id}/nodes`, { node_ids: nodeIds })
export const setResourceRoleUsers = (id, userIds) =>
  http.put(`/resource-center/roles/${id}/users`, { user_ids: userIds })

// 矩阵 + 权限键目录
export const getResourceMatrix = () => http.get('/resource-center/matrix')
export const getResourcePermCatalog = () => http.get('/resource-center/perm-catalog')

// ── 配置面板辅助数据源（复用既有接口） ──

// 设备分组树（组织架构下的 DeviceGroup）
export const getDeviceGroupsTree = () => http.get('/org/device-groups')
// 全部设备（用于「指定设备」选择）
export const getAllDevices = () => http.get('/devices')
// 工单类型（用于「工单管理」节点选择类型）
export const getWorkOrderTypesForConfig = () => http.get('/work-orders/types')
// 用户列表（用于角色绑定用户）
export const getUsersForConfig = () => http.get('/users')
// SCADA 组态列表（用于「组态预览」节点选择）
export const getScadaInfosForConfig = () => http.get('/scada/infos')
// 表单应用列表（用于「表单应用」节点选择）
export const getFormAppsForConfig = () => http.get('/form-app/infos')
