import http from './http'

export interface DataInterfaceItem {
  id: number
  name: string
  code: string
  slug: string
  kind: string
  enabled: boolean
  schema_json?: string
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
