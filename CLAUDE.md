# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Android remote device management platform with three components:
- **`server/`** — Go backend (Gin + GORM + SQLite/MySQL)
- **`web/`** — Vue 3 frontend (Vite + Element Plus + Pinia)
- **`agent/`** — Android Kotlin agent app (OkHttp WebSocket + MediaProjection)

## Build Commands

### Server (Go 1.21+)
```bash
make server              # build web first, then go build → bin/app-manager
make server-only         # go build without rebuilding web
make test                # go test ./...
make fmt                 # go fmt ./...
make check               # fmt + test + go vet
# Run directly:
cd server && go run . ../server/config.sqlite.yaml
```

Cross-compile targets: `make server-linux-amd64`, `make server-linux-arm64`, `make server-darwin-amd64`, `make server-darwin-arm64`

### Web (Vue 3 / Vite)
```bash
cd web && npm install
npm run dev              # dev server, proxies /api and /ws to http://127.0.0.1:8080
npm run build            # production build → web/dist/
```

Proxy target can be overridden with `VITE_PROXY_TARGET` env var.

### Web — SCADA (组态)

Standalone React app in `scada-editor/` (Vite + React + Zustand + TanStack Query). Served at `/scada-editor/` by the Go server; opened from the Vue shell via `openScadaEditor()` in `Layout.vue`.

```bash
cd scada-editor && npm install
npm run dev      # dev server (proxies /api to http://127.0.0.1:8080)
npm run build    # production build → scada-editor/dist/
```

- **Pages**: `ScadaListPage` (`/scada`), `EditorPage` (`/editor/:id`), `PreviewPage` (`/preview/:id`), `SchemaPage` (`/schema`).
- **Store**: `src/store/editorStore.ts` (Zustand) — multi-canvas project, undo/redo history, element CRUD, z-order, lock/visibility.
- **Canvas**: `CanvasBoard.tsx` — HTML5 Canvas 2D rendering, drag/resize/marquee select, right-click context menu (z-order + delete), locked element guard.
- **Widgets**: `WidgetPanel.tsx` (drag-to-canvas), `ChartWidget.tsx` (ECharts), `ImageWidget.tsx` (image-bg/widget/decoration/border-box).
- **Sim engine**: `server/scada/sim.go` — `StartSimEngine()` started after `database.Ready`; pushes point data via STOMP `/topic/scada/point-data/:code`.
- **REST**: `/api/scada/*` (Gin routes in `server/api/scada.go`).

### Agent (Android)
```bash
make agent               # assembleDebug → agent/app/build/outputs/apk/debug/
make agent-release       # assembleRelease
make install-agent       # installDebug via ADB
```

### Form App (React)
```bash
cd form-app && npm install
npm run dev              # dev server at :5175, proxies /api to http://127.0.0.1:8080
npm run build            # production build → form-app/dist/
```

## Development Environment

Entry point: **http://localhost:3001** (web/Vue 3)

| Port | Service | Role |
|------|---------|------|
| `:3001` | web (Vite) | Browser entry |
| `:5175` | form-app (Vite) | Form designer dev server |
| `:8080` | server (Go) | Backend API |

### Release Packaging
```bash
make release             # web + server + agent → dist/release/app-manager-<VERSION>/
make release-zip         # + zip archive
make release-tar         # + tar.gz archive
make clean
```

## Configuration

Server reads a YAML config file passed as the first CLI argument. SQLite quickstart: `server/config.sqlite.yaml`. Key fields:

```yaml
server:
  port: 8080
  host: 0.0.0.0
database:
  type: sqlite          # or mysql
  dsn: ./data/app-manager.db
storage:
  path: ./uploads
adb:
  path: adb
ffmpeg:
  path: ""              # optional, for server-side recording
jwt:
  secret: change-me-in-production
```

Env overrides: `JWT_SECRET`, `ADB_PATH`, `FFMPEG_PATH`.

Default admin: `admin / admin123` (auto-created on first run).

## Architecture

### Component Interaction

```
Browser (Vue 3)
  │  REST /api/*
  │  WS /ws/stomp          — STOMP push notifications
  │  WS /ws/screen/:id     — MJPEG frame stream
  │  WS /ws/shell/:id      — PTY shell (xterm.js)
  │  WS /ws/logcat/:id     — logcat stream
  ▼
Go Server (Gin)
  │  GORM (SQLite or MySQL, AutoMigrate on startup)
  │  ADB subprocess client
  │  ffmpeg subprocess (optional, server-side recording)
  │  task.Queue — 5 goroutine workers, buffered chan uint(100)
  │  AgentHub — per-device WebSocket connection map
  │  ScreenHub — per-device viewer fan-out
  ▼
Android Agent (OkHttp WebSocket, persistent connection)
  WS /ws/agent/:deviceToken
```

