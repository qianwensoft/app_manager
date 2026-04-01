import http from './http'

export const uploadAgentAPK = (formData) => http.post('/api/agent-updates', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
export const listAgentUpdates = () => http.get('/api/agent-updates')
export const getLatestAgentUpdate = () => http.get('/api/agent-updates/latest')
export const downloadAgentAPK = (id) => `/api/agent-updates/${id}/download`
