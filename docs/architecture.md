# AppManager 技术架构路线

## 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户层                                   │
│  Web 浏览器 | 第三方系统（通过 API Key）                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS / WSS
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                      应用层 - Server (Go)                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Web 服务    │  │  WebSocket   │  │  任务队列    │          │
│  │  Gin Router  │  │  Hub 管理    │  │  异步执行    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  认证授权    │  │  审计日志    │  │  文件存储    │          │
│  │  JWT/APIKey  │  │  操作记录    │  │  APK 管理    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ ADB Protocol
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    设备层 - Android                              │
│                                                                  │
│  ┌──────────────────────┐        ┌──────────────────────┐      │
│  │  Agent App (可选)    │        │  纯 ADB 模式         │      │
│  │  - 屏幕实时采集      │        │  - 基础设备管理      │      │
│  │  - 硬件信息上报      │        │  - APK 安装/卸载     │      │
│  │  - 指令接收执行      │        │  - Shell 命令        │      │
│  │  - 心跳保活          │        │  - 截图/日志         │      │
│  └──────────────────────┘        └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术选型

### 后端 (Server)

| 技术 | 选型 | 理由 |
|------|------|------|
| 语言 | Go 1.21+ | 高性能、并发友好、单二进制部署 |
| Web 框架 | Gin | 轻量、高性能、中间件丰富 |
| 数据库 | SQLite (可换 PostgreSQL) | 轻量、零配置、适合中小规模 |
| ORM | GORM | 功能完善、迁移方便 |
| WebSocket | gorilla/websocket | 成熟稳定、社区活跃 |
| 认证 | JWT (golang-jwt/jwt) | 无状态、跨域友好 |
| ADB 通信 | 命令行调用 | 无需额外依赖、兼容性好 |

### 前端 (Web)

| 技术 | 选型 | 理由 |
|------|------|------|
| 框架 | Vue 3 | Composition API、响应式、生态成熟 |
| 构建工具 | Vite | 快速冷启动、HMR、现代化 |
| 状态管理 | Pinia | 轻量、TypeScript 友好 |
| 路由 | Vue Router 4 | 官方路由、功能完善 |
| UI 组件库 | Element Plus | 组件丰富、文档完善、中文友好 |
| HTTP 客户端 | Axios | 拦截器、取消请求、易用 |
| 终端模拟器 | xterm.js | 功能完整、性能优秀 |

### Android Agent

| 技术 | 选型 | 理由 |
|------|------|------|
| 语言 | Kotlin | 现代化、协程支持、官方推荐 |
| 最低 SDK | API 21 (Android 5.0) | 覆盖 95%+ 设备 |
| 屏幕采集 | MediaProjection API | 系统级 API、高性能 |
| 网络通信 | OkHttp WebSocket | 稳定、自动重连 |
| 异步处理 | Kotlin Coroutines | 简洁、高效 |

---

## 核心技术架构

### 1. 认证授权架构

```
┌─────────────┐
│  用户登录   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  JWT Token 签发                     │
│  - Payload: userID, role, exp       │
│  - 有效期: 24h                      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  请求携带 Token                     │
│  Authorization: Bearer <token>      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  中间件验证                         │
│  - 解析 Token                       │
│  - 检查过期                         │
│  - 提取用户信息                     │
│  - 权限检查 (admin/operator/viewer) │
└─────────────────────────────────────┘

对外 API Key 流程：
┌─────────────┐
│ 创建 API Key│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  生成 UUID                          │
│  设置权限范围、过期时间             │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  第三方请求携带                     │
│  X-API-Key: <uuid>                  │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  中间件验证                         │
│  - 查询数据库                       │
│  - 检查是否撤销                     │
│  - 检查过期时间                     │
│  - 更新最后使用时间                 │
└─────────────────────────────────────┘
```

---

### 2. WebSocket 实时通信架构

