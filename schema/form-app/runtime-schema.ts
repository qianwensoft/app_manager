// FormAppInfo.runtime_schema JSON (V1 single-document model, FormDesignerPage)
// Serialized as a string in DB column runtime_schema.

import type { FieldBinding } from './field'

export type FormAppMode = 'form' | 'wizard' | 'survey'

export type RuntimeSchemaVersion = '1.0.0'

export type RuntimeDatasourceConfig = {
  source_id: number | null
  source_query_params?: Record<string, string>
}

export type RuntimePaginationConfig = {
  enabled?: boolean
  page_param?: string
  page_size_param?: string
  limit_param?: string
  offset_param?: string
  default_page_size?: number
}

export type RuntimeListQueryCondition = {
  field: string
  operator: string
  value?: string
}

export type RuntimeFormPageConfig = {
  submit_interface_code?: string
}

export type RuntimeListPageConfig = {
  interface_code?: string
  pagination?: RuntimePaginationConfig
  query_conditions?: RuntimeListQueryCondition[]
}

export type RuntimeDetailPageConfig = {
  interface_code?: string
}

export type RuntimePagesMap = {
  form?: RuntimeFormPageConfig
  list?: RuntimeListPageConfig
  detail?: RuntimeDetailPageConfig
  /** Custom extension pages keyed by page_key */
  [pageKey: string]: RuntimeFormPageConfig | RuntimeListPageConfig | RuntimeDetailPageConfig | undefined
}

export type SubmitBinding = {
  source_type?: 'data_interface' | 'app_interface'
  submit_interface_code?: string
  payload_path?: string
}

/**
 * Stored in FormAppInfo.runtime_schema (JSON string).
 * V2 multi-page apps also persist per-page config in FormAppPage.config_json;
 * bindings may remain here for cascade queries.
 */
export type FormAppRuntimeSchema = {
  schema_version: RuntimeSchemaVersion
  datasource?: RuntimeDatasourceConfig
  pages: RuntimePagesMap
  bindings?: FieldBinding[]
  submit_binding?: SubmitBinding
}
