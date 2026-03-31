# AppManager 完整方案计划 v2.0

## 系统全景图

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web 前端 (Vue 3)                          │
│                                                                  │
│  Dashboard │ Devices │ Screen │ Shell │ Logcat │ Apps │ ApiKeys  │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼───────────────────────────────────────────┐
│                      Server 后端 (Go)                            │
│                                                                  │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │  Auth   │ │  Device  │ │   App   │ │ Screen │ │  Shell   │  │
│  │ JWT/Key │ │  Manager │ │ Manager │ │  Hub   │ │   PTY    │  │
│  └─────────┘ └──────────┘ └─────────┘ └────────┘ └──────────┘  │
│                                                                  │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │ Storage │ │  Logcat  │ │  Task   │ │ Audit  │ │  Open    │  │
│  │  APK    │ │  Stream  │ │  Queue  │ │  Log   │ │   API    │  │
│  └─────────┘ └──────────┘ └─────────┘ └────────┘ └──────────┘  │
└──────┬───────────────────────────────────────────────────────────┘
       │
       ├─── ADB USB/TCP ──────────────────────────────────────────┐
       │                                                          │
       │    ┌─────────────────────┐    ┌──────────────────────┐  │
       │    │  Android Agent App  │    │  Android 设备 (ADB)  │  │
       │    │                     │    │                      │  │
       │    │  ScreenCapture      │    │  基础 ADB 功能       │  │
       │    │  HeartbeatService   │    │  安装/信息/Shell     │  │
       │    │  DeviceInfoService  │    │                      │  │
       │    │  CommandReceiver    │    └──────────────────────┘  │
       │    │  FileTransfer       │                              │
       │    └─────────────────────┘                              │
       └──────────────────────────────────────────────────────────┘
```

---

## 一、Server 后端

### 目录结构
```
server/
├── main.go
├── go.mod
├── config/
│   └── config.go
├── database/
│   ├── db.go
│   └── seed.go
├── models/
│   ├── user.go
│   ├── device.go
│   ├── app.go
│   ├── api_key.go
│   ├── install_task.go
│   └── audit_log.go
├── auth/
│   ├── jwt.go
│   ├── apikey.go
│   └── middleware.go
├── adb/
│   ├── client.go
│   ├── device.go
│   ├── info.go
│   ├── install.go
│   └── ops.go
├── agent/
│   ├── hub.go
│   ├── handler.go
│   └── protocol.go
├── screen/
│   ├── hub.go
│   └── stream.go
├── shell/
│   ├── pty.go
│   └── hub.go
├── logcat/
│   ├── stream.go
│   └── hub.go
├── storage/
│   └── apk.go
├── task/
│   └── queue.go
├── audit/
│   └── logger.go
├── api/
│   ├── router.go
│   ├── auth.go
│   ├── device.go
│   ├── app.go
│   ├── screen.go
│   ├── shell.go
│   ├── logcat.go
│   ├── adb_ops.go
│   ├── task.go
│   └── open.go
└── uploads/
```

### 数据模型
```
User        → id, username, password_hash, role, created_at, last_login_at
Device      → id, serial, name, model, brand, os_version, sdk_version,
              cpu_info, total_memory, total_storage, resolution,
              ip_address, status, agent_connected, agent_version, last_seen_at
App         → id, name, package_name, version_name, version_code,
              file_path, file_size, md5, uploaded_by, created_at
ApiKey      → id, user_id, name, key, permissions(JSON), expires_at,
              last_used_at, created_at, revoked
InstallTask → id, app_id, device_id, action, status, output,
              created_by, created_at, finished_at
AuditLog    → id, user_id, device_id, action, command,
              ip_address, result, created_at
```

### API 接口清单
```
# 认证
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/apikey
GET    /api/auth/apikey
DELETE /api/auth/apikey/:id

# 设备管理
GET    /api/devices
POST   /api/devices
GET    /api/devices/:id
PUT    /api/devices/:id
DELETE /api/devices/:id
POST   /api/devices/:id/connect
POST   /api/devices/scan
GET    /api/devices/:id/info
GET    /api/devices/:id/apps

# ADB 快捷操作
POST   /api/devices/:id/adb/reboot
POST   /api/devices/:id/adb/screenshot
POST   /api/devices/:id/adb/keyevent
POST   /api/devices/:id/adb/input/text
POST   /api/devices/:id/adb/push
GET    /api/devices/:id/adb/pull
POST   /api/devices/:id/adb/app/start
POST   /api/devices/:id/adb/app/stop
POST   /api/devices/:id/adb/app/clear
POST   /api/devices/:id/adb/app/grant
GET    /api/devices/:id/adb/files

# APK 管理
POST   /api/apps/upload
GET    /api/apps
GET    /api/apps/:id
DELETE /api/apps/:id
POST   /api/apps/:id/install
POST   /api/apps/:id/uninstall

# 任务管理
GET    /api/tasks
GET    /api/tasks/:id
DELETE /api/tasks/:id

# 审计日志
GET    /api/audit

# WebSocket
WS     /ws/screen/:deviceId
WS     /ws/shell/:deviceId
WS     /ws/logcat/:deviceId
WS     /ws/agent/:deviceId

