export default function SchemaPage() {
  const runtimeSchemaExample = `{
  "schema_version": "1.0.0",
  "datasource": {
    "source_id": 1,
    "source_query_params": { "tenant_id": "$context.tenant_id" }
  },
  "pages": {
    "form": { "submit_interface_code": "demo_form_submit" },
    "list": {
      "interface_code": "demo_form_list",
      "pagination": {
        "page_param": "page",
        "page_size_param": "page_size",
        "default_page_size": 10
      },
      "query_conditions": [
        { "field": "name", "operator": "contains", "value": "" }
      ]
    },
    "detail": { "interface_code": "demo_form_detail" }
  },
  "bindings": [
    {
      "field": "employee_id",
      "context_key": "dept_id",
      "listen_targets": ["dept_id"],
      "query_source_type": "data_interface",
      "query_interface_code": "employee_options"
    }
  ],
  "submit_binding": {
    "source_type": "data_interface",
    "submit_interface_code": "demo_form_submit",
    "payload_path": "$form"
  }
}`

  const pageConfigExample = `{
  "field_definitions": [
    {
      "field": "need_remark",
      "label": "需要备注",
      "component": "Switch"
    },
    {
      "field": "remark",
      "label": "备注",
      "component": "Input.TextArea",
      "visible_when": { "field": "need_remark", "operator": "eq", "value": true }
    }
  ]
}`

  const runtimeApiExample = `POST /api/form-app/runtime/query
{
  "interface_code": "demo_form_list",
  "form_code": "inspection_form",
  "page_type": "list",
  "param_values": { "page": 1, "page_size": 10 },
  "query_filters": [{ "field": "name", "operator": "contains", "value": "张" }]
}

PUT /api/form-app/runtime/draft
{
  "form_code": "inspection_form",
  "page_key": "form",
  "data": { "name": "草稿值", "dept_id": "D01" }
}`

  const scanConfigExample = `{
  "mode": "router",
  "scan_router_key": "inspection_scan_router",
  "matchers": [
    { "event_type": "barcode", "kind": "prefix", "value": "EQP-" }
  ],
  "fallback": { "target": "/form-app/runtime/inspection_form", "open_mode": "replace" }
}`

  return (
    <div className="page">
      <header className="header">
        <h1>Schema</h1>
        <p>
          权威类型定义见仓库 <code>schema/</code> 目录（三端契约，无 npm 依赖）。
        </p>
      </header>

      <div className="panel">
        <h3>文件索引</h3>
        <ul>
          <li><code>schema/api/form-app.ts</code> — REST 实体与请求/响应</li>
          <li><code>schema/form-app/runtime-schema.ts</code> — V1 <code>runtime_schema</code></li>
          <li><code>schema/form-app/page-config.ts</code> — V2 <code>config_json</code></li>
          <li><code>schema/form-app/field.ts</code> — 字段、绑定、条件渲染</li>
          <li><code>schema/form-app/design-schema.ts</code> — Formily design_schema</li>
          <li><code>schema/form-app/agent.ts</code> — 扫码 / 菜单下发</li>
        </ul>
      </div>

      <div className="panel">
        <h3>1) runtime_schema（V1，FormAppInfo 列）</h3>
        <pre className="result-box">{runtimeSchemaExample}</pre>
      </div>

      <div className="panel">
        <h3>2) page config_json（V2，FormAppPage 列）</h3>
        <pre className="result-box">{pageConfigExample}</pre>
      </div>

      <div className="panel">
        <h3>3) 运行时 API</h3>
        <pre className="result-box">{runtimeApiExample}</pre>
      </div>

      <div className="panel">
        <h3>4) scan_config（Agent 菜单）</h3>
        <pre className="result-box">{scanConfigExample}</pre>
      </div>
    </div>
  )
}
