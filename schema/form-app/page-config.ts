// FormAppPage.config_json shapes (V2 multi-page model, PageEditorPage / generate-pages)

import type { FieldDef, QueryCondition } from './field'
import type { RuntimePaginationConfig } from './runtime-schema'

/** config_json for page_type = form */
export type FormPageConfig = {
  field_definitions: FieldDef[]
}

/** config_json for page_type = list */
export type ListPageConfig = {
  pagination?: RuntimePaginationConfig
  query_conditions?: QueryCondition[]
  /** Optional table column defs; defaults to field_definitions when omitted */
  field_definitions?: FieldDef[]
}

/** config_json for page_type = detail */
export type DetailPageConfig = {
  field_definitions?: FieldDef[]
}

export type FormAppPageConfig = FormPageConfig | ListPageConfig | DetailPageConfig
