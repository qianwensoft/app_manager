// Form App REST API schemas — /api/form-app/*
// Runtime field types: schema/form-app/field.ts
// Runtime JSON blobs: schema/form-app/runtime-schema.ts, page-config.ts, design-schema.ts

export type FormAppMode = 'form' | 'wizard' | 'survey'
export type FormAppPageType = 'form' | 'list' | 'detail' | 'custom'
export type FormAppLinkTriggerType = 'button_click' | 'row_click' | 'auto_redirect'
export type FormAppEventType = 'barcode' | 'qrcode' | 'nfc' | 'custom'
export type FormAppMatcherType = 'prefix' | 'regex' | 'exact' | 'all'

// ── Entities (mirror server/models/form_app.go) ─────────────────────────────

export interface FormAppInfo {
  id: number
  code: string
  name: string
  data_source_id: number | null
  mode: FormAppMode
  description: string
  entry_page_key: string
  /** JSON string — global app settings */
  global_config: string
  /** Deprecated V1: Formily design tree JSON string */
  design_schema?: string
  /** Deprecated V1: see schema/form-app/runtime-schema.ts */
  runtime_schema?: string
  /** Deprecated V1: see schema/form-app/design-schema.ts FormAppUISchema */
  ui_schema?: string
  /** 0 = draft, 1 = published */
  publish_status: number
  share_token?: string
  share_expire_at?: string | null
  content_version: number
  created_at: string
  updated_at: string
}

