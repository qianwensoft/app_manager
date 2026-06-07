# App Manager

**App Manager** 是一套可 **内网自托管** 的 **Android 设备集中管理与远程运维平台**，并在设备运维之上扩展出 **数据集成、可视化组态（SCADA）、低代码表单** 等能力。一个浏览器控制台 + 设备端 Agent + 可选本地 USB 桥接，默认使用 **SQLite**（无需单独装数据库），数据全部留在你自己的服务器。

> 一句话：**既能远程管 Android 设备，也能把设备/外部系统的数据接进来、做成可视化大屏与表单，并按权限对外开放 API。**

典型用途包括：**PDA / 工业手持终端管理**、**Android 远程桌面（远程画面查看）**、**远程屏幕分享**、批量安装 APK、Web Shell / Logcat、截图与录屏归档，以及 **设备数据采集 → 数据接口 → 组态大屏 / 外部系统推送** 的一体化数据流。

---

## 关键词与定位

| 你可能在找 | 本仓库提供的能力 |
|------------|------------------|
| **PDA 管理** / **手持终端管理** | 设备分组、在线状态、已装应用、远程操作入口统一在 Web |
| **Android 远程桌面** / **远程画面** | 低延迟 **屏幕实时查看**、触控回传、全屏查看 |
| **远程桌面分享** / **屏幕分享** | 生成 **分享链接**，免登录按权限查看画面（适合协助、演示、监考场景） |
| **工业平板 / 扫码枪设备** | 支持 Agent 常连 + USB/网络 ADB 混合接入，统一台账 |
| **MDM 轻量替代** | 自托管、开放 API、审计日志；非系统级管控，侧重研发与运维协作 |
| **设备数据采集 / 集成** | 自定义事件 + 数据栈 + 出站连接器，把扫码/广播/外部库数据接入并转发 |
| **工业组态 / 可视化大屏** | 内置 SCADA 编辑器，绑定数据点实时刷新，发布后分享预览 |
| **低代码表单 / 现场录入** | Form App 设计器 + 运行时，下发到设备端 Agent 内嵌运行、支持扫码 |

适合需要 **统一管理多台 PDA、测试机、展厅或门店设备**，并希望把 **设备数据可视化、对接外部系统** 的团队；数据留在自己服务器，可配合 `Makefile` / Docker 一键构建与部署。

---

## 能力范围

平台已从单一「设备运维」演进为多域能力栈。下表按域给出**成熟度**与**核心能力**，便于快速判断是否覆盖你的需求（成熟度仅作参考，详见 [`docs/plan.md`](docs/plan.md)）。

| 能力域 | 成熟度 | 核心能力 |
|--------|--------|----------|
| **设备运维** | ✅ 生产可用 | 设备/分组台账、远程画面 + 触控、Web Shell / Logcat、APK 分发与远程安装、ADB 操作、截图/录屏/录音、文件管理、摄像头 WebRTC、屏幕分享链接、审计日志、USB Bridge |
| **Android Agent** | ✅ 生产可用 | WebSocket 长连接、屏幕推流、命令分发、自定义事件采集、MQTT 转发、Agent 菜单目录、Form App WebView + 扫码 |
| **出站集成（连接器）** | ✅ 基本完整 | 阶段式流水线 + 多种触发器（`device_event`/`http_webhook`/`http_poll`/`websocket`/`stomp`/`data_poll`/`channel(MQTT/Kafka)`/`cron`/`system_event`）；静态/动态鉴权、环回防护、投递日志 |
| **数据栈** | ✅ 基本完整 | 连接外部库（MySQL/SQLite 等）、Dataset（静态/查询/缓冲/事务）、DataStructure/DataInterface、Buffer Webhook/HTTP 轮询入站、开放数据 API |
| **组态 SCADA** | 🟢 功能完整 | 拖拽画布、图层/对齐/复制粘贴、12 种 ECharts 图表、容器（轮播/标签/折叠/弹窗）、报警灯、数据点绑定实时刷新、动画与事件引擎、发布预览/分享 |
| **Form App（低代码表单）** | 🟡 增强中 | 表→页面快速生成、多页面设计器、运行时渲染、条件渲染/级联查询/草稿、下发到设备 Agent、扫码联动 |
| **开放 API / MCP** | 🟡 基础设施 | API Key + 权限范围（scope）、`/api/open/v1/*` 开放接口、`/mcp/v1/` MCP 工具集，便于接入 CI / 内部系统 / AI 助手 |
| **部署与扩展** | ✅ 单机成熟 | Makefile 跨平台编译与 release 打包、Docker / docker-compose、API 限流；多实例 + Redis 中继与 Prometheus 指标（见 `docs/horizontal-scaling.md`） |

