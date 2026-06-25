// Agent / menu integration for Form App (WebView runtime + scan events)

export type FormAppMenuTargetType =
  | 'form_app_entry'
  | 'form_app_preview'
  | 'form_app_scan_entry'

export type ScanMatcherKind = 'prefix' | 'regex' | 'exact' | 'all'

export type ScanMatcher = {
  event_type: 'barcode' | 'qrcode' | 'nfc' | 'custom'
  kind: ScanMatcherKind
  value: string
}

/** JSON in AgentMenuItem.scan_config_json */
export type FormAppScanConfig = {
  mode?: 'router' | string
  scan_router_key?: string
  matchers?: ScanMatcher[]
  fallback?: {
    target?: string
    open_mode?: 'replace' | 'push' | string
  }
}

/** Agent menu bundle item (subset of AgentMenuItem + runtime preview fields) */
export type FormAppMenuBundleItem = {
  id: number
  title: string
  icon: string
  target_type: FormAppMenuTargetType | string
  target_ref: string
  show_on_agent_home: boolean
  intent_action: string
  default_extras_json: string
  scan_config_json: string
  open_mode: string
  min_agent_version: string
  required_caps_json: string
  /** Relative preview path (scada share / form preview) */
  preview_path: string
  content_version: number
  form_app_code: string
  form_app_page_key: string
}

export type FormAppMenuBundle = {
  bundle_revision?: number
  menus: FormAppMenuBundleItem[]
  linked_pages?: FormAppMenuBundleItem[]
  bundle_hash?: string
  signature?: string
}

/** window.eventManager bridge — Android calls eventManager.emit(type, data) */
export type FormAppBridgeEventType = 'barcode' | 'qrcode' | 'nfc' | 'custom'