export interface FormAppPage {
  id: number
  form_app_id: number
  page_key: string
  page_type: FormAppPageType
  title: string
  /** Formily design_schema JSON string */
  design_schema: string
  dataset_id: number | null
  /** Bound DataInterface open key / slug */
  interface_code: string
  /** Serialized page config — see schema/form-app/page-config.ts */
  config_json: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface FormAppPageLink {
  id: number
  form_app_id: number
  from_page_key: string
  to_page_key: string
  trigger_type: FormAppLinkTriggerType
  trigger_config: string
  param_mapping: string
  created_at: string
  updated_at: string
}

export interface FormAppEventRoute {
  id: number
  form_app_id: number
  event_type: FormAppEventType
  matcher_type: FormAppMatcherType
  matcher_value: string
  target_page_key: string
  param_mapping: string
  priority: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface FormAppAccessPolicy {
  id: number
  form_app_id: number
  target_type: 'device' | 'user' | 'department' | 'position'
  target_ref: string
  can_view: boolean
  can_submit: boolean
  created_at: string
  updated_at: string
}

export interface FormAppDraft {
  id: number
  form_app_id: number
  user_id: number
  page_key: string
  data_json: string
  created_at: string
  updated_at: string
}

// ── Info CRUD ───────────────────────────────────────────────────────────────

export interface ListFormAppsResponse {
  data: FormAppInfo[]
}

export interface GetFormAppResponse {
  data: FormAppInfo
}

export interface CreateFormAppRequest {
  code: string
  name: string
  mode?: FormAppMode
  description?: string
  data_source_id?: number | null
  entry_page_key?: string
}

export interface UpdateFormAppRequest extends Partial<CreateFormAppRequest> {}

/** POST /api/form-app/infos/:id/save-schema */
export interface SaveFormAppSchemaRequest {
  design_schema: string
  runtime_schema: string
  ui_schema: string
}

// ── Pages / links / event routes ──────────────────────────────────────────────

export interface ListFormAppPagesResponse {
  data: FormAppPage[]
}

export interface CreateFormAppPageRequest {
  page_key: string
  page_type: FormAppPageType
  title: string
  design_schema?: string
  dataset_id?: number | null
  interface_code?: string
  config_json?: string
  sort_order?: number
}

export interface BatchDeleteFormAppPagesRequest {
  page_ids: number[]
}

export interface ReorderFormAppPagesRequest {
  orders: Array<{ page_id: number; sort_order: number }>
}

export interface ListFormAppPageLinksResponse {
  data: FormAppPageLink[]
}

export interface ListFormAppEventRoutesResponse {
  data: FormAppEventRoute[]
}

/** POST /api/form-app/infos/:id/test-event */
export interface TestFormAppEventRequest {
  event_type: FormAppEventType
  event_data: string
}

export interface TestFormAppEventResponse {
  matched: boolean
  target_page_key?: string
  /** JSON string — merged into navigation params */
  param_mapping?: string
  route_id?: number
  priority?: number
}

// ── Generate / deploy ─────────────────────────────────────────────────────────

/** POST /api/form-app/infos/:id/generate-pages-from-table */
export interface GenerateFormAppPagesRequest {
  mode?: 'select_schema' | 'create_schema'
  data_source_id: number
  table: string
  primary_key?: string
}

export interface GenerateFormAppPagesResponse {
  data: {
    pages: Array<{ page_key: string; page_id: number; interface_code: string }>
    links: Array<{ from: string; to: string; trigger: string }>
    interface_codes: { list: string; detail: string; submit: string }
  }
  warnings?: string[]
}

/** POST /api/form-app/infos/:id/regenerate (single page) */
export interface RegenerateSinglePageRequest {
  page_type: 'form' | 'list' | 'detail'
  data_source_id: number
  table: string
  primary_key?: string
}

/** POST /api/form-app/infos/:id/deploy-to-devices */
export interface DeployFormAppRequest {
  device_ids: number[]
  entry_page_key?: string
  menu_title?: string
  menu_icon?: string
  show_on_agent_home?: boolean
}

export interface DeployFormAppResponse {
  data: {
    menu_id: number
    device_count: number
  }
}

// ── Runtime bridge (/api/form-app/runtime/*) ──────────────────────────────────

export type RuntimeQueryOperator =
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'

export interface RuntimeQueryFilter {
  field: string
  operator: RuntimeQueryOperator | string
  value?: string | number | boolean | null
}

/** POST /api/form-app/runtime/query | /runtime/submit */
export interface FormRuntimeRequest {
  interface_code: string
  param_values?: Record<string, unknown>
  form_code?: string
  page_key?: string
  page_type?: FormAppPageType
  query_filters?: RuntimeQueryFilter[]
}

export interface FormRuntimeQueryResponse {
  ok: boolean
  data?: unknown[] | Record<string, unknown> | null
  rows?: unknown[]
  total?: number
}

export interface FormRuntimeSubmitResponse {
  ok: boolean
  record_id?: number
  last_insert_id?: number
}

/** GET /api/form-app/runtime/draft?form_code=&page_key= */
export interface FormRuntimeGetDraftResponse {
  data: Record<string, unknown> | null
}

/** PUT /api/form-app/runtime/draft */
export interface FormRuntimePutDraftRequest {
  form_code: string
  page_key: string
  data: Record<string, unknown>
}

export interface FormRuntimeDraftAckResponse {
  ok: boolean
}

// ── Agent runtime (/api/form-app/agent-runtime/*) ─────────────────────────────
// Auth: JWT Bearer OR X-Device-Token (Agent WebView). Used by form-app MultiPageRuntime.

/** GET /api/form-app/agent-runtime/:code/bootstrap */
export interface FormRuntimeBootstrapResponse {
  data: {
    app: FormAppInfo
    pages: FormAppPage[]
  }
}

/** POST /api/form-app/agent-runtime/match-event */
export interface FormRuntimeMatchEventRequest {
  form_code: string
  event_type: FormAppEventType
  event_data: string
}

export interface FormRuntimeMatchEventResponse {
  matched: boolean
  target_page_key?: string
  param_mapping?: string
  route_id?: number
  priority?: number
}

// ── Share (unauthenticated) ─────────────────────────────────────────────────

/** GET /api/form-app/info/share/:token */
export interface GetFormAppByShareTokenResponse {
  data: FormAppInfo
}
