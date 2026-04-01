import http from './http'

export const getHeartbeatSettings = () => http.get('/api/settings/heartbeat')
export const updateHeartbeatSettings = (data) => http.put('/api/settings/heartbeat', data)
