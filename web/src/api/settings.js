import http from './http'

export const getHeartbeatSettings = () => http.get('/settings/heartbeat')
export const updateHeartbeatSettings = (data) => http.put('/settings/heartbeat', data)

export const getSystemInfo = () => http.get('/settings/system-info')
export const updateEnvSettings = (data) => http.put('/settings/env', data)
export const checkFFmpeg = () => http.post('/settings/ffmpeg/check')
export const installFFmpeg = () => http.post('/settings/ffmpeg/install')

// 运行监控
export const getAgentConnections = () => http.get('/settings/agent-connections')
export const getAgentOnlineTrend = (hours = 24) => http.get('/settings/agent-online-trend', { params: { hours } })
export const getApiCallTrend = (hours = 24, granularity = 'hour') =>
  http.get('/settings/api-call-trend', { params: { hours, granularity } })
export const getApiCallDetails = (hours = 24) => http.get('/settings/api-call-details', { params: { hours } })
export const getStompStats = () => http.get('/settings/stomp-stats')

// AI（Claude）配置
export const getClaudeConfig = () => http.get('/settings/claude')
export const updateClaudeConfig = (data) => http.put('/settings/claude', data)

// OnlyOffice Document Server 配置
export const getOnlyOfficeConfig = () => http.get('/settings/onlyoffice')
export const updateOnlyOfficeConfig = (data) => http.put('/settings/onlyoffice', data)

// 系统运行时配置（MinIO / S3 兼容对象存储等）
export const listSystemSettings = () => http.get('/system/settings')
export const getSystemSetting = (key) => http.get(`/system/settings/${key}`)
export const upsertSystemSetting = (key, data) => http.put(`/system/settings/${key}`, data)
export const deleteSystemSetting = (key) => http.delete(`/system/settings/${key}`)

// MinIO 专用端点
export const getMinIOStatus = () => http.get('/system/minio/status')
export const testMinIOConnection = (data) => http.post('/system/minio/test', data)
export const ensureMinIODefaultBucket = () => http.post('/system/minio/ensure-default')
export const presignMinIOUpload = (data) => http.post('/system/minio/presign-upload', data)
export const presignMinIODownload = (data) => http.post('/system/minio/presign-download', data)