import http from './http'

// ── 资源中心前台运行时 API（任意登录用户） ──

// 当前用户可见资源树
export const getPortalResourceTree = () => http.get('/portal/resource-tree')

// 当前用户解析后的权限集（前端唯一真源）
export const getPortalPermissions = () => http.get('/portal/permissions')

// 资源中心首页概览统计（授权设备数 / 相关工单数 / 节点数量）
export const getPortalStats = () => http.get('/portal/stats')
