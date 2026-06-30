import http from './http'

export interface DataInterfaceItem {
  id: number
  name: string
  code: string
  slug: string
  kind: string
  enabled: boolean
  schema_json?: string
  param_contract_json?: string  // ParamSpec[] 参数契约
  group_id?: number
}

export interface OutboundAppItem {
  id: number
  name: string
  code: string
}

export interface OutboundWebhookItem {
  id: number
  app_id: number
  name: string
  description?: string
  response_schema?: string
  enabled: boolean
}

export interface OutboundEndpointItem {
  id: number
  app_id: number
  app_name?: string
  name: string
  method: string
  path: string
  param_schema?: string
  response_schema?: string
  enabled: boolean
}

export interface ScadaSimPointItem {
  id: number
  link_name: string
  mode: string
  enabled: boolean
  interval_ms: number
  params_json: string
}

export interface SimHistoryPoint {
  t: number   // Unix ms
  v: number
}

export const dataBindingApi = {
  listDataInterfaces: (): Promise<{ data: DataInterfaceItem[] }> =>
    http.get('/data/interfaces'),

  listOutboundApps: (): Promise<{ data: OutboundAppItem[] }> =>
    http.get('/outbound/apps'),

  listOutboundWebhooks: (appId: number): Promise<{ data: OutboundWebhookItem[] }> =>
    http.get(`/outbound/apps/${appId}/webhooks`),

  listOutboundEndpoints: (appId: number): Promise<{ data: OutboundEndpointItem[] }> =>
    http.get('/outbound/endpoints', { params: { app_id: appId } }),

  listSimPoints: (scadaCode?: string): Promise<{ data: ScadaSimPointItem[] }> =>
    http.get('/scada/sim-points', { params: scadaCode ? { scada_code: scadaCode } : {} }),

  fetchSimHistory: (
    scadaCode: string,
    keys: string[],
    limit?: number,
  ): Promise<{ data: Record<string, SimHistoryPoint[]> }> =>
    http.get(`/scada/sim-points/history/${scadaCode}`, {
      params: { keys: keys.join(','), ...(limit ? { limit } : {}) },
    }),
}
