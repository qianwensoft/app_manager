import http from './http'

export const uploadAgentAPK = (formData) => http.post('/agent-updates', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
export const listAgentUpdates = () => http.get('/agent-updates')
export const getLatestAgentUpdate = () => http.get('/agent-updates/latest')
export const downloadAgentAPK = (id) => `/api/agent-updates/${id}/download`
export const deleteAgentUpdate = (id) => http.delete(`/agent-updates/${id}`)
