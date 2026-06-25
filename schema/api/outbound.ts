// Outbound pipeline schemas: Apps, Endpoints, Connectors, Deliveries, Webhooks

// --- OutboundApp ---

/** "none" | "static_header" | "dynamic_bearer" */
export type OutboundAuthType = 'none' | 'static_header' | 'dynamic_bearer'

export interface OutboundAppParam {
  key: string
  value: string
  sensitive: boolean
  description?: string
}

export interface OutboundApp {
  id: number
  name: string
  description: string
  base_url: string
  auth_type: OutboundAuthType
  /** Parsed auth config object (sensitive fields redacted in responses) */
  auth_config: Record<string, unknown>
  /** Common headers merged into every endpoint request (string→string) */
  common_headers: Record<string, string>
  /** Token provider config for dynamic_bearer */
  token_provider: Record<string, unknown>
  /** Current token cache status */
  token_status: Record<string, unknown>
  /** Extension scripts: before_request / after_response arrays */
  extension_scripts: Record<string, unknown>
  app_params: OutboundAppParam[]
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateOutboundAppRequest {
  name: string
  base_url: string
  description?: string
  auth_type?: OutboundAuthType
  auth_config?: Record<string, unknown>
  common_headers?: Record<string, string>
  token_provider?: Record<string, unknown>
  extension_scripts?: Record<string, unknown>
  app_params?: OutboundAppParam[]
  enabled?: boolean
}

export interface ListOutboundAppsResponse {
  data: OutboundApp[]
}

// --- OutboundEndpoint ---

export interface OutboundEndpoint {
  id: number
  app_id: number
  app_name: string
  name: string
  /** "GET" | "POST" | "PUT" | "DELETE" | "PATCH" */
  method: string
  /** Path relative to app base_url; supports {{placeholder}} template vars */
  path: string
  headers: Record<string, string>
  /** Request body template; supports {{placeholder}} vars */
  body_template: string
  timeout_ms: number
  retry_max: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateOutboundEndpointRequest {
  app_id: number
  name: string
  method?: string
  path: string
  headers?: Record<string, string>
  body_template?: string
  param_schema?: string
  timeout_ms?: number
  retry_max?: number
  enabled?: boolean
}

export interface EndpointParamItem {
  name: string
  /** "template" = extracted from {{...}} in path/body; "schema" = declared in param_schema */
  source: 'template' | 'schema'
  type: string
  description: string
  required: boolean
}

export interface GetEndpointParamSchemaResponse {
  params: EndpointParamItem[]
}

export interface ListOutboundEndpointsResponse {
  data: OutboundEndpoint[]
}

// --- OutboundConnector ---

/** "parallel" | "sequential" | "failover" */
export type RunMode = 'parallel' | 'sequential' | 'failover'

/** "http" | "broadcast_intent" | "view_url" | "message" | "app_script" | "data_interface" */
export type StepType = 'http' | 'broadcast_intent' | 'view_url' | 'message' | 'app_script' | 'data_interface'

export interface ConnectorStep {
  id: number
  step_type: StepType
  /** Only set for step_type="http" */
  endpoint_id: number
  delay_before_ms: number
  delay_after_ms: number
  /** Step-type-specific config:
   *  - http: { context_merge?, template_params? }
   *  - broadcast_intent: { action, extras? }
   *  - view_url: { url }
   *  - message: { body }
   *  - app_script: { app_id, hook? }
   *  - data_interface: { data_interface: { interface_id, param_values? } }
   */
  config: Record<string, unknown>
}

export interface ConnectorPhase {
  id: number
  run_mode: RunMode
  sort_order: number
  steps: ConnectorStep[]
  /** Phase-level default template placeholder values */
  default_params: Record<string, string>
}

export interface OutboundConnector {
  id: number
  name: string
  description: string
  connector_code: string
  delivery_mode: RunMode
  default_timeout_ms: number
  default_retry_max: number
  /** Ignore duplicate triggers for same event+device within this window (ms); 0 = off */
  debounce_same_event_ms: number
  /** Ignore trigger if last execution was within this window for a different event (ms); 0 = off */
  debounce_diff_event_ms: number
  priority: number
  enabled: boolean
  /** Bound custom event definition IDs */
  definition_ids: number[]
  /** Bound device IDs; empty = all devices */
  device_ids: number[]
  phases: ConnectorPhase[]
  /** Flat list of endpoint IDs referenced across all phases (for display) */
  endpoint_ids: number[]
  created_at: string
  updated_at: string
}

export interface CreateConnectorStepRequest {
  step_type: StepType
  endpoint_id?: number
  delay_before_ms?: number
  delay_after_ms?: number
  config?: Record<string, unknown>
}

export interface CreateConnectorPhaseRequest {
  run_mode?: RunMode
  steps: CreateConnectorStepRequest[]
  default_params?: Record<string, string>
}

export interface CreateOutboundConnectorRequest {
  name: string
  description?: string
  connector_code?: string
  delivery_mode?: RunMode
  default_timeout_ms?: number
  default_retry_max?: number
  debounce_same_event_ms?: number
  debounce_diff_event_ms?: number
  priority?: number
  enabled?: boolean
  definition_ids: number[]
  device_ids?: number[]
  phases: CreateConnectorPhaseRequest[]
  /** Legacy flat endpoint list; auto-converted to a single phase */
  endpoint_ids?: number[]
}

export interface ListOutboundConnectorsResponse {
  data: OutboundConnector[]
}

// --- OutboundDelivery ---

export interface OutboundDelivery {
  id: number
  device_event_id: number
  connector_id: number
  phase_id: number
  step_id: number
  step_type: StepType
  endpoint_id: number
  detail_json: string
  /** "success" | "failed" */
  status: string
  http_status: number
  error: string
  attempts: number
  duration_ms: number
  request_url: string
  created_at: string
}

export interface ListOutboundDeliveriesRequest {
  connector_id?: number
  device_id?: number
  device_event_id?: number
  status?: 'success' | 'failed'
  page?: number
  page_size?: number
}

export interface ListOutboundDeliveriesResponse {
  data: OutboundDelivery[]
  total: number
  page: number
  page_size: number
}

// --- OutboundWebhook (inbound receiver on an app) ---

/** "none" | "hmac_sha256" | "token_header" | "token_query" */
export type WebhookAuthMethod = 'none' | 'hmac_sha256' | 'token_header' | 'token_query'

/** "none" | "aes_cbc_pkcs7" | "aes_ecb_pkcs7" */
export type WebhookDecryptMethod = 'none' | 'aes_cbc_pkcs7' | 'aes_ecb_pkcs7'

export interface OutboundWebhook {
  id: number
  app_id: number
  name: string
  description: string
  auth_method: WebhookAuthMethod
  decrypt_method: WebhookDecryptMethod
  enabled: boolean
  created_at: string
  updated_at: string
}

// --- DeviceOutboundConnectorState ---

export interface DeviceOutboundConnectorState {
  device_id: number
  connector_id: number
  paused: boolean
  excluded: boolean
  updated_at: string
}

// --- Custom Event Definition (used by connectors) ---

export interface CustomEventGroup {
  id: number
  name: string
  description: string
  sort_order: number
  mqtt_enabled: boolean
  mqtt_topic: string
  created_at: string
  updated_at: string
}

export interface CustomEventDefinition {
  id: number
  group_id: number
  group?: CustomEventGroup
  key: string
  name: string
  description: string
  enabled: boolean
  mqtt_enabled: boolean
  mqtt_topic: string
  broadcast_actions: string[]
  extra_keys: string[]
  created_at: string
  updated_at: string
}
