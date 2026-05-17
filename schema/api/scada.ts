// SCADA REST API schemas
// Canvas content (canvas_data field) is defined in schema/scada/

export interface ScadaGroup {
  id: number
  parent_id: number | null
  name: string
  description: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ScadaInfo {
  id: number
  group_id: number | null
  scada_name: string
  /** Unique business code, used as route key */
  scada_code: string
  description: string
  /** JSON-serialized CanvasProject (see schema/scada/canvas.ts) */
  canvas_data?: string
  preview_image?: string
  /** 0 = draft, 1 = published */
  publish_status: number
  share_token?: string
  share_expire_time?: string | null
  /** Monotonically increasing on publish or canvas change; used by agent cache */
  content_version: number
  created_at: string
  updated_at: string
}

export interface ListScadaGroupsResponse {
  data: ScadaGroup[]
}

export interface CreateScadaGroupRequest {
  name: string
  parent_id?: number | null
  description?: string
  sort_order?: number
}

export interface ListScadaInfosResponse {
  data: ScadaInfo[]
}

export interface GetScadaInfoResponse {
  data: ScadaInfo
}

export interface CreateScadaInfoRequest {
  scada_name: string
  scada_code: string
  group_id?: number | null
  description?: string
}

export interface UpdateScadaInfoRequest {
  scada_name?: string
  description?: string
  group_id?: number | null
}

/** GET /api/scada/infos/:id/canvas — returns the full CanvasProject JSON */
export interface GetScadaCanvasResponse {
  data: string // serialized CanvasProject
}

/** PUT /api/scada/infos/:id/canvas */
export interface PutScadaCanvasRequest {
  canvas_data: string // serialized CanvasProject
  preview_image?: string
}

export interface PublishScadaResponse {
  data: ScadaInfo
}

export interface ScadaShareTokenResponse {
  share_token: string
  share_url: string
}
