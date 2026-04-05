import http from './http'

export const getHeartbeatSettings = () => http.get('/settings/heartbeat')
export const updateHeartbeatSettings = (data) => http.put('/settings/heartbeat', data)