> 边界说明：本平台侧重**研发与运维协作**，**非系统级 MDM 管控**（不做强制策略、远程擦除等系统级管理）；组态与 Form App 面向中小规模可视化与现场录入，超大规模工业 SCADA 请评估专用方案。

---

## 典型使用场景

下面按「想解决的问题」给出可落地的组合方式，帮助你判断如何使用：

### 1. PDA / 手持终端集中运维
- **诉求**：仓储、门店、产线有几十到上百台扫码枪 / 工业 PDA，需要统一看在线状态、批量装更新、远程排障。
- **怎么用**：设备端装 Agent → Web 控制台统一台账与分组 → **批量安装/卸载 APK** → 出问题时 **远程画面 + 触控 + Shell/Logcat** 排查 → 截图/录屏归档留证。
- **涉及能力**：设备运维、Android Agent、应用分发、终端日志。

### 2. Android 远程桌面 / 远程协助与演示
- **诉求**：远程查看某台设备实时画面、协助操作，或向他人演示而不暴露后台账号。
- **怎么用**：屏幕实时查看 + 触控回传；对外只需生成 **免登录分享链接**，按权限限定可见范围（适合协助、演示、监考）。
- **涉及能力**：远程画面、屏幕分享、摄像头 WebRTC。

### 3. 设备数据采集 → 外部系统联动
- **诉求**：PDA 扫码 / 系统广播等事件要实时推送到 ERP / MES / 企业微信等外部系统。
- **怎么用**：在 **自定义事件** 中配置广播监听 → 通过 **出站连接器** 的阶段式流水线推送（支持 HTTP、MQTT/Kafka、动态鉴权 Token、投递日志重试）；也可 MQTT 直转。
- **涉及能力**：自定义事件、出站集成、Agent MQTT 转发。

### 4. 把外部 / 设备数据做成可视化大屏
- **诉求**：把数据库或设备上报的数据做成实时刷新的看板 / 组态画面。
- **怎么用**：**数据栈** 连接外部库并定义数据接口（或用 Buffer 接收 Webhook/轮询入站）→ **组态 SCADA** 拖拽画布绑定数据点 → 发布后通过分享链接投屏展示，数据经 STOMP 实时推送。
- **涉及能力**：数据栈、组态 SCADA、开放 API。

### 5. 现场低代码录入表单
- **诉求**：现场人员需要在设备上填报 / 扫码录入，且表单要能快速迭代、免重新打包。
- **怎么用**：**Form App** 设计器快速从数据表生成多页面表单 → 一键 **下发到设备 Agent** 的菜单 → Agent 内置 WebView 运行，支持 **扫码联动**、级联查询、草稿暂存。
- **涉及能力**：Form App、Agent 菜单、数据栈。

### 6. 接入 CI / 内部系统 / AI 助手
- **诉求**：用脚本或第三方系统调用平台能力，或让 AI 助手直接操作组态/设备数据。
- **怎么用**：签发带 **权限范围（scope）** 的 API Key → 调用 `/api/open/v1/*` 开放接口；或通过 `/mcp/v1/` **MCP 工具集** 让兼容 MCP 的客户端调用。
- **涉及能力**：开放 API、MCP。

---

## 界面预览

**设备详情** — Agent 在线、网络与存储、**PDA / 终端** 快捷入口（远程画面、Shell、截图、测速等）。

![设备详情](docs/screenshots/device-detail.png)

**屏幕查看（Android 远程桌面）** — 实时画面、端到端延迟、**分享链接** 与投屏状态。

![屏幕查看](docs/screenshots/screen-view.png)

---

## 环境要求

- **Go** 1.21+
- **Node.js** 18+（仅在你需要**重新构建**前端时）
- **adb**（Android 平台工具，在 `PATH` 中或配置里写绝对路径）
- **ffmpeg**（可选；需要服务端把录屏合成 **MP4** 时再装，否则可留空）

---

## 最快上手（SQLite，推荐）

**请在仓库根目录**（与 `web/`、`server/` 同级）执行下列命令，这样静态页面路径 `./web/dist` 才能正确加载。

也可使用 **`make all`** 构建前端并编译服务端二进制（见仓库根目录 [Makefile](Makefile)）；若要同时启用 **组态 SCADA** 与 **Form App**，请用 `make server`（会一并构建 `scada-editor/` 与 `form-app/`）。

### 1. 构建前端（若已有 `web/dist` 可跳过）

```bash
cd web && npm install && npm run build && cd ..
```

### 2. 编译并启动后端

```bash
go build -C server -o app-manager .
./app-manager server/config.sqlite.yaml
```

启动后浏览器访问：**http://127.0.0.1:8080**

### 3. 默认账号

首次启动若无用户，会自动创建管理员：

