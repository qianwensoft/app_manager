# schema/

Canonical TypeScript type definitions for the app-manager platform. This is a **documentation and reference artifact** — no runtime dependency, no package.json, no build step.

All three components (Go server, Vue 3 web, React SCADA editor) share the same wire format. These types are the single source of truth for field names, shapes, and protocol details.

## Structure

```
schema/
├── api/                  REST API request/response shapes
│   ├── auth.ts           Login, register, JWT, API keys, scopes
│   ├── device.ts         Device CRUD, ADB ops, media, audit log
│   ├── app.ts            APK upload, install/uninstall, tasks
│   ├── scada.ts          SCADA group/info CRUD, canvas save/publish
│   ├── data-stack.ts     DataSource, Dataset, DataStructure, DataInterface
│   └── outbound.ts       OutboundApp, Endpoint, Connector, Delivery, Webhook
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

## Outbound connector step types

| step_type | config fields |
|---|---|
| `http` | `endpoint_id`, optional `context_merge`, `template_params` |
| `broadcast_intent` | `action`, optional `extras` (string map) |
| `view_url` | `url` |
| `message` | `body` (or `text` / `message`) |
| `app_script` | `app_id`, optional `hook` (`before_request` \| `after_response`) |
| `data_interface` | `data_interface: { interface_id, param_values? }` |
