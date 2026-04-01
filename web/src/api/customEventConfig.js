import http from './http'

export const listCustomEventGroups = () => http.get('/custom-event-groups')
export const createCustomEventGroup = (data) => http.post('/custom-event-groups', data)
export const updateCustomEventGroup = (id, data) => http.put(`/custom-event-groups/${id}`, data)
export const deleteCustomEventGroup = (id) => http.delete(`/custom-event-groups/${id}`)

export const listCustomEventDefinitions = (params) =>
  http.get('/custom-event-definitions', { params })
export const getCustomEventDefinition = (id) => http.get(`/custom-event-definitions/${id}`)
export const createCustomEventDefinition = (data) => http.post('/custom-event-definitions', data)
export const updateCustomEventDefinition = (id, data) => http.put(`/custom-event-definitions/${id}`, data)
export const deleteCustomEventDefinition = (id) => http.delete(`/custom-event-definitions/${id}`)

/** 向指定分组一键导入常用 PDA 扫码 Intent 模板（已存在的 key 会跳过） */
export const importPdaScanPresets = (groupId) =>
  http.post('/custom-event-definitions/import-pda-presets', { group_id: groupId })
