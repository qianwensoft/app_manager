// Form App runtime field model — used in page config_json and FormRenderer/ListRenderer.
// Canonical mirror: form-app/src/runtime/types.ts (keep in sync manually).

export type FieldOption = {
  label: string
  value: string | number | boolean
}

/** Conditional visibility rule (Phase C4) */
export type VisibleWhenOperator = 'eq' | 'neq' | 'not_empty' | 'empty' | 'in' | 'gt' | 'lt'

export type VisibleWhenRule = {
  field: string
  operator?: VisibleWhenOperator
  value?: string | number | boolean | Array<string | number>
}

export type FieldValidation = {
  max_length?: number
  pattern?: string
  min?: number
  max?: number
}

/** Supported runtime components (subset of Formily x-component names) */
export type FormFieldComponent =
  | 'Input'
  | 'Input.TextArea'
  | 'NumberPicker'
  | 'Select'
  | 'Switch'
  | 'DatePicker'
  | 'TimePicker'
  | 'Checkbox'
  | 'Radio'
  | string

export type FieldDef = {
  field: string
  label: string
  component: FormFieldComponent
  required?: boolean
  options?: FieldOption[]
  placeholder?: string
  validation?: FieldValidation
  /** Show field only when rule matches current form values */
  visible_when?: VisibleWhenRule
  /** Comma-separated source fields in editor; stored as string[] in JSON */
  listen_targets?: string[]
  /** DataInterface code for dynamic Select options */
  options_interface_code?: string
}

/** Cascade binding stored in FormAppInfo.runtime_schema.bindings */
export type FieldBinding = {
  field: string
  context_key?: string
  listen_targets?: string[]
  query_source_type?: 'data_interface' | 'app_interface'
  query_interface_code?: string
}

/** List page query bar condition */
export type QueryCondition = {
  field: string
  label: string
  operator?: string
  value?: string
  component?: FormFieldComponent
  listen_targets?: string[]
  options_interface_code?: string
}