### Device Modes

- **ADB-only**: device registered with ADB serial; server shells/installs via `adb` subprocess.
- **Agent-only**: registered without ADB serial (ID prefixed `agent-`); all ops routed as JSON commands over the agent WebSocket.
- **Hybrid**: ADB primary, agent as fallback for install.

### Screen Streaming Binary Protocol

Agent sends binary WebSocket frames: `[0x01][width 2B BE][height 2B BE][JPEG...]`. Server identifies them by `data[0] == 0x01 && len(data) >= 6`, then fans out to all browser viewers via `ScreenHub`.

### Install Task Flow

`POST /api/apps/:id/install` → creates DB record → `task.Q.Submit(taskID)` → worker runs:
1. ADB install (if serial present)
2. Falls back to agent: sends `install_app` WS command → agent GETs the APK → uses `PackageInstaller` → reports `install_task_result` → server unblocks via channel (25 min timeout)

### Agent Command Protocol

JSON messages over WebSocket with fields: `type`, `action`, `commandId`, `data`. Android `CommandDispatcher` routes by action to `AppCommandHandler`, `SystemCommandHandler`, `FsCommandHandler`. Results sent back with matching `commandId`.

### Server Package Layout

Flat packages by domain (no `internal/`): `api/`, `agent/`, `screen/`, `auth/`, `adb/`, `task/`, `models/`, `database/`, `config/`, `storage/`, `event/`, `logcat/`, `shell/`, `stomp/`, `audit/`, `custompreset/`, `migrations/`.

Singletons initialized in `main.go` and used directly: `database.DB`, `agent.AgentHub`, `screen.ScreenHub`, `task.Q`, `config.C`.

### Data stack (datasets / open interfaces)

- **Models**: `DataSource`（仅连接；`config_json` 可含 `pool_max_open` / `pool_max_idle` / `pool_conn_max_lifetime_sec` 与 `dsn_fields`）；`Dataset`（`kind`: `static` | `query` | `buffer` | `transaction`）；`DataStructure`（`dataset_id`+`code` 唯一）；`DataInterface`（`data_structure_id`、`param_defaults_json` 可选）。
- **SQL 驱动抽象**: `server/dbdriver` — `OpenDataSource`（含连接池）、`ListTables`、`ListColumns`、`QuoteTableIdent`、缓冲单列 `InsertSingleColumnRow`。
- **API 摘录**: `GET /api/data/sources/:id/tables/:table/columns`；`GET|POST|PUT|DELETE /api/data/datasets/:id/structures`；开放入站 `POST /api/open/v1/ingress/buffer/:dataset_code`（`X-Webhook-Secret`）；后台 `StartBufferPollers` 轮询 `http_poll` 写入缓冲表。
- **`kind=buffer`**: 配置在 **`meta_json`**（`server/datastack`）。`http_webhook` 默认须 `buffer_table`；`http_poll` 可省略物理表（`cache_required=false`）。
- **接口默认参数**: `applyDataInterfaceParamDefaults` 合并 **数据结构 `default_param_values`** 与 **`param_defaults_json`**，再与请求 `param_values` 合并（请求键优先）。
- **Connectors**: 避免出站 HTTP 回调本系统开放数据 URL 形成环（出站层 allowlist 仍为 TBD）。

### Auth Middleware Chain

CORS → `AuthMiddleware()` (JWT Bearer or `?token=` query param) → `RequireRole(admin|operator|viewer)` → `APIKeyMiddleware()` (for `/api/open/v1/*`, scoped via JSON array of strings like `open:devices:list`).

Screen WS also accepts `?share=<token>` for unauthenticated share links.

### Android Agent Internals

- `AgentService` — `LifecycleService` foreground service, holds WakeLock, orchestrates all subsystems
- `AgentWebSocket` — OkHttp WS with exponential backoff auto-reconnect (`Int.MAX_VALUE` retries, 30s ping)
- `CommandDispatcher` — routes incoming messages to command handlers
- `ScreenCaptureManager` — `MediaProjection` API → JPEG binary frames over WS
- `HeartbeatManager` — periodic JSON device info (battery, CPU, memory, storage, network, apps)
- `TouchAccessibilityService` — relays touch input from web console
- `BootReceiver` — restarts service on device boot
- QR code onboarding: agent scans QR to receive server URL + device token