# 对外开放 API（X-API-Key 鉴权）
GET    /api/open/v1/devices
GET    /api/open/v1/devices/:id/info
GET    /api/open/v1/devices/:id/apps
POST   /api/open/v1/apps/upload
POST   /api/open/v1/apps/:id/install
GET    /api/open/v1/tasks/:id
POST   /api/open/v1/webhook
```

---

## 二、Web 前端

### 目录结构
```
web/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/index.js
│   ├── stores/
│   │   ├── auth.js
│   │   ├── device.js
│   │   └── task.js
│   ├── api/
│   │   ├── http.js
│   │   ├── auth.js
│   │   ├── device.js
│   │   ├── app.js
│   │   └── task.js
│   ├── utils/
│   │   ├── ws.js
│   │   └── format.js
│   ├── views/
│   │   ├── Login.vue
│   │   ├── Dashboard.vue
│   │   ├── Devices.vue
│   │   ├── DeviceDetail.vue
│   │   ├── Screen.vue
│   │   ├── Shell.vue
│   │   ├── Logcat.vue
│   │   ├── Apps.vue
│   │   ├── Tasks.vue
│   │   ├── ApiKeys.vue
│   │   └── AuditLog.vue
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.vue
│       │   └── Header.vue
│       ├── DeviceCard.vue
│       ├── ScreenViewer.vue
│       ├── TerminalTab.vue
│       ├── LogcatViewer.vue
│       ├── InstallModal.vue
│       ├── AdbOpsPanel.vue
│       └── FileManager.vue
```

### 技术栈
```
Vue 3 + Composition API
Vite
Pinia
Vue Router 4
Axios
Element Plus
xterm.js + @xterm/addon-fit
Canvas API
```

---

## 三、Android Agent App

### 目录结构
```
agent/
├── app/src/main/
│   ├── AndroidManifest.xml
│   └── java/com/appmanager/agent/
│       ├── App.kt
│       ├── MainActivity.kt
│       ├── service/
│       │   ├── AgentService.kt
│       │   ├── HeartbeatService.kt
│       │   ├── ScreenCaptureService.kt
│       │   └── DeviceInfoService.kt
│       ├── ws/
│       │   ├── AgentWebSocket.kt
│       │   └── Protocol.kt
│       ├── command/
│       │   ├── CommandDispatcher.kt
│       │   ├── AppCommand.kt
│       │   └── SystemCommand.kt
│       └── util/
│           ├── DeviceInfo.kt
│           └── ScreenEncoder.kt
```

### Agent 通信协议
```json
// 心跳
{ "type": "heartbeat", "deviceId": "xxx", "timestamp": 1234567890 }

// 设备信息上报
{ "type": "device_info", "data": {
    "battery": 85, "cpu_usage": 23.5,
    "memory_used": 2048, "memory_total": 6144,
    "network_type": "WiFi", "ip": "192.168.1.100"
}}

// 屏幕帧
{ "type": "screen_frame", "format": "jpeg",
  "width": 1080, "height": 1920, "data": "<base64>" }

// Server 下发指令
{ "type": "command", "action": "install_app",
  "payload": { "url": "http://server/apk/xxx.apk" }}
{ "type": "command", "action": "start_screen" }
{ "type": "command", "action": "stop_screen" }
```

---

## 四、安全设计

```
认证层
├── 内部用户：JWT Token（1天）+ Refresh Token（7天）
├── 外部系统：API Key（UUID v4，可设过期时间）
└── Agent：设备注册 Token

权限层
├── admin    → 全部操作
├── operator → 设备管理、安装、Shell、Logcat
└── viewer   → 只读

安全措施
├── Shell 命令黑名单过滤
├── 所有 Shell 操作写入审计日志
├── APK 上传 MD5 校验 + 文件类型验证
├── WebSocket 连接需携带有效 Token
├── HTTPS/WSS 传输加密
└── API 限流（rate limiting）
```

---

## 五、部署方案

```
单机部署
├── Server 编译为单二进制
├── SQLite 数据库
├── Web 静态文件由 Server serve
└── ADB 工具预装在 Server 机器

Docker 部署
├── Dockerfile（Go 多阶段构建 + Node 构建前端）
├── docker-compose.yml
└── 挂载 uploads/ 和 data/

config.yaml
├── server.port: 8080
├── database.path: ./data/app-manager.db
├── storage.path: ./uploads
├── adb.path: /usr/bin/adb
├── jwt.secret: <random>
└── jwt.expire: 24h
```

---

## 六、开发顺序

```
Phase 1 - Server 核心骨架
  ├── 项目初始化、配置、数据库
  ├── 授权模块（JWT + API Key）
  └── ADB 封装 + 设备管理 API

Phase 2 - 设备 & APK 功能
  ├── 设备信息采集 API
  ├── APK 上传 + 安装任务队列
  └── ADB 快捷操作 API

Phase 3 - 实时通信
  ├── WebSocket Hub 架构
  ├── Shell PTY 终端
  └── Logcat 流

Phase 4 - 屏幕同步
  ├── 屏幕流中转 Hub
  └── ADB screencap 截图流（无 Agent 模式）

Phase 5 - Web 前端
  ├── 登录 + 布局 + 设备列表
  ├── 设备详情 + ADB 操作面板
  ├── Shell + Logcat 页面
  ├── 屏幕查看（Canvas）
  └── APK 管理 + 任务 + API Key

Phase 6 - Android Agent
  ├── 基础 Service + 心跳 + 重连
  ├── 设备信息持续上报
  └── MediaProjection 屏幕采集推流

Phase 7 - 收尾
  ├── 对外开放 API + Webhook
  ├── 审计日志
  └── Docker 打包部署
```
