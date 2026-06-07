// Data Stack schemas: DataSource, Dataset, DataStructure, DataInterface

export interface DataSource {
  id: number
  /** Unique business code */
  code: string
  name: string
  /** "sqlite" | "mysql" | "postgres" | "sqlserver" */
  type: string
  dsn: string
  /** JSON object with optional pool_max_open, pool_max_idle, pool_conn_max_lifetime_sec, dsn_fields */
  config_json: string
  read_only: boolean
  created_at: string
  updated_at: string
}

export interface CreateDataSourceRequest {
  code: string
  name: string
  type: string
  dsn: string
  config_json?: string
  read_only?: boolean
}

export interface ListDataSourcesResponse {
  data: DataSource[]
}

// Dataset

/** "static" = fixed JSON rows; "query" = SQL on a data source;
 *  "buffer" = inbound cache table (http_webhook or http_poll);
 *  "transaction" = ordered SQL steps */
export type DatasetKind = 'static' | 'query' | 'buffer' | 'transaction'

export interface Dataset {
  id: number
  code: string
  data_source_id: number | null
  data_source?: DataSource
  category: string
  name: string
  kind: DatasetKind
  /** static: JSON row array; query/buffer: SQL string */
  definition: string
  /** transaction: JSON array of SQL step objects */
  steps_json: string
  /** JSON Schema describing query parameters */
  param_schema: string
  /** Extended config: ingress kind, buffer_table, sql_shape, table_binding, etc. */
  meta_json: string
  structures?: DataStructure[]
  created_at: string
  updated_at: string
}

export interface CreateDatasetRequest {
  code: string
  name: string
  kind: DatasetKind
  data_source_id?: number | null
  category?: string
  definition?: string
  steps_json?: string
  param_schema?: string
  meta_json?: string
}

export interface ListDatasetsResponse {
  data: Dataset[]
}

// DataStructure

export interface DataStructure {
  id: number
  dataset_id: number
  dataset?: Dataset
  /** Unique within a dataset */
  code: string
  name: string
  /** JSON Schema for the column contract */
  schema_json: string
  /** Default parameter values merged before interface param_defaults_json */
  default_param_values: string
  created_at: string
  updated_at: string
}

export interface CreateDataStructureRequest {
  code: string
  name: string
  schema_json?: string
  default_param_values?: string
}

export interface ListDataStructuresResponse {
  data: DataStructure[]
}

// DataInterfaceGroup

export interface DataInterfaceGroup {
  id: number
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

// DataInterface

export type DataInterfaceKind = 'query' | 'queryOne' | 'transaction'

export interface DataInterface {
  id: number
  group_id: number | null
  category: string
  name: string
  /** Unique; used as open API path key */
  code: string
  slug: string
  kind: DataInterfaceKind
  dataset_id: number
  dataset?: Dataset
  data_structure_id: number | null
  data_structure?: DataStructure
  /** Interface-level default parameter overrides (JSON object) */
  param_defaults_json: string
  /** "GET" | "POST" | "PUT" | "DELETE" */
  method: string
  enabled: boolean
  /** JSON array of required scopes, e.g. ["open:dataiface:query"] */
  required_scopes: string
  /** For kind=static: "list" | "create" | "update" | "delete" | "" */
  static_crud_op: string
  /** transaction: JSON array of SQL step objects */
  steps_json: string
  /** JSON Schema for documentation and mock data generation */
  schema_json: string
  created_at: string
  updated_at: string
}

export interface CreateDataInterfaceRequest {
  name: string
  code: string
  slug?: string
  kind?: DataInterfaceKind
  dataset_id: number
  data_structure_id?: number | null
  group_id?: number | null
  category?: string
  method?: string
  param_defaults_json?: string
  required_scopes?: string[]
  static_crud_op?: string
  enabled?: boolean
}

export interface ListDataInterfacesResponse {
  data: DataInterface[]
}

/** POST /api/open/v1/ingress/buffer/:dataset_code
 *  Inbound webhook for buffer datasets; auth via X-Webhook-Secret header */
export interface BufferIngressRequest {
  [key: string]: unknown
}

/** POST /api/open/v1/data/:slug — open data interface query */
export interface DataInterfaceQueryRequest {
  param_values?: Record<string, unknown>
}

export interface DataInterfaceQueryResponse {
  data: unknown[]
  total?: number
}