```
┌──────────────────────────────────────────────────────────┐
│                      WebSocket Hub                        │
│                                                           │
│  clients: map[deviceId]map[*Conn]bool                    │
│  broadcast: chan Message                                 │
│  register: chan Client                                   │
│  unregister: chan Client                                 │
│                                                           │
│  Run() {                                                 │
│    for {                                                 │
│      select {                                            │
│        case client := <-register:                        │
│          // 注册新连接                                   │
│        case client := <-unregister:                      │
│          // 移除连接                                     │
│        case msg := <-broadcast:                          │
│          // 广播消息到所有订阅该设备的客户端             │
│      }                                                   │
│    }                                                     │
│  }                                                       │
└──────────────────────────────────────────────────────────┘

应用场景：
1. 屏幕流：Agent/ADB → Hub → Web 多客户端
2. Shell：Web ↔ Hub ↔ PTY ↔ ADB Shell
3. Logcat：ADB Logcat → Hub → Web 多客户端
4. Agent 上行：Agent → Hub → Server 处理
```

---

### 3. ADB 设备管理架构

```
┌─────────────────────────────────────────────────────────┐
│                    ADB Client 封装                       │
│                                                          │
│  Exec(args ...string) (output, error)                   │
│    └─ exec.Command("adb", args...)                      │
│    └─ 超时控制 (context.WithTimeout)                    │
│                                                          │
│  ExecOnDevice(serial, args...)                          │
│    └─ Exec("-s", serial, args...)                       │
│                                                          │
│  Shell(serial, command...)                              │
│    └─ ExecOnDevice(serial, "shell", command...)         │
└─────────────────────────────────────────────────────────┘

设备发现流程：
1. adb devices → 解析输出 → 获取 serial 列表
2. 遍历 serial，执行 getprop 获取设备信息
3. 存入数据库，标记 status = online
4. 定时任务检测设备状态，更新 last_seen_at

APK 安装流程：
1. 用户上传 APK → 保存到 uploads/
2. 创建 InstallTask → 提交到任务队列
3. Worker 从队列取任务
4. adb -s <serial> install -r <apk_path>
5. 更新任务状态 (success/failed)
6. 可选：Webhook 回调通知第三方
```

---

### 4. 任务队列架构

```
┌─────────────────────────────────────────────────────────┐
│                    Task Queue                            │
│                                                          │
│  tasks: chan *InstallTask (缓冲 100)                    │
│  workers: 5 个并发 goroutine                            │
│                                                          │
│  Submit(task) → tasks channel                           │
│                                                          │
│  worker() {                                             │
│    for task := range tasks {                            │
│      1. 更新状态为 running                              │
│      2. 执行 ADB 命令                                   │
│      3. 更新状态为 success/failed                       │
│      4. 记录输出日志                                    │
│      5. 触发 Webhook (可选)                             │
│    }                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘

优势：
- 异步执行，不阻塞 API 响应
- 并发控制，避免资源耗尽
- 失败重试机制（可扩展）
- 任务优先级（可扩展）
```

---

### 5. 屏幕同步技术方案

#### 方案 A：纯 ADB 模式（无 Agent）

```
┌─────────┐
│  Web    │
└────┬────┘
     │ WebSocket
┌────▼────────────────────────────────┐
│  Server                             │
│  定时执行：                         │
│  adb -s <serial> exec-out screencap │
│  ↓                                  │
│  获取 PNG 二进制                    │
│  ↓                                  │
│  转 JPEG 压缩                       │
│  ↓                                  │
│  WebSocket 推送                     │
└─────────────────────────────────────┘

特点：
- 无需安装 Agent
- 帧率低 (1-3 fps)
- CPU 占用高
- 适合偶尔查看
```

#### 方案 B：Agent 模式（推荐）

```
┌─────────────┐
│ Android     │
│ Agent       │
│             │
│ MediaProjection.createVirtualDisplay()
│   ↓                                    │
│ ImageReader 获取帧                     │
│   ↓                                    │
│ Bitmap → JPEG 压缩 (质量 60)           │
│   ↓                                    │
│ Base64 编码                            │
│   ↓                                    │
│ WebSocket 推送到 Server                │
└────┬────────────────────────────────────┘
     │ WSS
┌────▼────────────────────────────────┐
│  Server Hub                         │
│  接收 Agent 帧 → 转发到 Web 客户端  │
└────┬────────────────────────────────┘
     │ WebSocket
┌────▼────┐
│  Web    │
│  Canvas │
│  渲染   │
└─────────┘

特点：
- 流畅 (10-30 fps 可配置)
- 低延迟 (<200ms)
- Server 仅中转，CPU 占用低
- 需用户授权屏幕录制权限一次
```

