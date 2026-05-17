export default function SchemaPage() {
  const formAppSchemaExample = `{
  "schema_version": "1.0.0",
  "code": "inspection_form",
  "mode": "form",
  "design_schema": { "type": "object", "properties": {} },
  "runtime_schema": { "type": "object", "properties": {} },
  "ui_schema": { "layout": "vertical" }
}`

  const bindingsExample = `{
  "bindings": [
    {
      "field": "dept",
      "query_interface_code": "dept_options",
      "param_mapping": { "tenant_id": "$context.tenant_id" },
      "result_mapping": { "label": "name", "value": "code" }
    },
    {
      "field": "$submit",
      "submit_interface_code": "submit_inspection",
      "param_mapping": { "payload": "$form" },
      "result_mapping": { "message": "msg", "id": "record_id" }
    }
  ]
}`

  const scanConfigExample = `{
  "mode": "router",
  "scan_router_key": "inspection_scan_router",
  "matchers": [
    { "event_type": "barcode", "kind": "prefix", "value": "EQP-" },
    { "event_type": "barcode", "kind": "regex", "value": "^LOT\\\\d{6}$" }
  ],
  "fallback": { "target": "/form-app/preview/default", "open_mode": "replace" }
}`

  const menuBundleExample = `{
  "bundle_revision": 15,
  "menus": [
    {
      "id": 1001,
      "title": "巡检表单",
      "target_type": "form_app_scan_entry",
      "target_ref": "inspection_form",
      "intent_action": "com.appmanager.agent.ACTION_SCAN_INSPECTION",
      "scan_config_json": "{...}",
      "min_agent_version": "1.3.0",
      "required_caps_json": "[\\"scan_router_v1\\"]",
      "preview_path": "/form-app/preview/12"
    }
  ],
  "linked_pages": [
    {
      "target_type": "form_app_preview",
      "target_ref": "inspection_form",
      "preview_path": "/form-app/preview/12"
    }
  ],
  "bundle_hash": "sha256hex",
  "signature": "hmac_sha256_hex"
}`

  return (
    <div className="page">
      <header className="header">
        <h1>Schema</h1>
        <p>Phase 2-3 结构说明（schema_version / bindings / scan_config / menu_bundle）</p>
      </header>

      <div className="panel">
        <h3>1) form_app 核心 schema</h3>
        <pre className="result-box">{formAppSchemaExample}</pre>
      </div>

      <div className="panel">
        <h3>2) bindings（DataInterface 绑定）</h3>
        <pre className="result-box">{bindingsExample}</pre>
      </div>

      <div className="panel">
        <h3>3) scan_config（菜单侧扫码策略）</h3>
        <pre className="result-box">{scanConfigExample}</pre>
      </div>

      <div className="panel">
        <h3>4) menu_bundle（统一下发结构）</h3>
        <pre className="result-box">{menuBundleExample}</pre>
      </div>
    </div>
  )
}
