# App Manager

面向团队与运维的 **Android 设备集中管理**：Web 控制台 + 设备 Agent，一条命令即可在本地跑起来（**SQLite**，无需单独装数据库）。

---

## 你能用它做什么

| 能力 | 说明 |
|------|------|
| **设备与分组** | 登记设备、扫描连接、查看信息与已装应用 |
| **远程操控** | 屏幕实时查看、触控、截图、ADB 常用操作 |
| **终端与日志** | Web Shell、Logcat 流式查看 |
| **应用分发** | APK 上传、安装/卸载任务、进度追踪 |
| **录屏与分享** | 服务端录屏合成 MP4（需 ffmpeg）、屏幕分享链接 |
| **开放 API** | API Key + 权限范围，便于接入 CI / 内部系统 |
| **审计** | 操作审计日志（管理员可见） |

适合需要 **统一管理多台调试机、测试机或展厅设备** 的小团队；开源可自托管，数据留在自己机器上。

---

## 界面预览

**设备详情** — Agent 在线状态、硬件/网络信息、快捷操作（远程屏幕、Shell、截图、测速等）。

![设备详情](docs/screenshots/device-detail.png)

**屏幕查看** — 实时画面传输、端到端延迟、分享链接与 Agent 投屏状态。

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

设备端需安装配套 Agent 并与服务器连通（具体配置见 Agent 内服务器地址设置）。仓库内提供编译与同步脚本，例如：

```bash
./scripts/sync-agent-apk.sh
```

（需本机 Android SDK / Gradle 环境；环境变量可参考 `scripts/sync-agent-apk.env.example`。）

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
server/          Go 服务（API、WebSocket、任务队列）
web/             Vue 3 控制台
agent/           Android Agent 工程
scripts/         辅助脚本（如 APK 同步）
docs/            文档与界面截图（README 引用）
```

---

## 许可证与贡献

欢迎 Issue / PR：优化文档、修复问题、分享使用场景，都能帮助更多人用好这套工具。

若在生产环境部署，请务必将默认密码、`jwt.secret` 与数据库连接信息替换为安全值。