- 用户名：`admin`
- 密码：`admin123`

**务必登录后修改密码**；生产环境请修改 `jwt.secret` 或设置环境变量 `JWT_SECRET`。

---

## 用 Docker 部署（可选）

仓库已内置多阶段 [Dockerfile](Dockerfile) 与 compose 文件，免本机装 Go / Node：

```bash
# 默认 SQLite 单容器
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d --build
# 访问 http://localhost:8080（默认账号 admin / admin123）
```

需要 MySQL 时改用 [docker-compose.mysql.yml](docker-compose.mysql.yml)：

```bash
docker compose -f docker-compose.mysql.yml up -d --build
```

数据与上传分别挂载到 `app-data` / `app-uploads` 卷，容器重启不丢失。

---

## 配置说明

| 文件 | 用途 |
|------|------|
| [server/config.sqlite.yaml](server/config.sqlite.yaml) | **简化配置**：SQLite，复制即用 |
| [server/config.yaml](server/config.yaml) | 示例（含 MySQL 等），可按需参考 |

指定配置文件：

```bash
./app-manager /path/to/your-config.yaml
```

常用环境变量（覆盖配置中的同名项）：

- `JWT_SECRET` — JWT 密钥  
- `ADB_PATH` — adb 可执行文件路径  
- `FFMPEG_PATH` — ffmpeg 可执行文件路径  

### MQTT 转发（可选）

自定义事件支持转发到 MQTT broker，在配置文件中启用：

```yaml
mqtt:
  enabled: true
  broker: tcp://localhost:1883
  username: ""
  password: ""
  client_id: app-manager
  qos: 1
```

在「自定义事件配置」页面可为事件分组或单个事件定义配置 MQTT 主题，事件上报时自动转发。

---

## 使用 MySQL（可选）

将 `database` 改为例如：

```yaml
database:
  type: mysql
  dsn: "user:pass@tcp(127.0.0.1:3306)/app_manager?charset=utf8mb4&parseTime=True&loc=Local"
```

---

## Android Agent

设备端（**PDA、手机、工业平板** 等）需安装配套 **Agent**，配置服务器地址后与控制台保持 WebSocket 长连接，即可使用 **远程画面、Shell、日志** 等能力。

仓库内可用 Gradle 或 Makefile 编译安装，例如：

```bash
make install-agent
# 或
cd agent && ./gradlew :app:installDebug
```

亦可使用脚本 `./scripts/sync-agent-apk.sh`（需本机 Android SDK / Gradle；环境变量可参考 `scripts/sync-agent-apk.env.example`）。

---

## 本地开发前端（可选）

后端仍按上文在仓库根目录启动；前端单独调试时：

```bash
cd web && npm install && npm run dev
```

Vite 默认把 `/api`、`/ws` 代理到 `http://127.0.0.1:8080`，如需改端口可设置环境变量 `VITE_PROXY_TARGET`。

---

## 仓库结构（简要）

```
server/          Go 服务（API、WebSocket、任务队列、数据栈、出站、MCP）
web/             Vue 3 主控制台
scada-editor/    组态编辑器（React 独立子应用，由 Go 服务托管）
form-app/        低代码表单设计器 + 运行时（React，Go 托管）
agent/           Android Agent 工程
bridge/          本地 USB 扫描桥接（Go）
schema/          三端共享 TypeScript 契约（文档用途，无运行时依赖）
scripts/         辅助脚本（如 APK 同步）
docs/            文档与界面截图（README 引用）；整体规划见 docs/plan.md
Makefile         构建 server / web / scada-editor / form-app / agent 与 release 打包
```

> 想了解完整能力栈、成熟度与路线图，参见 [`docs/plan.md`](docs/plan.md)（平台全景计划）。

---

## App Manager Bridge（本地 USB 扫描）

`bridge/` 是一个轻量本地代理程序，运行在管理员电脑上，通过 WebSocket 向浏览器推送本机 USB 连接的 Android 设备列表，并支持一键注册到 app-manager 服务器。

### 使用方式

```bash
# 编译
cd bridge && go build -o app-manager-bridge .

# 运行（需本机已安装 adb 并在 PATH 中）
./app-manager-bridge
# 监听 ws://127.0.0.1:17175
```

浏览器打开 app-manager 控制台 → 设备列表页 → 点击「USB 扫描」，即可自动发现并注册 USB 设备。

> Bridge 仅监听本地回环地址 `127.0.0.1`，不对外暴露。

---

## 许可证与贡献

欢迎 Issue / PR：优化文档（如 **PDA 管理**、**远程桌面分享** 等场景的说明）、修复问题、分享部署经验。

若在生产环境部署，请务必将默认密码、`jwt.secret` 与数据库连接信息替换为安全值。
