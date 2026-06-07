# schema/

Canonical TypeScript type definitions for the app-manager platform. This is a **documentation and reference artifact** — no runtime dependency, no package.json, no build step.

Go server, Vue 3 web, React SCADA editor, and React form-app share the same wire format. These types are the single source of truth for field names, shapes, and protocol details.

## Schema ↔ Go models 对账

REST 实体的 JSON 字段与 `server/models` 通过 `make schema-check` 自动核对。详见 [`reconcile/README.md`](reconcile/README.md)。

## Structure

```
schema/
├── reconcile/            Models 对账说明与流程
├── api/                  REST API request/response shapes
│   ├── agent-menu.ts     AgentMenuItem, menu manifest
│   ├── auth.ts           Login, register, JWT, API keys, scopes
│   ├── device.ts         Device CRUD, ADB ops, media, audit log
│   ├── app.ts            APK upload, install/uninstall, tasks
│   ├── scada.ts          SCADA group/info CRUD, canvas save/publish
│   ├── data-stack.ts     DataSource, Dataset, DataStructure, DataInterface
│   ├── form-app.ts       FormAppInfo, pages, runtime bridge, draft API
│   └── outbound.ts       OutboundApp, Endpoint, Connector, Delivery, Webhook
├── form-app/             Form App domain JSON (design + runtime + agent)
│   ├── field.ts          FieldDef, bindings, visible_when, query conditions
│   ├── runtime-schema.ts FormAppInfo.runtime_schema (V1 document model)
│   ├── page-config.ts    FormAppPage.config_json (V2 per-page model)
│   ├── design-schema.ts  Formily design_schema / ui_schema wrappers
│   └── agent.ts          Scan config, menu bundle, WebView bridge events
├── ws/                   WebSocket protocol messages
│   ├── agent-command.ts  Server↔Agent JSON command protocol (/ws/agent/:token)
│   ├── screen-stream.ts  Screen/shell/logcat/camera WS (/ws/screen, /ws/shell, /ws/logcat, /ws/camera)
│   └── stomp-events.ts   STOMP push topics and payload shapes (/ws/stomp)
└── scada/                SCADA editor domain model (stored in ScadaInfo.canvas_data)
    ├── canvas.ts         CanvasProject, CanvasData, CanvasGroupNode
    ├── element.ts        CanvasElement, ElementType, EditorState
    └── binding.ts        PointBinding, ElementAnimation, ElementEvent
```

## API conventions

All REST responses wrap the payload:

```
{ "data": <T> }                    // single item or array
{ "data": <T[]>, "total": n, ... } // paginated list
{ "error": "message" }             // error
{ "message": "ok" }                // simple ack
```

Authentication:
- **JWT** — `Authorization: Bearer <token>` or `?token=<token>` (WebSocket)
- **API Key** — `X-API-Key: <key>` for `/api/open/v1/*` routes, scoped via `open:*` strings
- **Share token** — `?share=<token>` for screen WebSocket share links

## WebSocket endpoints

| Path | Protocol | Description |
|---|---|---|
| `/ws/agent/:deviceToken` | JSON | Agent persistent connection |
| `/ws/screen/:deviceId` | Binary + JSON | MJPEG screen stream + control |
| `/ws/shell/:deviceId` | Binary | PTY shell (xterm.js) |
| `/ws/logcat/:deviceId` | Text lines | Logcat stream |
| `/ws/camera/:deviceId?camera=back\|front` | JSON (WebRTC signaling) | Camera stream |
| `/ws/stomp` | STOMP 1.2 | Server push notifications |

## SCADA canvas storage

`ScadaInfo.canvas_data` is a JSON-serialized `CanvasProject` (see `scada/canvas.ts`). The editor reads/writes this field via:

- `GET /api/scada/infos/:id/canvas` — returns `{ data: "<json string>" }`
- `PUT /api/scada/infos/:id/canvas` — body `{ canvas_data: "<json string>", preview_image?: "..." }`

## Data stack open interfaces

Open data interfaces are served at `/api/open/v1/data/:slug` (method configured per interface). Auth via `X-API-Key` with scope `open:dataiface:query` or `open:dataiface:write`.

Buffer dataset inbound webhook: `POST /api/open/v1/ingress/buffer/:dataset_code` with `X-Webhook-Secret` header.

## Form App storage model

Two coexisting shapes:

| Layer | DB field | TypeScript |
|---|---|---|
| V1 app-level | `FormAppInfo.runtime_schema` | `schema/form-app/runtime-schema.ts` → `FormAppRuntimeSchema` |
| V2 per-page | `FormAppPage.config_json` | `schema/form-app/page-config.ts` → `FormPageConfig` / `ListPageConfig` |
| Design UI | `FormAppPage.design_schema` | `schema/form-app/design-schema.ts` → `FormilyDesignSchemaWrapper` |

Runtime entry: static SPA `/form-app/runtime/:code` (multi-page container). Agent menus use `target_type=form_app_entry` with `form_app_code` + optional `form_app_page_key`.

Draft persistence: `GET|PUT|DELETE /api/form-app/runtime/draft` keyed by `(form_code, page_key, user_id)`.

## Outbound connector step types

| step_type | config fields |
|---|---|
| `http` | `endpoint_id`, optional `context_merge`, `template_params` |
| `broadcast_intent` | `action`, optional `extras` (string map) |
| `view_url` | `url` |
| `message` | `body` (or `text` / `message`) |
| `app_script` | `app_id`, optional `hook` (`before_request` \| `after_response`) |
| `data_interface` | `data_interface: { interface_id, param_values? }` |
