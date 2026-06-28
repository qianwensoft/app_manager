# Low-Code Platform

基于 Puck + Formily + Workflow Engine + Yjs 的低代码平台。

## 项目结构

```
low-code-platform/
├── packages/
│   ├── schema/          # TypeScript 类型定义
│   ├── editor/          # Puck 可视化编辑器
│   ├── runtime/         # 页面运行时渲染引擎
│   └── workflow-engine/ # 工作流引擎（git submodule）
├── server/
│   └── lowcode/         # Go 后端 API
└── README.md
```

## 快速开始

### 前端开发

```bash
cd low-code-platform

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

### 后端集成

```go
// server/api/router.go
import "app-manager/lowcode"

func SetupRoutes(r *gin.Engine) {
    api := r.Group("/api")
    
    // 低代码平台路由
    lowcode.RegisterRoutes(api)
}
```

```go
// server/main.go
import "app-manager/migrations"

func main() {
    // 自动迁移会包含低代码平台表
    migrations.RunAll(database.DB)
}
```

## 核心功能

### 1. AI 生成页面

```bash
POST /api/lowcode/pages/ai-generate
{
  "prompt": "创建设备巡检表单，支持扫码录入",
  "data_source_id": 1,
  "mode": "full"
}
```

### 2. 自动生成（从数据表）

```bash
POST /api/lowcode/pages/generate-from-table
{
  "data_source_id": 1,
  "table": "devices",
  "primary_key": "id",
  "options": {
    "generate_list": true,
    "generate_detail": true,
    "generate_form": true,
    "auto_workflow": true
  }
}
```

### 3. 页面管理

```bash
GET    /api/lowcode/pages
POST   /api/lowcode/pages
GET    /api/lowcode/pages/:id
PUT    /api/lowcode/pages/:id
DELETE /api/lowcode/pages/:id
POST   /api/lowcode/pages/:id/publish
```

### 4. 工作流管理

```bash
GET    /api/lowcode/workflows
POST   /api/lowcode/workflows
PUT    /api/lowcode/workflows/:id
DELETE /api/lowcode/workflows/:id
```

## 集成现有平台

### 事件系统

低代码平台复用现有的事件系统：
- `DeviceEvent` - 设备事件（扫码/NFC）
- `CustomEventDefinition` - 自定义事件
- `FormAppEventRoute` - 事件路由

### 数据栈（DataStack）

集成现有的 DataStack：
- `DataSource` - 数据源
- `Dataset` - 数据集
- `DataInterface` - 数据接口

### 外部应用（Outbound）

集成现有的 Outbound 连接器：
- `OutboundConnector` - HTTP/WebSocket/MQTT 推送
- `OutboundApp` - 外部应用定义

## 开发计划

详见根目录的 `LOW_CODE_PLATFORM_REFACTOR_PLAN.md`

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **编辑器**: Puck + Formily + React Flow
- **协同**: Yjs + y-websocket
- **后端**: Go + Gin + GORM
- **AI**: Claude API (Anthropic)
