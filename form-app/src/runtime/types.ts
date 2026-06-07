/**
 * Runtime field types — keep in sync with schema/form-app/field.ts (canonical).
 * schema/ is documentation-only; this file is the form-app build copy.
 */

export type FieldOption = { label: string; value: string | number | boolean }

export type VisibleWhenRule = {
  field: string
  operator: 'eq' | 'neq' | 'not_empty' | 'empty' | 'in' | 'gt' | 'lt'
  value?: string | number | boolean | Array<string | number>
}

export type FieldDef = {
  field: string
  label: string
  component: string
  required?: boolean
  options?: FieldOption[]
  placeholder?: string
  validation?: { max_length?: number; pattern?: string; min?: number; max?: number }
  visible_when?: VisibleWhenRule
  /** 列表查询条件：依赖字段变化后重新拉取本字段选项 */
  listen_targets?: string[]
  options_interface_code?: string
}

export type FieldBinding = {
  field: string
  context_key?: string
  listen_targets?: string[]
  query_source_type?: 'data_interface' | 'app_interface'
  query_interface_code?: string
}

export type QueryCondition = {
  field: string
  label: string
  component?: string
  listen_targets?: string[]
  options_interface_code?: string
}
