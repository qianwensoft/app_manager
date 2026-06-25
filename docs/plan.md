# AppManager 完整方案计划 v3.0

> **更新日期**：2026-06-06  
> **替代**：v2.0（仅覆盖设备运维 Phase 1–7，已过时）  
> **状态源**：以代码库为准；各子项目 phase 总结仅作历史参考

---

## 0. 文档定位

本文件是 AppManager 平台的**唯一全景计划**，整合以下曾并行维护的文档：

| 原文档 | 处置 |
|--------|------|
| `docs/plan.md` v2.0 | 由本文替代 |
| `docs/architecture.md` Phase 1–5 | 核心运维部分 ✅ 已完成，细节见该文件 |
| `.omc/plans/connector-trigger-expansion.md` | ✅ 主体已实现，归档；扩展触发器见 Phase C |
| `scada-editor/SchemaPage` 路线图 | 并入 Phase B |
| `form-app/ARCHITECTURE_PLAN.md` | 设计态 ✅；运行态闭环见 Phase A |

**相关契约与测试**：

- 类型契约：`schema/README.md`
- 数据流测试：`docs/test-case/06-connector-dataflow.md`
- MCP 测试：`docs/test-case/01-mcp-basic.md`
- 构建说明：`CLAUDE.md`、`README.md`

---

## 1. 系统全景

AppManager 已从「Android 远程运维平台」演进为四层能力栈：

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Web 控制台 (Vue 3)  —  入口 http://localhost:3001 (dev) / :8080 (prod) │
│  设备运维 │ 数据栈 │ 出站集成 │ Agent 菜单 │ Form App │ 组态 │ 开放 API   │
└─────┬──────────┬─────────────┬──────────────┬────────────────────────────┘
      │          │             │              │