---

### 6. Shell 终端技术方案

```
┌─────────────┐
│  Web        │
│  xterm.js   │
└──────┬──────┘
       │ WebSocket (双向)
       │
┌──────▼──────────────────────────────┐
│  Server                             │
│                                     │
│  创建 PTY (伪终端)                  │
│    ↓                                │
│  启动进程: adb -s <serial> shell    │
│    ↓                                │
│  goroutine 1: PTY 读 → WS 发送      │
│  goroutine 2: WS 接收 → PTY 写      │
│                                     │
└──────┬──────────────────────────────┘
       │ ADB Protocol
┌──────▼──────┐
│  Android    │
│  Shell      │
└─────────────┘

关键点：
- PTY 提供终端特性（光标、颜色、控制字符）
- 双向实时通信
- 支持 Ctrl+C 等控制键
- Session 隔离，多用户互不干扰
```

---

### 7. 数据库设计

```sql
-- 用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer',
    created_at DATETIME,
    last_login_at DATETIME
);

-- 设备表
CREATE TABLE devices (
    id INTEGER PRIMARY KEY,
    serial VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100),
    model VARCHAR(100),
    brand VARCHAR(50),
    os_version VARCHAR(50),
    sdk_version INTEGER,
    cpu_info TEXT,
    total_memory BIGINT,
    total_storage BIGINT,
    resolution VARCHAR(50),
    ip_address VARCHAR(50),
    status VARCHAR(20) DEFAULT 'offline',
    agent_connected BOOLEAN DEFAULT FALSE,
    agent_version VARCHAR(20),
    last_seen_at DATETIME,
    created_at DATETIME
);

-- APK 表
CREATE TABLE apps (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100),
    package_name VARCHAR(200),
    version_name VARCHAR(50),
    version_code INTEGER,
    file_path VARCHAR(500),
    file_size BIGINT,
    md5 VARCHAR(32),
    uploaded_by INTEGER,
    created_at DATETIME,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- API Key 表
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name VARCHAR(100),
    key VARCHAR(64) UNIQUE NOT NULL,
    permissions TEXT,
    expires_at DATETIME,
    last_used_at DATETIME,
    revoked BOOLEAN DEFAULT FALSE,
    created_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 安装任务表
CREATE TABLE install_tasks (
    id INTEGER PRIMARY KEY,
    app_id INTEGER,
    device_id INTEGER,
    action VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    output TEXT,
    created_by INTEGER,
    created_at DATETIME,
    finished_at DATETIME,
    FOREIGN KEY (app_id) REFERENCES apps(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 审计日志表
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    device_id INTEGER,
    action VARCHAR(100),
    command TEXT,
    ip_address VARCHAR(50),
    result TEXT,
    created_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- 索引
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_serial ON devices(serial);
CREATE INDEX idx_tasks_status ON install_tasks(status);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

---

### 8. 安全架构

```
┌─────────────────────────────────────────────────────────┐
│                    安全防护层                            │
│                                                          │
│  1. 传输加密                                            │
│     - HTTPS (TLS 1.2+)                                  │
│     - WSS (WebSocket over TLS)                          │
│                                                          │
│  2. 认证鉴权                                            │
│     - JWT Token (HS256)                                 │
│     - API Key (UUID v4)                                 │
│     - 角色权限控制 (RBAC)                               │
│                                                          │
│  3. 输入验证                                            │
│     - Shell 命令黑名单过滤                              │
│     - APK 文件类型校验                                  │
│     - 参数长度限制                                      │
│                                                          │
│  4. 审计日志                                            │
│     - 所有 Shell 命令记录                               │
│     - 敏感操作记录（安装/卸载/重启）                    │
│     - 登录日志                                          │
│                                                          │
│  5. 限流防护                                            │
│     - API 限流 (rate limiting)                          │
│     - WebSocket 连接数限制                              │
│     - 文件上传大小限制                                  │
└─────────────────────────────────────────────────────────┘

