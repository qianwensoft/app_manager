// Formily Designable design_schema stored in FormAppPage.design_schema or FormAppInfo.design_schema.
// Follows @formily/json-schema ISchema; this file documents the project-specific wrapper only.

/** Top-level object persisted by FormDesignerPage / server page generator */
export type FormilyDesignSchemaWrapper = {
  form?: {
    labelCol?: number
    wrapperCol?: number
    [key: string]: unknown
  }
  /** Formily JSON Schema tree with x-component / x-decorator props */
  schema: FormilySchemaNode
}

export type FormilySchemaNode = {
  type?: string
  title?: string
  properties?: Record<string, FormilySchemaNode>
  'x-component'?: string
  'x-component-props'?: Record<string, unknown>
  'x-decorator'?: string
  'x-decorator-props'?: Record<string, unknown>
  [key: string]: unknown
}

/** Stored in FormAppInfo.ui_schema */
export type FormAppUISchema = {
  mode?: 'generated-multi-pages' | string
  layout?: string
  [key: string]: unknown
}
