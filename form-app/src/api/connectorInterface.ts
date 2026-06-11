// 连接器接口调用
import { authed } from '../console/api'

export interface ConnectorInterface {
  id: number
  name: string
  description: string
  interface_code: string
  input_params_json: string
  output_schema_json: string
  enabled: boolean
}

export interface ConnectorCallResult {
  success: boolean
  data?: Record<string, any>
  error?: string
  duration_ms: number
  step_count: number
}

export async function listConnectorInterfaces(code?: string): Promise<ConnectorInterface[]> {
  const query = code ? `?code=${encodeURIComponent(code)}` : ''
  const res = await authed(`/api/outbound/connector-interfaces${query}`, 'GET')
  return res.data || []
}

export async function getConnectorInterface(code: string): Promise<ConnectorInterface> {
  return authed(`/api/outbound/connector-interfaces/${encodeURIComponent(code)}`, 'GET')
}

export async function callConnectorInterface(
  connectorCode: string,
  params: Record<string, any>,
  deviceId?: number
): Promise<ConnectorCallResult> {
  return authed('/api/outbound/connector-interfaces/call', 'POST', {
    connector_code: connectorCode,
    params,
    device_id: deviceId,
  })
}
