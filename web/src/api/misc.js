import http from './http'

export const getTasks = () => http.get('/tasks')
export const getTask = (id) => http.get(`/tasks/${id}`)
export const cancelTask = (id) => http.delete(`/tasks/${id}`)
export const getAuditLogs = () => http.get('/audit')
export const getScopeCatalog = () => http.get('/auth/scope-catalog')
export const getApiKeys = () => http.get('/auth/apikey')
export const createApiKey = (data) => http.post('/auth/apikey', data)
export const revokeApiKey = (id) => http.delete(`/auth/apikey/${id}`)
