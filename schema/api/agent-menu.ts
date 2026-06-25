// Agent menu REST + manifest shapes (mirror server/models/agent_menu.go)

export type AgentMenuTargetType =
  | 'scada_preview'
  | 'webview_url'
  | 'form_app'
  | 'form_app_preview'
  | 'form_app_scan_entry'
  | 'form_app_entry'

export interface AgentMenuItem {
  id: number
  title: string
  icon: string
  target_type: AgentMenuTargetType | string
  target_ref: string
  form_app_code: string
  form_app_page_key: string
  show_on_agent_home: boolean
  intent_action: string
  default_extras_json: string
  scan_config_json: string
  open_mode: string
  min_agent_version: string
  required_caps_json: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AgentMenuAssignment {
  id: number
  menu_id: number
  device_id: number
  created_at: string
}

/** GET /api/agent/menu-manifest */
export interface AgentMenuManifestResponse {
  bundle_revision: number
  menus: import('../form-app/agent').FormAppMenuBundleItem[]
  linked_pages: Array<{ target_type: string; target_ref: string; preview_path: string }>
  bundle_hash?: string
  signature?: string
  unchanged?: boolean
}
