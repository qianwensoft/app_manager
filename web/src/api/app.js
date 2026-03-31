import http from './http'

export const uploadApp = (formData, onProgress) =>
  http.post('/apps/upload', formData, {
    timeout: 600000,
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded * 100) / e.total))
  })
export const getApps = () => http.get('/apps')
export const getApp = (id) => http.get(`/apps/${id}`)
export const updateAppMeta = (id, data) => http.put(`/apps/${id}`, data)
export const deleteApp = (id) => http.delete(`/apps/${id}`)
export const installApp = (id, deviceIds, options = {}) =>
  http.post(`/apps/${id}/install`, { device_ids: deviceIds, ...options })
export const uninstallApp = (id, deviceIds) => http.post(`/apps/${id}/uninstall`, { device_ids: deviceIds })