┌─────▼────┐ ┌───▼──────┐ ┌───▼────────┐ ┌──▼─────────────┐
│ Go Server│ │ datastack│ │  outbound  │ │  form-app      │
│ Gin+GORM │ │ buffer   │ │  triggers  │ │  (React SPA)   │
│ MCP /mcp │ │ iface    │ │  phases    │ │  /form-app/*   │
└─────┬────┘ └───┬──────┘ └─────┬──────┘ └───┬────────────┘
      │          │              │              │
      │    ┌─────▼──────────────▼──────────────▼─────┐
      │    │     STOMP 推送总线  /ws/stomp            │
      │    └─────────────────┬───────────────────────┘
      │                      │
┌─────▼──────────────────────▼───────────────────────────────────────────┐
│  scada-editor (React)  —  /scada-editor/*  画布 / 绑定 / 预览 / MCP     │
└────────────────────────────────────────────────────────────────────────┘
      │
┌─────▼────────────────────────────────────────────────────────────────────┐
│  Android Agent  —  屏幕/Shell/Logcat/事件/菜单/FormApp WebView           │
│  app-manager-bridge (本地)  —  USB 设备发现与注册                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 仓库结构

```
server/           Go 后端（API、WebSocket、任务队列、数据栈、出站、MCP）
web/              Vue 3 主控制台
scada-editor/     React 组态编辑器（独立构建，Go 托管静态资源）
form-app/         React 低代码表单（设计器 + 运行时）
agent/            Android Agent
bridge/           本地 USB 扫描桥接
schema/           三端共享 TypeScript 契约（文档用途，无运行时依赖）
docs/             架构、阶段总结、测试用例
```

### 1.2 技术栈摘要

| 层 | 技术 |
|----|------|
| Server | Go 1.21+、Gin、GORM、SQLite/MySQL |
| Web | Vue 3、Vite、Pinia、Element Plus、xterm.js |
| SCADA | React、Zustand、TanStack Query、ECharts、Canvas 2D |
| Form App | React、Vite |
| Agent | Kotlin、OkHttp WebSocket、MediaProjection |
| 推送 | STOMP 1.2 over WebSocket |

---

## 2. 能力矩阵

| 域 | 成熟度 | 已实现 | 缺口 |
|----|--------|--------|------|
| **设备运维** | ✅ 生产可用 | 设备/分组、远程画面、Shell/Logcat、APK 分发、ADB 操作、录屏/截图/文件、摄像头 WebRTC、分享链接、审计、Bridge USB | Docker 镜像；多实例 + Redis Pub/Sub；Prometheus |
| **Android Agent** | ✅ 生产可用 | 长连 WS、屏幕推流、命令分发、MQTT 转发、Agent 菜单、FormApp WebView + ZXing 扫码 | 真机 E2E 待验 |
| **出站集成** | ✅ 基本完整 | 阶段式流水线、8+ 触发器（含 cron/system_event）、TriggerManager、环回防护、投递日志 | 可选扩展：file_watch、db_cdc |
| **数据栈** | ✅ 基本完整 | DataSource/Dataset/DataStructure/DataInterface、Buffer Webhook/Poll、开放 API、Web 管理页 | `transaction` 深度验证；schema 与代码持续同步 |
| **组态 SCADA** | 🟢 功能完整 | 画布/图层/对齐/剪贴板、12 种 ECharts、容器(轮播/标签/折叠/弹窗)、报警灯、动画/事件引擎 | SVG metadata、视频元件（低优） |
| **Form App** | 🟡 运行态增强 | 40+ API、多页面运行时、条件渲染/级联/草稿、Agent 扫码 FAB | 真机 E2E；transaction 用例 |
| **Schema / MCP** | 🟡 基础设施 | `schema/` 含 form-app 契约、`/mcp/v1/` 工具集 | 测试 CI 化 |
| **部署** | ✅ 单机成熟 | Makefile release、SQLite 开箱即用、Docker 镜像 | 多实例 + Redis Pub/Sub |

---

## 3. 数据流（整合视图）

### 3.1 入站：外部数据 → 平台

```
外部 HTTP/MQTT/Webhook
        │
        ├─► 数据栈 Buffer  ──► DataInterface 查询 ──► 开放 API 消费者
        │
        ├─► 出站 Webhook 接收 ──► 触发器 ──► 阶段流水线 ──► 外部 HTTP / Agent Intent
        │
        └─► 自定义事件 (Agent/MQTT) ──► 出站 device_event 触发
```

### 3.2 实时：平台 → 组态画面

```
模拟引擎 (server/scada/sim.go)
        │
        ▼
STOMP /topic/scada/point-data/:code
        │
        ▼
scada-editor 预览页 / 开放 STOMP 消费者
```

设计态与发布态可切换数据模式（HTTP DataInterface 轮询 ↔ STOMP 推送），见 `docs/test-case/06-connector-dataflow.md` TC-CONN-003/004/006。

### 3.3 设备端：Form App 闭环（目标态）

```
Web 设计器 ──发布──► POST deploy-to-devices ──► Agent 菜单
                                              │
Agent 点击菜单 ──► FormAppActivity (WebView) ──► /form-app/runtime/:code
                                              │
扫码 ──► AndroidBridge.scanBarcode() ──► eventManager.emit('barcode')
                                              │
事件路由 API ──► 跳转目标页面
```

**当前断点**：`FormAppBridge.scanBarcode()` 为空实现，需 Phase A2 补齐。

---

## 4. 已完成里程碑

### 4.1 核心运维（原 plan v2.0 Phase 1–7）— ✅

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | Server 骨架、JWT/API Key、ADB 封装 | ✅ |
| Phase 2 | 设备信息、APK 队列、ADB 快捷操作 | ✅ |
| Phase 3 | WebSocket Hub、Shell PTY、Logcat | ✅ |
| Phase 4 | 屏幕流 Hub、ADB 截图模式 | ✅ |
| Phase 5 | Web 前端全页面 | ✅ |
| Phase 6 | Android Agent、MediaProjection 推流 | ✅ |
| Phase 7 | 开放 API、审计、Release 打包 | ✅（Docker 除外） |

**后续增量**（README 已列）：摄像头 WebRTC、Bridge、录屏增强、自定义事件 + MQTT、安装向导、用户管理。

### 4.2 数据栈 — ✅

- 模型：`DataSource`、`Dataset`（static/query/buffer/transaction）、`DataStructure`、`DataInterface`
- 驱动抽象：`server/dbdriver`（连接池、表/列探测、缓冲单列写入）
- 后台：`StartBufferPollers`（http_poll 入缓冲表）
- 开放入站：`POST /api/open/v1/ingress/buffer/:dataset_code`
- 前端：`web/src/views/data/DataStack.vue`

### 4.3 出站集成 — ✅（触发器扩展计划主体）

| 触发类型 | 说明 | 代码 |
|----------|------|------|
| `device_event` | 设备自定义事件（默认） | `outbound/dispatch.go` |
| `http_webhook` | 关联 OutboundWebhook 入站 | `outbound/trigger_webhook.go` |
| `http_poll` | 定时 HTTP 轮询 | `outbound/trigger_poll.go` |
| `websocket` | 外部 WS 订阅 | `outbound/trigger_ws.go` |
| `stomp` | 外部 STOMP 订阅 | `outbound/trigger_stomp.go` |
| `data_poll` | DataInterface 轮询 | `outbound/trigger_data_poll.go` |
| `channel` | MQTT / Kafka | `outbound/trigger_channel.go` |

生命周期：`outbound.InitTriggerManager`（`main.go`），同 URL 会话共享（`trigger_manager.go`）。  
前端：`web/src/views/OutboundConnectorEdit.vue`。

阶段步骤类型：`http`、`broadcast_intent`、`view_url`、`message`、`app_script`、`data_interface`。

### 4.4 组态 SCADA — 🟡

| 能力 | 状态 |
|------|------|
| 多画布项目、undo/redo、z-order、锁定/可见 | ✅ |
| 框选、对齐、分布（`AlignToolbar`） | ✅ |
| 复制/粘贴（`editorStore` + 快捷键） | ✅ |
| ECharts 图表 + schema 驱动样式/绑定 | ✅ 近期完成 |
| 右键 BindingDrawer、模拟点位、预览/分享 | ✅ |
| MCP 工具（list_scada、add_element 等） | ✅ |
| 属性面板统一 4 Tab（基础/数据/事件/动画） | ✅ Phase B1 |
| 动画执行引擎（rotate/blink/flow） | ✅ Phase B2 |
| 事件执行引擎（条件-动作链） | ✅ Phase B3 |

### 4.5 Form App — 🟡

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 数据模型、40+ API | ✅ |
| Phase 2 | 快速生成（表 → 页面） | ✅ |
| Phase 3 | 多页面设计器 V2 | ✅ |
| Phase 4 | 运行时渲染器 | ✅ |
| Phase 5 | Agent 菜单下发、FormAppActivity、Bridge | ✅ |
| Phase 6 | 测试与优化 | ✅ 服务端 E2E + 真机手册；设备手验见 TC-FORM-AGENT |

---

## 5. 整合路线图

### Phase A — 闭环验证（2–3 周）🔴

**目标**：三条主链路可测、可演示、文档与代码一致。

| ID | 任务 | 估时 | 验收标准 |
|----|------|------|----------|
| A1 | 组态数据流 E2E | 3d | ✅ 2026-06-06 自动化：`go test ./server/tests` 覆盖 TC-001/003/004/006；TC-002/005 需外部 Webhook/MQTT 手动验 |
| A2 | Form App Agent 闭环 | 3d | ✅ 2026-06-06 代码：`FormAppActivity`+ZXing 扫码+Manifest；设备 E2E 待真机验证 |
| A3 | MCP 基础测试 | 2d | ✅ 2026-06-06 自动化：TC-MCP-001~003/005/009/010 见 `server/tests/phase_a_test.go` |
| A4 | 文档同步 | 1d | ✅ 2026-06-05 完成：form-app 各 phase 总结已校正；connector-trigger 计划已归档 |

### Phase B — 组态编辑器深化（3–4 周）🟡

**目标**：对齐 dbscada 级编辑体验，补齐运行时引擎。

| 优先级 | 任务 | 估时 | 参考 |
|--------|------|------|------|
| B1 | 属性面板 4 Tab 重构 | 4d | ✅ 2026-06-06 基础/数据/事件/动画 Tab + 绑定模式选择器 |
| B2 | 动画执行引擎 | 3d | ✅ 2026-06-06 `animationExecutor.ts` + 预览页 CSS/Canvas 动画 |
| B3 | 事件执行引擎 | 4d | ✅ 2026-06-06 `eventExecutor.ts` + 点击/悬停/条件触发 |
| B4 | 数据绑定四模式 | 3d | ✅ 2026-06-06 `bindingResolver` + `useCanvasBindingData` 预览页统一 |
| B5 | 图层拖拽排序 | 1d | ✅ 2026-06-06 `LayerPanel` + @dnd-kit 拖拽把手 |

**暂缓**（Phase B 完成后再排）：视频/HLS 播放器、计算属性沙箱、趋势图弹窗。

### Phase C — 平台化扩展（4–6 周）🟢

| ID | 任务 | 估时 | 说明 |
|----|------|------|------|
| C1 | 出站 `cron` 触发器 | 2d | ✅ 2026-06-06 `trigger_cron.go` + robfig/cron |
| C2 | 出站 `system_event` 触发器 | 2d | ✅ 2026-06-06 Agent 上下线 + install.completed |
| C3 | 出站环回防护 allowlist | 1d | ✅ 2026-06-06 `loopback_guard.go` 拦截本机 `/api/open/v1` |
| C4 | Form App 增强 | 5d | ✅ 2026-06-05 条件渲染、级联查询、localStorage+服务端草稿 |
| C5 | Docker + docker-compose | 2d | ✅ 2026-06-06 多阶段 Dockerfile + SQLite/MySQL compose |
| C6 | `schema/` 补全 form-app | 2d | ✅ 2026-06-05 `schema/api/form-app.ts` + `schema/form-app/*` |
| C7 | SCADA P2 元件 | 7d | ✅ 2026-06-05 标签页/折叠/报警灯 + ECharts 扩展至 12 种 |

### Phase D — 闭环收尾与质量（1–2 周）✅

| ID | 任务 | 估时 | 说明 |
|----|------|------|------|
| D1 | Form App Phase 6 | 3d | ✅ Agent 鉴权运行时 API + 菜单下发 E2E 测试 |
| D2 | Form App 草稿 API 测试 | 1d | ✅ `server/tests/form_app_draft_test.go` |
| D3 | 数据栈 transaction E2E | 2d | ✅ `server/tests/data_stack_transaction_test.go` |
| D4 | API 限流落地 | 2d | ✅ `server/ratelimit` + login/open/mcp 中间件 |
| D5 | MCP / 数据流 CI 化 | 1d | ✅ `.github/workflows/server-tests.yml` |

### Phase E — 稳定化与扩展 ✅

| ID | 任务 | 估时 | 说明 |
|----|------|------|------|
| E1 | 集成测试稳定性 | 1d | ✅ 数据流测试按需启动 sim batcher，避免 SQLITE_BUSY |
| E2 | form-app 构建修复 | 0.5d | ✅ `PageDesignerPage` antd4 / designable 类型 |
| E3 | 真机 E2E 手册 | 0.5d | ✅ `docs/test-case/07-form-app-agent-e2e.md` |
| E4 | schema 对账 | 2d | ✅ `server/schemasync` + `make schema-check` |
| E5 | 水平扩展设计 | 3d | ✅ `server/cluster`（STOMP/屏幕/Shell/Logcat 中继 + `/metrics` + agent-route API） |

---

## 6. 各域待办清单

### 6.1 Server / 运维

- [x] Dockerfile + docker-compose（Phase C5）
- [x] API 限流（`rate_limit` 配置 + login/open/mcp 令牌桶）
- [x] 水平扩展（Redis STOMP/屏幕/Shell/Logcat 中继 + Agent 转发 + `/metrics` + agent-route API，见 `docs/horizontal-scaling.md`）

### 6.2 出站集成

- [x] `cron`、`system_event` 触发器（Phase C1/C2）
- [x] 出站 HTTP 回调本系统开放接口的环回防护（Phase C3）
- [ ] 可选：`file_watch`、`db_cdc`、`email_inbound`（低优先级）

### 6.3 数据栈

- [x] `kind=transaction` 端到端用例（Phase D3）
- [x] schema 与 `server/models` 字段对账（`make schema-check`，Phase E4）

### 6.4 组态 SCADA

- [x] 属性面板 4 Tab（Phase B1）
- [x] 动画引擎（Phase B2）
- [x] 事件引擎（Phase B3）
- [x] P2：容器元件（轮播/标签页/折叠/弹窗）、报警灯、12 种图表（Phase C7）
- [ ] SVG metadata、视频元件（低优）

### 6.5 Form App

- [x] Agent 扫码库 + 相机权限 + Manifest（Phase A2）
- [x] 运行时 Agent 扫码 FAB + `?page=` 深链（Phase D1）
- [x] 真机 E2E 手册（`docs/test-case/07-form-app-agent-e2e.md`）；设备手验按需执行
- [x] 条件渲染、级联查询、草稿（Phase C4）
- [ ] AI 语义生成（低优先级）

### 6.6 Agent

- [x] `FormAppBridge.scanBarcode()` + ZXing（Phase A2）
- [x] Form App 运行时移动端样式（Phase D1）

---

## 7. API 与协议索引

完整类型见 `schema/`。以下为高频端点摘要。

### 7.1 认证

- JWT：`Authorization: Bearer` 或 `?token=`
- API Key：`X-API-Key` → `/api/open/v1/*`
- 屏幕分享：`?share=<token>`

### 7.2 WebSocket

| 路径 | 用途 |
|------|------|
| `/ws/agent/:deviceToken` | Agent 长连 |
| `/ws/screen/:deviceId` | MJPEG 画面 |
| `/ws/shell/:deviceId` | PTY Shell |
| `/ws/logcat/:deviceId` | Logcat |
| `/ws/camera/:deviceId` | WebRTC 信令 |
| `/ws/stomp` | STOMP 推送 |

### 7.3 数据栈开放

- 查询/写入：`/api/open/v1/data/:slug`（scope: `open:dataiface:query` / `write`）
- Buffer 入站：`POST /api/open/v1/ingress/buffer/:dataset_code`（`X-Webhook-Secret`）

### 7.4 出站

- 管理：`/api/outbound/*`（JWT）
- Webhook 入站：`/api/open/v1/ingress/webhook/:id`（按 Webhook 配置鉴权）

### 7.5 Form App

- 管理：`/api/form-app/infos/*`、`pages/*`、`links/*`、`event-routes/*`
- 运行时：`POST /api/form-app/runtime/query|submit`；草稿 `GET|PUT|DELETE /api/form-app/runtime/draft`
- 下发：`POST /api/form-app/infos/:id/deploy-to-devices`
- 静态：`/form-app/*`（React SPA）；多页面运行时 `/form-app/runtime/:code`

### 7.6 组态

- REST：`/api/scada/*`
- 画布：`GET|PUT /api/scada/infos/:id/canvas`
- 模拟推送：STOMP `/topic/scada/point-data/:code`

### 7.7 MCP

- 端点：`POST /mcp/v1/`（API Key）
- 工具：见 `server/mcp/tools_*.go`

---

## 8. 构建与发布

```bash
# 全量构建
make server          # web + scada-editor + form-app + go build

# 分模块
cd web && npm run build
cd scada-editor && npm run build
cd form-app && npm run build
cd server && go run . config.sqlite.yaml

# 发布包
make release         # → dist/release/app-manager-<VERSION>/
make release-zip
```

默认账号：`admin / admin123`（首次启动自动创建，**生产务必修改**）。

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v2.0 | — | 设备运维 Phase 1–7 原始计划 |
| v3.0 | 2026-06-05 | 整合数据栈、出站、组态、Form App、MCP；归档并行计划；定义 Phase A/B/C |
| v3.1 | 2026-06-06 | Phase D 收尾（限流、transaction E2E、Agent 运行时）；Phase E 稳定化 |
| v3.2 | 2026-06-06 | Phase E5 水平扩展：cluster 包 + 设计文档 |
| v3.3 | 2026-06-06 | E5 扩展：屏幕/Shell/Logcat Redis 中继、Prometheus、agent-route API、Nginx 示例 |
| v3.4 | 2026-06-06 | E5：WebRTC 摄像头 RTP 跨节点中继 + 全集群 start/stop_camera |

---

## 10. 决策记录（摘要）

| 决策 | 理由 |
|------|------|
| 出站非事件触发复用 `RunConnectorOutbound` | 最小改动，阶段流水线与模板渲染一次实现 |
| TriggerManager 同 URL 会话共享 | 减少外部 WS/MQTT 连接数 |
| Form App 用 WebView 而非原生 UI | 复用 React 运行时，支持热更新 |
| `schema/` 纯文档无 npm 包 | 三端独立构建，TS 文件作契约参考 |
| SCADA 独立 React 应用 | 编辑器复杂度高，与 Vue 主控制台解耦 |
| SQLite 默认 | 单机自托管零依赖；MySQL 可选 |
