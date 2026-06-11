import http from './http'

export const listOutboundApps = () => http.get('/outbound/apps')
export const getOutboundApp = (id) => http.get(`/outbound/apps/${id}`)
export const createOutboundApp = (data) => http.post('/outbound/apps', data)
export const updateOutboundApp = (id, data) => http.put(`/outbound/apps/${id}`, data)
export const deleteOutboundApp = (id) => http.delete(`/outbound/apps/${id}`)
export const cloneOutboundApp = (id) => http.post(`/outbound/apps/${id}/clone`)

export const getOutboundAppTokenStatus = (id) => http.get(`/outbound/apps/${id}/token/status`)
export const postOutboundAppTokenCode = (id) => http.post(`/outbound/apps/${id}/token/code`)
export const postOutboundAppTokenFetch = (id) => http.post(`/outbound/apps/${id}/token/fetch`)
export const postOutboundAppTokenRefresh = (id) => http.post(`/outbound/apps/${id}/token/refresh`)
export const putOutboundAppParams = (id, data) => http.put(`/outbound/apps/${id}/params`, data)

export const listOutboundEndpoints = (params) => http.get('/outbound/endpoints', { params })
export const getOutboundEndpoint = (id) => http.get(`/outbound/endpoints/${id}`)
export const getEndpointParamSchema = (id) => http.get(`/outbound/endpoints/${id}/param-schema`)
export const createOutboundEndpoint = (data) => http.post('/outbound/endpoints', data)
export const postOutboundEndpointDebug = (data) => http.post('/outbound/endpoints/debug', data)
export const updateOutboundEndpoint = (id, data) => http.put(`/outbound/endpoints/${id}`, data)
export const deleteOutboundEndpoint = (id) => http.delete(`/outbound/endpoints/${id}`)

export const listOutboundConnectors = () => http.get('/outbound/connectors')
export const getOutboundConnector = (id) => http.get(`/outbound/connectors/${id}`)
export const getConnectorExecutionTrace = (id, params) =>
  http.get(`/outbound/connectors/${id}/execution-trace`, { params })
export const createOutboundConnector = (data) => http.post('/outbound/connectors', data)
export const updateOutboundConnector = (id, data) => http.put(`/outbound/connectors/${id}`, data)
export const deleteOutboundConnector = (id) => http.delete(`/outbound/connectors/${id}`)

export const getOutboundConnectorDeviceStates = (connectorId) =>
  http.get(`/outbound/connectors/${connectorId}/device-states`)

export const getOutboundConnectorTriggerStatus = (connectorId) =>
  http.get(`/outbound/connectors/${connectorId}/trigger/status`)

export const postOutboundConnectorDevicePause = (connectorId, deviceId) =>
  http.post(`/outbound/connectors/${connectorId}/devices/${deviceId}/pause`)

export const postOutboundConnectorDeviceEnable = (connectorId, deviceId) =>
  http.post(`/outbound/connectors/${connectorId}/devices/${deviceId}/enable`)

export const postOutboundConnectorDeviceExclude = (connectorId, deviceId) =>
  http.post(`/outbound/connectors/${connectorId}/devices/${deviceId}/exclude`)

export const getOutboundTemplateDemo = () => http.get('/outbound/template-demo')
export const postOutboundTemplateExpand = (data) => http.post('/outbound/template-expand', data)
export const getOutboundTemplateVars = () => http.get('/outbound/template-vars')
export const postOutboundPhasePreview = (data) => http.post('/outbound/phase-preview', data)

// 导出导入
export const exportOutboundApp = (id, includeSecrets = false) =>
  http.get(`/outbound/apps/${id}/export`, { params: { include_secrets: includeSecrets } })

export const importOutboundApp = (data) => http.post('/outbound/apps/import', data)

export const validateImportData = (data) => http.post('/outbound/apps/import/validate', data)

export const listOutboundDeliveries = (params) => http.get('/outbound/deliveries', { params })
export const getOutboundDelivery = (id) => http.get(`/outbound/deliveries/${id}`)
export const retryOutboundDelivery = (id) => http.post(`/outbound/deliveries/${id}/retry`)

export const listOutboundWebhooks = (params) => http.get('/outbound/webhooks', { params })
export const getOutboundWebhook = (id) => http.get(`/outbound/webhooks/${id}`)
export const getOutboundWebhookConfig = (id) => http.get(`/outbound/webhooks/${id}/config`)
export const createOutboundWebhook = (data) => http.post('/outbound/webhooks', data)
export const updateOutboundWebhook = (id, data) => http.put(`/outbound/webhooks/${id}`, data)
export const deleteOutboundWebhook = (id) => http.delete(`/outbound/webhooks/${id}`)
export const listOutboundWebhookLogs = (id, params) => http.get(`/outbound/webhooks/${id}/logs`, { params })
export const deleteOutboundWebhookLogs = (id) => http.delete(`/outbound/webhooks/${id}/logs`)

export const listWebhookEventTypes = (webhookId) => http.get(`/outbound/webhooks/${webhookId}/event-types`)
export const createWebhookEventType = (webhookId, data) => http.post(`/outbound/webhooks/${webhookId}/event-types`, data)
export const updateWebhookEventType = (webhookId, etid, data) => http.put(`/outbound/webhooks/${webhookId}/event-types/${etid}`, data)
export const deleteWebhookEventType = (webhookId, etid) => http.delete(`/outbound/webhooks/${webhookId}/event-types/${etid}`)

// 连接器接口模式
export const listConnectorInterfaces = (params) => http.get('/outbound/connector-interfaces', { params })
export const getConnectorInterface = (code) => http.get(`/outbound/connector-interfaces/${code}`)
export const callConnectorInterface = (data) => http.post('/outbound/connector-interfaces/call', data)
export const callConnectorInterfaceByCode = (code, method, params) => {
  const config = {
    method: method.toLowerCase(),
    url: `/outbound/connector-interfaces/${code}/invoke`
  }
  if (method === 'GET') {
    config.params = params
  } else {
    config.data = params
  }
  return http.request(config)
}
