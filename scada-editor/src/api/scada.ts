import http from './http'
import type { ScadaGroup, ScadaInfo, ScadaSimPoint } from '@/types'

export interface ScadaAccessPolicy {
  id: number
  scada_id: number
  target_type: 'device' | 'user' | 'department' | 'position'
  target_id: number
  expire_at?: string | null
  expire_url: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface CustomizeComponent {
  id: number
  name: string
  code: string
  type: string
  file_url: string
}

export const scadaApi = {
  // groups
  listGroups: (): Promise<{ data: ScadaGroup[] }> =>
    http.get('/scada/groups'),

  createGroup: (body: Partial<ScadaGroup>): Promise<{ data: ScadaGroup }> =>
    http.post('/scada/groups', body),

  updateGroup: (id: number, body: Partial<ScadaGroup>): Promise<{ data: ScadaGroup }> =>
    http.put(`/scada/groups/${id}`, body),

  deleteGroup: (id: number): Promise<void> =>
    http.delete(`/scada/groups/${id}`),

  // infos
  listInfos: (groupId?: number): Promise<{ data: ScadaInfo[] }> =>
    http.get('/scada/infos', { params: groupId ? { group_id: groupId } : {} }),

  getInfo: (id: number): Promise<{ data: ScadaInfo }> =>
    http.get(`/scada/infos/${id}`),

  getInfoByCode: (code: string): Promise<{ data: ScadaInfo }> =>
    http.get(`/scada/infos/code/${code}`),

  createInfo: (body: Partial<ScadaInfo>): Promise<{ data: ScadaInfo }> =>
    http.post('/scada/infos', body),

  updateInfo: (id: number, body: Partial<ScadaInfo>): Promise<{ data: ScadaInfo }> =>
    http.put(`/scada/infos/${id}`, body),

  deleteInfo: (id: number): Promise<void> =>
    http.delete(`/scada/infos/${id}`),

  // canvas
  saveCanvas: (body: { id: number; canvas_data: string; preview_image?: string }): Promise<{ data: ScadaInfo }> =>
    http.post(`/scada/infos/${body.id}/save-canvas`, { canvas_data: body.canvas_data, preview_image: body.preview_image }),

  publish: (id: number): Promise<{ data: ScadaInfo }> =>
    http.post(`/scada/infos/${id}/publish`),

  getByShareToken: (token: string): Promise<{ data: ScadaInfo }> =>
    http.get(`/scada/info/share/${token}`),

  // sim points
  listSimPoints: (scadaCode?: string): Promise<{ data: ScadaSimPoint[] }> =>
    http.get('/scada/sim-points', { params: scadaCode ? { scada_code: scadaCode } : {} }),

  createSimPoint: (body: Partial<ScadaSimPoint>): Promise<{ data: ScadaSimPoint }> =>
    http.post('/scada/sim-points', body),

  updateSimPoint: (id: number, body: Partial<ScadaSimPoint>): Promise<{ data: ScadaSimPoint }> =>
    http.put(`/scada/sim-points/${id}`, body),

  deleteSimPoint: (id: number): Promise<void> =>
    http.delete(`/scada/sim-points/${id}`),

  // customize components
  listCustomizeComponents: (): Promise<{ data: CustomizeComponent[] }> =>
    http.get('/scada/customize/components'),

  createCustomizeComponent: (form: FormData): Promise<{ data: CustomizeComponent }> =>
    http.post('/scada/customize/component/create', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  deleteCustomizeComponent: (id: number): Promise<void> =>
    http.delete(`/scada/customize/component/${id}`),

  // access policies
  listAccessPolicies: (scadaId: number): Promise<{ items: ScadaAccessPolicy[] }> =>
    http.get(`/scada/infos/${scadaId}/access-policies`),

  createAccessPolicy: (scadaId: number, body: Partial<ScadaAccessPolicy>): Promise<ScadaAccessPolicy> =>
    http.post(`/scada/infos/${scadaId}/access-policies`, body),

  updateAccessPolicy: (id: number, body: Partial<ScadaAccessPolicy>): Promise<void> =>
    http.put(`/scada/access-policies/${id}`, body),

  deleteAccessPolicy: (id: number): Promise<void> =>
    http.delete(`/scada/access-policies/${id}`),

  // resource upload
  uploadResource: (file: File, category = 'image'): Promise<{ url: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    return http.post(`/scada/resource/upload/${category}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
