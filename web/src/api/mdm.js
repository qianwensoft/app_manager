import http from './http'

// ── MDM 企业标识管理（admin）─────────────────────────────────────────────
export const listMDMEnterprises  = ()        => http.get('/mdm/enterprises')
export const createMDMEnterprise = (data)    => http.post('/mdm/enterprises', data)
export const updateMDMEnterprise = (id, data)=> http.put(`/mdm/enterprises/${id}`, data)
export const deleteMDMEnterprise = (id)      => http.delete(`/mdm/enterprises/${id}`)

// ── 设备 MDM 配置 ─────────────────────────────────────────────────────────
export const getDeviceMDM        = (deviceId)      => http.get(`/devices/${deviceId}/mdm`)
export const updateDeviceMDM     = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm`, data)

// 触发 Agent 上报 MDM 能力（同步等待，最长 12s）
export const syncDeviceMDMStatus = (deviceId) =>
  http.post(`/devices/${deviceId}/mdm/sync`, {}, { timeout: 15000 })

// NTP 配置：POST = 读取设备当前值；PUT = 下发修改
export const fetchDeviceNTPConfig = (deviceId) =>
  http.post(`/devices/${deviceId}/mdm/ntp`, {}, { timeout: 12000 })

export const setDeviceNTPConfig = (deviceId, data) =>
  http.put(`/devices/${deviceId}/mdm/ntp`, data, { timeout: 12000 })

// ── Device Owner 策略 ────────────────────────────────────────────────────────
const dpmTimeout = { timeout: 12000 }

export const lockDevice          = (deviceId)      => http.post(`/devices/${deviceId}/mdm/lock`, {}, dpmTimeout)
export const prepareWipeDevice   = (deviceId)      => http.post(`/devices/${deviceId}/mdm/wipe/prepare`, {})
export const confirmWipeDevice   = (deviceId, data)=> http.post(`/devices/${deviceId}/mdm/wipe/confirm`, data, dpmTimeout)
export const mdmRebootDevice     = (deviceId)      => http.post(`/devices/${deviceId}/mdm/reboot`, {}, dpmTimeout)
export const setHardwarePolicy   = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/hardware`, data, dpmTimeout)
export const setPasswordPolicy   = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/password-policy`, data, dpmTimeout)
export const setUserRestriction  = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/user-restriction`, data, dpmTimeout)
export const setAppRestriction   = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/app-restriction`, data, dpmTimeout)
export const setKioskMode        = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/kiosk`, data, dpmTimeout)
export const setDeviceTime       = (deviceId, data)=> http.put(`/devices/${deviceId}/mdm/time`, data, dpmTimeout)
export const getPolicySnapshot   = (deviceId)      => http.post(`/devices/${deviceId}/mdm/policy-snapshot`, {}, dpmTimeout)
export const clearAllMDMPolicies = (deviceId)      => http.post(`/devices/${deviceId}/mdm/clear-policies`, {}, dpmTimeout)
export const revokeDeviceOwner   = (deviceId)      => http.post(`/devices/${deviceId}/mdm/revoke-do`, {}, dpmTimeout)