危险命令黑名单：
- rm -rf /system
- rm -rf /
- dd if=/dev/zero of=/dev/sda
- mkfs.*
- > /dev/sda
- format
```

---

### 9. 部署架构

#### 单机部署

```
┌─────────────────────────────────────┐
│         物理机 / 虚拟机              │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  app-manager (单二进制)       │ │
│  │  - HTTP Server :8080          │ │
│  │  - WebSocket Hub              │ │
│  │  - Task Queue                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  SQLite                       │ │
│  │  ./data/app-manager.db        │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  文件存储                     │ │
│  │  ./uploads/*.apk              │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  ADB                          │ │
│  │  /usr/bin/adb                 │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
       │
       │ USB / TCP
       ▼
┌─────────────────┐
│  Android 设备   │
└─────────────────┘
```

#### Docker 部署

```
┌─────────────────────────────────────┐
│         Docker Host                 │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  app-manager 容器             │ │
│  │  - 端口映射: 8080:8080        │ │
│  │  - 挂载: ./data:/app/data     │ │
│  │  - 挂载: ./uploads:/app/uploads│ │
│  │  - 挂载: /dev/bus/usb (USB)   │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘

docker run -d \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  -v /dev/bus/usb:/dev/bus/usb \
  --privileged \
  app-manager:latest
```

---

### 10. 性能优化策略

```
1. 数据库优化
   - 索引优化（status, serial, created_at）
   - 连接池配置
   - 定期清理过期数据

2. WebSocket 优化
   - 消息批量发送
   - 二进制传输（屏幕帧）
   - 心跳保活

3. 屏幕流优化
   - 降低分辨率（原始 / 2）
   - JPEG 质量可配置（60-80）
   - 帧率动态调整（网络自适应）

4. 任务队列优化
   - Worker 数量可配置
   - 任务优先级
   - 失败重试机制

5. 缓存策略
   - 设备信息缓存（减少 ADB 调用）
   - 静态资源 CDN
   - API 响应缓存（短期）
```

---

## 技术难点与解决方案

| 难点 | 解决方案 |
|------|---------|
| ADB 命令超时 | context.WithTimeout 控制，超时自动取消 |
| WebSocket 断线重连 | 客户端指数退避重连，Server 端心跳检测 |
| 屏幕流延迟 | Agent 本地压缩，Server 仅中转，降低分辨率 |
| 多用户并发 Shell | 每个连接独立 PTY Session，goroutine 隔离 |
| APK 大文件上传 | 分片上传，进度回调，断点续传（可扩展）|
| 设备离线检测 | 定时任务 adb devices，更新 last_seen_at |
| Agent 保活 | 前台 Service + 心跳，厂商白名单引导 |
| 权限控制 | 中间件 + 角色检查，审计日志记录 |

---

## 扩展性设计

```
1. 水平扩展
   - Server 无状态设计，可多实例部署
   - WebSocket 通过 Redis Pub/Sub 跨实例通信
   - 数据库切换为 PostgreSQL + 主从复制

2. 功能扩展
   - 插件系统（自定义 ADB 命令）
   - Webhook 通知（任务完成、设备上下线）
   - 定时任务（自动更新 APK）
   - 设备分组管理
   - 批量操作（多设备同时安装）

3. 监控告警
   - Prometheus 指标采集
   - Grafana 可视化
   - 设备离线告警
   - 任务失败告警
```

---

## 开发路线图

```
Phase 1: MVP (2-3 周)
├── Server 核心框架 + 认证
├── ADB 设备管理 + APK 安装
├── Web 基础页面（设备列表、APK 管理）
└── 纯 ADB 模式屏幕截图

Phase 2: 实时功能 (2 周)
├── WebSocket Hub 架构
├── Shell 终端 (PTY + xterm.js)
├── Logcat 实时流
└── Web 对应页面

Phase 3: Agent 开发 (2 周)
├── Android Agent 基础框架
├── 屏幕实时采集推流
├── 心跳 + 重连机制
└── 设备信息持续上报

Phase 4: 完善功能 (1-2 周)
├── 对外开放 API + API Key
├── 审计日志
├── ADB 快捷操作面板
└── 文件管理器

Phase 5: 部署优化 (1 周)
├── Docker 镜像
├── 配置文档
├── 性能优化
└── 安全加固
```
