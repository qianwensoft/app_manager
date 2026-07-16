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
  /** 依赖字段变化后重新拉取本字段选项 */
  listen_targets?: string[]
  options_interface_code?: string
  /** component === 'PrintButton' 时：绑定的打印模板 id / 触发的按钮事件 id / 文案 */
  print_template_id?: string
  button_id?: string
  button_text?: string
  button_type?: 'primary' | 'default' | 'dashed'
  button_block?: boolean
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
