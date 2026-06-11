// 第三方 API 端点管理
import { authed } from '../console/api'

export interface ThirdPartyProvider {
  id: number
  name: string
  type: string
  open_api_origin: string
  enabled: boolean
}

export interface ThirdPartyApiEndpoint {
  id: number
  provider_id: number
  provider?: ThirdPartyProvider
  code: string
  name: string
  description: string
  method: string
  path: string
  headers_json: string
  param_schema_json: string
  response_path_json: string
  enabled: boolean
}

export async function listThirdPartyProviders(): Promise<ThirdPartyProvider[]> {
  const res = await authed('/api/thirdparty', 'GET')
  return res
}

export async function listThirdPartyApiEndpoints(providerId?: number): Promise<ThirdPartyApiEndpoint[]> {
  const query = providerId ? `?provider_id=${providerId}` : ''
  const res = await authed(`/api/thirdparty/endpoints${query}`, 'GET')
  return res.data || []
}

export async function getThirdPartyApiEndpoint(id: number): Promise<ThirdPartyApiEndpoint> {
  return authed(`/api/thirdparty/endpoints/${id}`, 'GET')
}

export async function createThirdPartyApiEndpoint(data: Partial<ThirdPartyApiEndpoint>): Promise<ThirdPartyApiEndpoint> {
  return authed('/api/thirdparty/endpoints', 'POST', data)
}

export async function updateThirdPartyApiEndpoint(id: number, data: Partial<ThirdPartyApiEndpoint>): Promise<ThirdPartyApiEndpoint> {
  return authed(`/api/thirdparty/endpoints/${id}`, 'PUT', data)
}

export async function deleteThirdPartyApiEndpoint(id: number): Promise<void> {
  await authed(`/api/thirdparty/endpoints/${id}`, 'DELETE')
}

export async function callThirdPartyApi(endpointCode: string, params: Record<string, any>): Promise<any> {
  return authed('/api/thirdparty/call', 'POST', {
    endpoint_code: endpointCode,
    params,
  })
}
