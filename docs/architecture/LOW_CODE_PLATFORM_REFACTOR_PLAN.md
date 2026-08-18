# 低代码平台重构计划

## 项目概述

**目标**：基于 Puck + Formily + Workflow Engine + Yjs 构建新一代低代码平台，支持实时协同编辑和事件驱动的工作流能力。

**策略**：新建独立模块 `low-code-platform/`，不影响现有 form-app 和 scada-editor。

---

## 技术架构

### 核心技术栈

#### 1. **Puck** - 可视化页面编辑器
- **用途**：替代 Formily Designable，作为页面布局和组件编排的核心
- **优势**：
  - 更灵活的组件拖拽和布局
  - 更好的自定义组件支持
  - 更直观的用户体验
- **集成点**：与 Formily Schema 互补，Puck 负责布局，Formily 负责表单逻辑
- **参考现有能力**：form-app 的可视化配置面板，保留拖拽式组件编排体验

#### 2. **Formily Schema** - 表单定义和验证
- **用途**：保留现有的表单定义能力
- **集成策略**：
  - Formily 组件作为 Puck 的自定义组件注册
  - Schema 保存在 Puck 的组件 props 中
  - 运行时由 Formily Renderer 渲染表单逻辑

#### 3. **Workflow Engine** - 事件和流程编排
- **用途**：统一事件系统，替代现有的零散事件处理
- **功能**：
  - 页面生命周期事件（mounted, unmounted, beforeSubmit 等）
  - 用户交互事件（onClick, onChange, onScan 等）
  - 数据事件（onDataLoaded, onDataChanged 等）
  - 外部事件（webhook, mqtt, agent push 等）
- **集成方式**：
  - 将 `/Volumes/data/workspace/qianwen/workflow-engine` 作为 monorepo 子包引入
  - 复用其 `@workflow/frontend-engine` 和 `@workflow/editor`
  - 扩展节点类型以适配表单场景

#### 4. **Yjs** - 实时协同编辑
- **用途**：支持多人同时编辑页面和工作流
- **场景**：
  - 编辑器协同：多人同时编辑同一页面
  - Runtime 协同：多设备实时同步表单数据
- **实现**：
  - 编辑器协同：Yjs + y-websocket + Puck state binding
  - Runtime 协同：Yjs + STOMP 集成（复用现有 WebSocket）

---

## Form-App 已有能力继承

### 1. 可视化界面配置（已实现）

**现有能力**：
- FormAppPage 多页面管理（form/list/detail/custom）
- FormAppPageLink 页面间跳转配置
- FormAppEventRoute 事件路由系统
- FormAppAccessPolicy 访问权限控制

**集成策略**：
- ✅ **保留数据模型**：LowCodePage 复用 FormAppPage 的多页面结构
- ✅ **保留事件路由**：FormAppEventRoute 集成到 Workflow Engine
- ✅ **保留访问控制**：FormAppAccessPolicy 迁移到 LowCodePage

### 2. 自动化创建（已实现）

**现有实现**：`GenerateFormAppPagesFromTable()` - `/api/form-app/infos/:id/generate-pages-from-table`

**功能**：
```go
// 基于数据源表自动生成：
// 1. list 页面（SELECT * FROM table LIMIT/OFFSET）
// 2. detail 页面（SELECT * WHERE id = {{id}}）
// 3. submit 表单（INSERT INTO table）
// 4. 自动创建 Dataset 和 DataInterface
// 5. 自动生成 Formily Schema
```

**集成方案**：
```typescript
// 新平台保留并增强此功能
POST /api/lowcode/pages/generate-from-table
{
  "data_source_id": 1,
  "table": "users",
  "primary_key": "id",
  "mode": "create_schema",  // 自动建表或选择现有表
  "options": {
    "generate_list": true,
    "generate_detail": true,
    "generate_form": true,
    "auto_workflow": true   // 新增：自动生成 CRUD 工作流
  }
}
```

### 3. AI 自动创建页面（Claude API 集成）

**现有实现**：`server/mcp/claude.go`

**功能**：
- `callClaude()` - 文本对话
- `callClaudeVision()` - 图像识别
- `extractJSON()` - 从 Claude 响应提取 JSON

**集成方案**：
```go
// 扩展 AI 生成能力
type AIGenerateRequest struct {
    Prompt       string `json:"prompt"`        // "创建设备巡检表单，支持扫码录入"
    DataSourceID uint   `json:"data_source_id"`
    Mode         string `json:"mode"`          // quick | full
    Screenshot   string `json:"screenshot"`     // 新增：上传截图让 Claude 识别
}

// AI 生成流程
func GeneratePageWithAI(req AIGenerateRequest) (*LowCodePage, error) {
    // 1. 构建 Prompt（包含数据源信息、现有表结构）
    prompt := buildAIPrompt(req)
    
    // 2. 调用 Claude API
    response, _, err := callClaude(systemPrompt, prompt)
    
    // 3. 解析 Claude 返回的 JSON
    // {
    //   "puck_state": {...},           // Puck 页面布局
    //   "formily_schemas": {...},      // 表单字段定义
    //   "workflow_def": {...},         // 事件工作流
    //   "data_interfaces": [...]       // 数据接口
    // }
    
    // 4. 创建 LowCodePage + 关联资源
    return createPageFromAI(response)
}
```

**AI Prompt 模板**：
```
你是一个低代码平台设计专家。根据用户需求生成完整的页面配置。

用户需求：{user_prompt}
数据源类型：{data_source_type}
现有表：{existing_tables}

请生成以下 JSON 配置：
1. puck_state: Puck 编辑器状态（页面布局、组件配置）
2. formily_schemas: 表单字段定义（包含验证规则、联动逻辑）
3. workflow_def: 事件工作流（生命周期、用户交互、数据事件）
4. data_interfaces: 数据接口定义（查询、提交、更新）
5. event_routes: 事件路由配置（扫码跳转、按钮点击）

输出纯 JSON，不要包含 markdown 代码块。
```

---

## 现有平台接口集成

### 1. 事件机制打通

#### 现有事件系统
- **CustomEventDefinition** - 自定义事件定义
- **DeviceEvent** - 设备事件（扫码、NFC、传感器）
- **FormAppEventRoute** - 表单事件路由
- **event/workflow_integration.go** - 已实现的工作流集成桥接

#### 集成方案

**扩展事件类型**：
```go
// 新增事件类型
type LowCodeEvent struct {
    ID              uint
    PageID          uint       // 关联低代码页面
    EventType       string     // lifecycle | user_interaction | data_event | external
    TriggerType     string     // mounted | clicked | changed | scanned | mqtt | webhook
    WorkflowID      *uint      // 绑定工作流
    WorkflowEnabled bool
    Priority        int
    Enabled         bool
}
```

**事件触发流程**：
```
设备扫码 → DeviceEvent 
    ↓
FormAppEventRoute 匹配
    ↓
HandleFormEventWithWorkflow() ← 现有桥接函数
    ↓
Workflow Engine 执行
    ↓
├─ 数据接口调用（DataInterface）
├─ 外部应用推送（OutboundConnector）
└─ 页面跳转/UI 更新
```

**代码示例**：
```go
// 低代码页面事件处理器
func HandleLowCodePageEvent(pageID uint, eventType string, eventData map[string]interface{}) {
    var event LowCodeEvent
    database.DB.Where("page_id = ? AND event_type = ? AND enabled = ?", 
        pageID, eventType, true).First(&event)
    
    if event.WorkflowID != nil && event.WorkflowEnabled {
        // 触发工作流
        workflow.ExecuteWorkflow(*event.WorkflowID, eventData)
    }
}
```

### 2. 外部应用接口打通

#### 现有 Outbound 系统
- **OutboundConnector** - 外部连接器（HTTP、WebSocket、MQTT）
- **OutboundApp** - 外部应用定义
- **OutboundEndpoint** - 应用端点
- **触发类型**：device_event, stomp, websocket, http_poll, data_poll, cron, channel

#### 集成方案

**Workflow 节点扩展**：
```typescript
// 新增工作流节点类型
{
  type: 'outbound_connector',
  config: {
    connector_id: 123,
    event_type: 'form.submitted',
    data_mapping: {
      // 将表单数据映射到外部系统字段
      'external.user_id': '$.form.values.user_id',
      'external.timestamp': '$.event.created_at'
    }
  }
}
```

**双向集成**：
```
低代码页面 ──提交数据──→ Workflow Engine
    ↓                         ↓
FormAppEventRoute      OutboundConnector
    ↓                         ↓
触发工作流               HTTP/WebSocket 推送
    ↓                         ↓
├─ 调用数据接口         外部系统 API
├─ 推送到外部应用       (ERP/CRM/SCADA)
└─ 发送 MQTT 消息
```

**代码示例**：
```go
// 工作流节点：调用 Outbound Connector
type OutboundConnectorNode struct {
    ConnectorID uint                   `json:"connector_id"`
    EventType   string                 `json:"event_type"`
    DataMapping map[string]string      `json:"data_mapping"`
}

func (n *OutboundConnectorNode) Execute(ctx WorkflowContext) error {
    var connector models.OutboundConnector
    database.DB.First(&connector, n.ConnectorID)
    
    // 构建事件数据
    eventData := applyDataMapping(ctx.Input, n.DataMapping)
    
    // 触发 Outbound 推送
    outbound.RunConnectorOutbound(connector, eventData, ctx.Device, nil)
    return nil
}
```

### 3. 连接器接口（DataStack）打通

#### 现有 DataStack 系统
- **DataSource** - 数据源（MySQL/PostgreSQL/SQLite/HTTP）
- **Dataset** - 数据集（query/buffer/transaction/static）
- **DataInterface** - 数据接口（参数化查询、CRUD）
- **Buffer 机制**：http_webhook, http_poll（用于外部数据入站）

#### 集成方案

**Workflow 与 DataInterface 集成**：
```typescript
// 工作流节点：数据接口调用
{
  type: 'data_interface',
  config: {
    interface_code: 'get_device_list',
    params: {
      // 从工作流上下文提取参数
      'page': '$.pagination.page',
      'page_size': '$.pagination.page_size',
      'device_type': '$.filter.device_type'
    },
    output_mapping: {
      // 将查询结果映射到工作流变量
      'devices': '$.result.data',
      'total': '$.result.total'
    }
  }
}
```

**Buffer 数据流集成**：
```
外部系统 Webhook ──→ DataStack Buffer
    ↓                    (http_webhook)
自动入站写入              ↓
    ↓               触发 data_poll
    ↓                    ↓
Buffer 表           Workflow Engine
    ↓                    ↓
DataInterface       数据处理节点
    ↓                    ↓
低代码页面展示       推送到 OutboundConnector
```

**代码示例**：
```go
// 工作流节点：DataInterface 调用
type DataInterfaceNode struct {
    InterfaceCode string                 `json:"interface_code"`
    Params        map[string]interface{} `json:"params"`
}

func (n *DataInterfaceNode) Execute(ctx WorkflowContext) (interface{}, error) {
    // 解析参数（支持 JSONPath 表达式）
    params := resolveParams(n.Params, ctx.Variables)
    
    // 调用 DataInterface
    result, err := datastack.InvokeDataInterfaceByCode(n.InterfaceCode, params)
    if err != nil {
        return nil, err
    }
    
    return result, nil
}
```

**DataInterface 默认参数应用**：
```go
// 复用现有逻辑：applyDataInterfaceParamDefaults
// 合并顺序：数据结构默认值 → 接口默认值 → 请求参数
func ExecuteDataInterface(code string, requestParams map[string]interface{}) {
    iface := loadDataInterface(code)
    structure := loadDataStructure(iface.DataStructureID)
    
    // 1. 数据结构默认值
    params := structure.DefaultParamValues
    
    // 2. 接口默认值（优先级更高）
    mergeJSON(params, iface.ParamDefaultsJSON)
    
    // 3. 请求参数（最高优先级）
    mergeJSON(params, requestParams)
    
    // 执行查询
    return executeQuery(iface, params)
}
```

---

## 项目结构

```
app-manager/
├── low-code-platform/              # 新模块（独立）
│   ├── packages/                   # monorepo 结构
│   │   ├── editor/                 # 可视化编辑器
│   │   │   ├── src/
│   │   │   │   ├── puck-config/    # Puck 配置和自定义组件
│   │   │   │   ├── formily-bridge/ # Formily 集成桥接
│   │   │   │   ├── workflow-panel/ # 工作流编辑面板
│   │   │   │   ├── collab/         # Yjs 协同编辑
│   │   │   │   └── main.tsx
│   │   │   └── package.json
│   │   ├── runtime/                # 运行时引擎
│   │   │   ├── src/
│   │   │   │   ├── renderer/       # 页面渲染器
│   │   │   │   ├── workflow-executor/ # 工作流执行器
│   │   │   │   ├── collab-sync/    # 运行时协同
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   ├── schema/                 # 类型定义和 Schema
│   │   │   └── src/
│   │   │       ├── page-schema.ts  # 页面定义
│   │   │       ├── component-schema.ts # 组件定义
│   │   │       └── workflow-schema.ts  # 工作流定义
│   │   └── workflow-engine/        # 工作流引擎（软链接或 git submodule）
│   │       └── -> /path/to/workflow-engine
│   ├── server/                     # Go 后端扩展
│   │   ├── lowcode/                # 低代码相关 API
│   │   │   ├── models.go
│   │   │   ├── api.go
│   │   │   └── collab.go           # Yjs 协同后端
│   │   └── ...
│   ├── pnpm-workspace.yaml
│   ├── package.json
│   └── README.md
├── server/                         # 现有 Go 后端（需集成）
├── web/                            # 现有 Vue 前端（需集成入口）
├── form-app/                       # 现有表单应用（不变）
└── scada-editor/                   # 现有组态编辑器（不变）
```

---

## 数据模型设计

### 1. LowCodePage（低代码页面）

```go
type LowCodePage struct {
    ID              uint       `gorm:"primaryKey"`
    Code            string     `gorm:"uniqueIndex"` // 页面唯一标识
    Name            string
    Category        string     // form | dashboard | workflow | custom
    PuckState       string     `gorm:"type:longtext"` // Puck 编辑器状态（JSON）
    WorkflowDef     string     `gorm:"type:longtext"` // 工作流定义（JSON）
    DataSourceID    *uint      // 关联数据源（可选）
    PublishStatus   int        // 0=草稿 1=已发布
    Version         int64      // 版本号
    YjsDocState     []byte     `gorm:"type:blob"` // Yjs 文档状态快照
    CreatedBy       uint
    CreatedAt       time.Time
    UpdatedAt       time.Time
}
```

### 2. LowCodePageVersion（页面版本）

```go
type LowCodePageVersion struct {
    ID              uint
    PageID          uint       `gorm:"index"`
    Version         int64
    PuckState       string     `gorm:"type:longtext"`
    WorkflowDef     string     `gorm:"type:longtext"`
    ChangeLog       string     // 变更说明
    CreatedBy       uint
    CreatedAt       time.Time
}
```

### 3. LowCodeWorkflow（工作流定义）

```go
type LowCodeWorkflow struct {
    ID              uint
    Code            string     `gorm:"uniqueIndex"`
    Name            string
    Description     string
    WorkflowDef     string     `gorm:"type:longtext"` // Workflow Engine JSON
    TriggerType     string     // manual | event | schedule | webhook
    TriggerConfig   string     `gorm:"type:text"` // 触发配置
    Enabled         bool
    CreatedAt       time.Time
    UpdatedAt       time.Time
}
```

### 4. LowCodeCollabSession（协同会话）

```go
type LowCodeCollabSession struct {
    ID              uint
    PageID          uint       `gorm:"index"`
    UserID          uint
    SessionID       string     `gorm:"index"`
    YjsClientID     uint64     // Yjs 客户端 ID
    JoinedAt        time.Time
    LastSeenAt      time.Time
}
```

---

## 核心功能设计

## 完整架构集成图

```
┌─────────────────────────────────────────────────────────────────────┐
│                       低代码平台前端                                  │
├──────────────┬──────────────────────────────────────────────────────┤
│ Puck Editor  │ • 页面布局编辑                                        │
│              │ • Formily 组件配置                                    │
│              │ • Workflow 可视化编辑                                 │
│              │ • Yjs 实时协同                                        │
├──────────────┼──────────────────────────────────────────────────────┤
│ Runtime      │ • Puck + Formily 混合渲染                            │
│              │ • Workflow 执行引擎                                   │
│              │ • 表单数据协同（Yjs）                                 │
└──────────────┴──────────────────────────────────────────────────────┘
                                    ↕
┌─────────────────────────────────────────────────────────────────────┐
│                         后端 API 层                                  │
├──────────────┬──────────────────────────────────────────────────────┤
│ LowCode API  │ /api/lowcode/pages (CRUD)                            │
│              │ /api/lowcode/workflows (工作流管理)                  │
│              │ /api/lowcode/generate-from-table (自动生成)          │
│              │ /api/lowcode/ai-generate (AI 生成)                   │
│              │ /ws/lowcode/collab/:page_id (Yjs 协同)               │
└──────────────┴──────────────────────────────────────────────────────┘
                                    ↕
┌─────────────────────────────────────────────────────────────────────┐
│                      现有平台能力复用                                 │
├──────────────┬──────────────────────────────────────────────────────┤
│ 事件系统     │ • DeviceEvent (扫码/NFC/传感器)                       │
│              │ • CustomEventDefinition (自定义事件)                  │
│              │ • FormAppEventRoute → Workflow 桥接                  │
├──────────────┼──────────────────────────────────────────────────────┤
│ 数据栈       │ • DataSource (MySQL/PostgreSQL/HTTP)                 │
│ (DataStack)  │ • Dataset (query/buffer/transaction)                 │
│              │ • DataInterface (参数化查询)                          │
│              │ • Buffer 入站 (http_webhook/http_poll)               │
├──────────────┼──────────────────────────────────────────────────────┤
│ 外部应用     │ • OutboundConnector (HTTP/WebSocket/MQTT)            │
│ (Outbound)   │ • OutboundApp & Endpoint                             │
│              │ • 触发器：device_event/cron/stomp/data_poll          │
├──────────────┼──────────────────────────────────────────────────────┤
│ AI 能力      │ • Claude API 集成 (mcp/claude.go)                    │
│              │ • callClaude() / callClaudeVision()                  │
│              │ • JSON 提取和解析                                     │
└──────────────┴──────────────────────────────────────────────────────┘
```

## 数据流示例

### 示例 1: AI 生成页面 + 自动工作流

```
用户输入需求
    ↓
"创建设备巡检表单，支持扫码录入，提交后推送到 ERP"
    ↓
AI Generate API (/api/lowcode/ai-generate)
    ↓
┌──────────────────────────────────────┐
│ Claude API 处理                       │
│ 1. 分析需求                           │
│ 2. 生成 Puck 页面布局                 │
│ 3. 生成 Formily 表单 Schema           │
│ 4. 生成 Workflow 定义                 │
│ 5. 生成 DataInterface 配置            │
└──────────────────────────────────────┘
    ↓
创建 LowCodePage
    ├─ PuckState (页面布局)
    ├─ FormilySchemas (表单字段)
    ├─ WorkflowDef (事件工作流)
    │   ├─ 节点1: 扫码事件监听
    │   ├─ 节点2: 表单验证
    │   ├─ 节点3: DataInterface 提交
    │   └─ 节点4: OutboundConnector 推送 ERP
    └─ EventRoutes (扫码路由)
```

### 示例 2: 扫码触发工作流 + 外部推送

```
Agent 扫码 (barcode: "EQP-001")
    ↓
DeviceEvent 入库
    ↓
FormAppEventRoute 匹配 (prefix: "EQP-")
    ↓
HandleFormEventWithWorkflow()
    ↓
Workflow Engine 执行
    ↓
┌──────────────────────────────────────┐
│ 工作流节点执行序列                    │
│                                       │
│ 1. DataInterface 节点                │
│    查询设备信息 (code="EQP-001")      │
│    ↓                                  │
│ 2. Condition 节点                    │
│    if (设备状态 == "正常")            │
│    ↓                                  │
│ 3. FormRender 节点                   │
│    渲染巡检表单（预填充设备信息）      │
│    ↓                                  │
│ 4. UserInput 节点                    │
│    等待用户填写巡检结果               │
│    ↓                                  │
│ 5. DataInterface 节点                │
│    提交巡检记录到数据库               │
│    ↓                                  │
│ 6. OutboundConnector 节点            │
│    推送到外部 ERP 系统                │
│    ↓                                  │
│ 7. MQTT 节点                         │
│    发布设备状态到 SCADA 系统          │
└──────────────────────────────────────┘
```

### 示例 3: Buffer 入站 → 工作流 → 页面展示

```
外部系统 Webhook
    ↓
POST /api/open/v1/ingress/buffer/iot_sensor_data
    ↓
DataStack Buffer 写入
    ↓
data_poll 触发器轮询
    ↓
OutboundConnector (trigger_type: data_poll)
    ↓
Workflow Engine 执行
    ↓
┌──────────────────────────────────────┐
│ 数据处理工作流                        │
│                                       │
│ 1. DataInterface 查询 Buffer         │
│    获取最新传感器数据                 │
│    ↓                                  │
│ 2. Code 节点（JavaScript）           │
│    数据清洗和转换                     │
│    ↓                                  │
│ 3. Condition 节点                    │
│    if (温度 > 阈值)                   │
│    ↓                                  │
│ 4. OutboundConnector 节点            │
│    推送告警到监控系统                 │
│    ↓                                  │
│ 5. STOMP 节点                        │
│    实时推送到低代码页面               │
└──────────────────────────────────────┘
    ↓
前端 Runtime 接收 STOMP 消息
    ↓
页面自动刷新数据展示
```

---

## 迁移路径详细设计

### FormAppInfo → LowCodePage 数据迁移

```go
// 迁移工具：form-app → low-code-platform
func MigrateFormAppToLowCode(formAppID uint) (*models.LowCodePage, error) {
    var formApp models.FormAppInfo
    database.DB.Preload("Pages").First(&formApp, formAppID)
    
    // 1. 转换 Formily Designable 到 Puck State
    puckState := convertFormilyToPuck(formApp.DesignSchema)
    
    // 2. 提取 Formily Schema（保留表单逻辑）
    formilySchemas := extractFormilySchemas(formApp.Pages)
    
    // 3. 转换事件路由到 Workflow
    workflowDef := convertEventRoutesToWorkflow(formApp.ID)
    
    // 4. 创建新页面
    lowCodePage := models.LowCodePage{
        Code:        fmt.Sprintf("migrated_%s", formApp.Code),
        Name:        formApp.Name + " (迁移)",
        Category:    "form",
        PuckState:   marshalJSON(puckState),
        WorkflowDef: marshalJSON(workflowDef),
        DataSourceID: formApp.DataSourceID,
    }
    
    database.DB.Create(&lowCodePage)
    return &lowCodePage, nil
}

// Formily → Puck 转换示例
func convertFormilyToPuck(designSchema string) PuckState {
    var formily FormilySchema
    json.Unmarshal([]byte(designSchema), &formily)
    
    puckState := PuckState{
        Content: []PuckComponent{},
        Root:    PuckRoot{},
    }
    
    // 遍历 Formily 组件树
    for _, field := range formily.Schema.Properties {
        // 将 Formily Field 封装为 Puck Component
        puckComp := PuckComponent{
            Type: "FormilyField",
            Props: map[string]interface{}{
                "fieldSchema": field,
                "fieldKey":    field.Name,
            },
        }
        puckState.Content = append(puckState.Content, puckComp)
    }
    
    return puckState
}
```

### 分阶段迁移策略

**Phase 1: 双系统共存（1-2 周）**
- 低代码平台独立部署
- form-app 继续运行
- 用户可选择使用哪个系统

**Phase 2: 功能对等验证（2-3 周）**
- 核心功能迁移测试
- 性能对比测试
- 用户体验评估

**Phase 3: 灰度迁移（1-2 个月）**
- 10% 用户试用新平台
- 收集反馈并优化
- 逐步扩大到 50% → 100%

**Phase 4: 完全切换（1 周）**
- form-app 进入只读模式
- 所有新功能仅在新平台开发
- 提供自助迁移工具

---

### Phase 1: 基础架构搭建（3-4 天）

#### 1.1 项目初始化 ✅ **已完成 (2026-06-25)**
- [x] 创建 `low-code-platform/` 目录结构
- [x] 配置 pnpm workspace
- [x] 初始化 packages: editor, runtime, schema
- [x] 集成 workflow-engine（软链接方式）
- [x] **集成现有能力**：导入 DataStack、Outbound、Event 类型定义
- [x] 创建后端 Go 模块：`server/lowcode/`
- [x] 实现数据模型：LowCodePage, LowCodePageVersion, LowCodeWorkflow, LowCodeEvent, LowCodeCollabSession
- [x] 创建数据库迁移：`migrations/2026_06_25_lowcode_platform.go`
- [x] 集成到主路由：`server/api/router.go` 添加 `lowcode.RegisterRoutes()`
- [x] 导出 Claude API：`server/mcp/exports.go`
- [x] 安装前端依赖：pnpm install 成功
- [x] 构建 schema 包：`@lowcode/schema` 编译成功

**已完成的 API**：
- `GET/POST /api/lowcode/pages` - 页面列表和创建
- `GET/PUT/DELETE /api/lowcode/pages/:id` - 页面详情、更新、删除
- `POST /api/lowcode/pages/:id/publish` - 发布页面
- `POST /api/lowcode/pages/generate-from-table` - 从数据表自动生成页面
- `POST /api/lowcode/pages/ai-generate` - AI 生成页面
- `GET /api/lowcode/pages/:id/versions` - 版本历史
- `POST /api/lowcode/pages/:id/rollback/:version` - 版本回滚
- `GET/POST/PUT/DELETE /api/lowcode/workflows` - 工作流管理

**项目结构**：
```
low-code-platform/
├── packages/
│   ├── schema/              ✅ TypeScript 类型定义（已构建）
│   │   └── dist/            ✅ 编译产物
│   ├── editor/              ⏳ Puck 可视化编辑器（待实现）
│   ├── runtime/             ⏳ 页面运行时渲染引擎（待实现）
│   └── workflow-engine/     ✅ 工作流引擎（软链接）
├── server/
│   └── lowcode/             ✅ Go 后端 API（已实现）
│       ├── models.go        ✅ 数据模型
│       ├── api.go           ✅ CRUD API
│       └── generate.go      ✅ AI生成和自动生成
└── README.md                ✅ 项目文档
```

#### 1.2 Puck 编辑器基础 ⏳ **进行中**
- [ ] 创建 editor/src 目录结构
- [ ] 实现基础 Puck Config
- [ ] 实现基础组件：Container, Text, Button, Image
- [ ] 实现页面保存和加载
- [ ] **集成 FormAppPage 数据模型**：兼容现有多页面结构

#### 1.3 后端 API ✅ **已完成**
- [x] 创建数据模型和迁移（LowCodePage, LowCodeWorkflow）
- [x] 实现页面 CRUD API
- [x] 实现版本管理 API
- [x] **集成 Claude API**：`POST /api/lowcode/ai-generate`
- [x] **集成自动生成**：`POST /api/lowcode/generate-from-table`（复用 GenerateFormAppPagesFromTable 逻辑）

**交付物**：
- ✅ 完整的后端 API（已实现）
- ✅ 数据模型和迁移（已创建）
- ✅ AI 生成和自动生成 API（已实现）
- ⏳ 可运行的 Puck 编辑器（进行中）
- ⏳ 基础组件库（待实现）
- ⏳ 页面保存/加载功能（待实现）

---

### Phase 2: Formily 集成（3-4 天）

#### 2.1 Formily 组件桥接
- [ ] 将 Formily 组件注册为 Puck 自定义组件
- [ ] 实现 Formily Schema 编辑面板
- [ ] 支持常用表单组件：Input, Select, DatePicker, Upload 等

#### 2.2 表单数据绑定
- [ ] 实现表单字段与数据源绑定
- [ ] 实现表单验证规则配置
- [ ] 实现表单联动逻辑

#### 2.3 Runtime 表单渲染
- [ ] 实现 Puck + Formily 混合渲染器
- [ ] 实现表单数据提交和回显
- [ ] 实现表单验证和错误提示

**交付物**：
- Formily 表单组件库
- 表单配置面板
- 运行时表单渲染器

---

### Phase 3: Workflow Engine 集成（4-5 天）

#### 3.1 工作流引擎适配
- [ ] 引入 `@workflow/frontend-engine` 和 `@workflow/editor`
- [ ] 扩展节点类型：
  - **FormSubmit** - 表单提交节点
  - **DataInterface** - 调用 DataInterface（集成 datastack/iface_invoke.go）
  - **OutboundConnector** - 推送到外部应用（集成 outbound/dispatch.go）
  - **Validation** - 表单验证节点
  - **Navigation** - 页面跳转节点
  - **BufferWrite** - 写入 Buffer 表
  - **MQTTPublish** - 发布 MQTT 消息
- [ ] 实现工作流编辑器嵌入到 Puck 侧边栏
- [ ] **集成现有事件系统**：event/workflow_integration.go 桥接

#### 3.2 事件系统重构
- [ ] 定义统一的事件类型（生命周期、用户交互、数据事件）
- [ ] 实现事件监听和触发机制
- [ ] 将现有 form-app 事件映射到工作流节点
- [ ] **复用 FormAppEventRoute**：扫码/NFC/自定义事件路由
- [ ] **集成 DeviceEvent**：设备事件自动触发工作流
- [ ] **集成 CustomEventDefinition**：自定义事件绑定工作流

#### 3.3 工作流执行引擎
- [ ] 实现前端工作流执行器（基于 `WorkflowRunner`）
- [ ] 实现后端工作流调度（Go + workflow-engine 后端）
- [ ] 实现工作流执行日志和调试
- [ ] **集成 Outbound 触发器**：
  - device_event → Workflow
  - stomp → Workflow
  - data_poll → Workflow
  - cron → Workflow

#### 3.4 核心工作流节点实现

**DataInterface 节点**：
```typescript
// packages/workflow-engine/nodes/DataInterfaceNode.ts
export class DataInterfaceNode implements WorkflowNode {
  type = 'data_interface';
  
  async execute(context: WorkflowContext): Promise<any> {
    const { interface_code, params } = this.config;
    
    // 调用后端 DataInterface API
    const response = await fetch(`/api/data/interfaces/invoke/${interface_code}`, {
      method: 'POST',
      body: JSON.stringify({
        param_values: resolveParams(params, context.variables)
      })
    });
    
    return await response.json();
  }
}
```

**OutboundConnector 节点**：
```typescript
// packages/workflow-engine/nodes/OutboundConnectorNode.ts
export class OutboundConnectorNode implements WorkflowNode {
  type = 'outbound_connector';
  
  async execute(context: WorkflowContext): Promise<any> {
    const { connector_id, event_type, data_mapping } = this.config;
    
    // 构建事件数据
    const eventData = applyDataMapping(context.variables, data_mapping);
    
    // 触发 Outbound 推送
    const response = await fetch('/api/outbound/trigger', {
      method: 'POST',
      body: JSON.stringify({
        connector_id,
        event_type,
        event_data: eventData,
        device_id: context.deviceId
      })
    });
    
    return await response.json();
  }
}
```

**后端工作流触发器**：
```go
// server/lowcode/workflow_trigger.go
package lowcode

import (
    "app-manager/database"
    "app-manager/models"
    "app-manager/workflow"
)

// TriggerWorkflowFromDeviceEvent 从设备事件触发工作流
func TriggerWorkflowFromDeviceEvent(eventType string, eventData map[string]interface{}, deviceID uint) {
    // 查询绑定的工作流
    var bindings []models.LowCodeEvent
    database.DB.Where("trigger_type = ? AND enabled = ?", "device_event", true).Find(&bindings)
    
    for _, binding := range bindings {
        if binding.WorkflowID == nil {
            continue
        }
        
        // 触发工作流
        go workflow.ExecuteWorkflowAsync(*binding.WorkflowID, map[string]interface{}{
            "event_type": eventType,
            "event_data": eventData,
            "device_id":  deviceID,
        })
    }
}
```

**交付物**：
- 可视化工作流编辑器
- 扩展的工作流节点库（DataInterface、OutboundConnector、BufferWrite 等）
- 事件驱动的工作流执行引擎
- 与现有事件系统的完整集成
- 工作流调试工具

---

### Phase 4: Yjs 协同编辑（4-5 天）

#### 4.1 编辑器协同
- [ ] 安装 `yjs`, `y-websocket`, `y-protocols`
- [ ] 实现 Puck State 与 Yjs Doc 的双向绑定
- [ ] 实现 WebSocket 协同后端（Go + Yjs CRDT）
- [ ] 实现多用户光标和选中状态

#### 4.2 Runtime 协同
- [ ] 实现表单数据的 Yjs 同步
- [ ] 集成到现有 STOMP 推送系统
- [ ] 实现冲突解决策略

#### 4.3 离线和持久化
- [ ] 实现 Yjs 文档快照保存到数据库
- [ ] 实现离线编辑和上线同步
- [ ] 实现历史版本回溯

**交付物**：
- 实时协同编辑能力
- 多用户光标和状态显示
- 离线编辑支持

---

### Phase 5: 组件库和模板（3-4 天）

#### 5.1 扩展组件库
- [ ] 数据展示组件：Table, List, Card, Chart
- [ ] 高级表单组件：Transfer, TreeSelect, Cascader
- [ ] 布局组件：Grid, Flex, Tabs, Collapse
- [ ] 业务组件：
  - **DeviceSelector** - 设备选择器（集成 /api/devices）
  - **UserPicker** - 用户选择器（集成 /api/users）
  - **DataSourcePicker** - 数据源选择器（集成 DataStack）
  - **WorkflowTriggerButton** - 工作流触发按钮
  - **OutboundStatusMonitor** - 外部推送状态监控

#### 5.2 页面模板
- [ ] **表单录入模板**（基于 form-app 生成逻辑）
  - 自动从 DataSource 表生成
  - 支持 AI 增强（Claude API）
- [ ] **列表查询模板**
  - 自动生成分页、排序、筛选
  - 集成 DataInterface 查询
- [ ] **Dashboard 模板**
  - 数据可视化图表
  - 实时数据更新（STOMP）
- [ ] **工作流审批模板**
  - 人工审批节点
  - 流程状态追踪

#### 5.3 组件市场
- [ ] 组件注册和发布机制
- [ ] 组件预览和文档
- [ ] 组件导入和复用
- [ ] **集成 AI 组件生成**：用户描述需求 → Claude 生成组件代码

**AI 生成组件示例**：
```typescript
// POST /api/lowcode/ai-generate-component
{
  "prompt": "创建一个设备状态卡片组件，显示设备名称、在线状态、最后上报时间，支持点击查看详情",
  "screenshot": "base64_image" // 可选：上传参考截图
}

// 返回：
{
  "component_code": `
    export const DeviceStatusCard = ({ device }) => (
      <Card onClick={() => navigateTo(\`/device/\${device.id}\`)}>
        <h3>{device.name}</h3>
        <Badge status={device.online ? 'success' : 'error'}>
          {device.online ? '在线' : '离线'}
        </Badge>
        <Text type="secondary">
          {formatTime(device.last_report_at)}
        </Text>
      </Card>
    );
  `,
  "puck_config": {
    "type": "DeviceStatusCard",
    "label": "设备状态卡片",
    "fields": {
      "device_id": { type: "number", label: "设备 ID" }
    }
  }
}
```

**交付物**：
- 丰富的组件库（50+ 组件）
- 常用页面模板（10+ 模板）
- 组件市场原型
- AI 组件生成能力

---

### Phase 6: Agent 集成和移动端（3-4 天）

#### 6.1 Agent 下发
- [ ] 扩展 AgentMenuItem 支持低代码页面入口
- [ ] 实现页面权限控制
- [ ] 实现页面版本同步

#### 6.2 移动端适配
- [ ] 实现响应式布局支持
- [ ] 移动端组件库
- [ ] 移动端事件适配（扫码、拍照、定位等）

#### 6.3 离线能力
- [ ] 实现页面离线缓存
- [ ] 实现离线表单数据暂存
- [ ] 实现上线后数据同步

**交付物**：
- Agent 菜单集成
- 移动端页面渲染
- 离线能力支持

---

### Phase 7: 测试和优化（2-3 天）

#### 7.1 单元测试
- [ ] 编辑器核心功能测试
- [ ] 工作流执行器测试
- [ ] Yjs 协同测试

#### 7.2 集成测试
- [ ] 端到端页面创建和发布流程
- [ ] 协同编辑场景测试
- [ ] Agent 端运行测试

#### 7.3 性能优化
- [ ] 大页面渲染优化
- [ ] 协同编辑网络优化
- [ ] 工作流执行性能优化

**交付物**：
- 完整的测试覆盖
- 性能优化报告
- 文档和示例

---

## 技术难点和解决方案

### 难点 1: Puck + Formily 集成

**挑战**：
- Puck 的组件模型与 Formily Schema 不完全匹配
- Formily 的联动和验证逻辑如何在 Puck 中配置

**解决方案**：
```typescript
// 将 Formily Field 封装为 Puck Component
const FormilyFieldComponent = {
  fields: {
    fieldSchema: {
      type: 'custom',
      render: ({ value, onChange }) => (
        <FormilySchemaEditor value={value} onChange={onChange} />
      ),
    },
  },
  render: ({ fieldSchema }) => (
    <FormilyRenderer schema={fieldSchema} />
  ),
};
```

---

### 难点 2: Workflow Engine 事件绑定

**挑战**：
- 页面事件如何触发工作流
- 工作流结果如何反馈到页面

**解决方案**：
```typescript
// 事件绑定配置
{
  component: 'Button',
  props: {
    onClick: {
      type: 'workflow',
      workflowId: 'submit-form-workflow',
      inputMapping: {
        formData: '$.form.values',
      },
      outputHandlers: [
        { on: 'success', action: 'navigate', target: '/success' },
        { on: 'error', action: 'showMessage', message: '$.error.message' },
      ],
    },
  },
}
```

---

### 难点 3: Yjs 协同状态同步

**挑战**：
- Puck State 是嵌套对象，如何高效同步
- 冲突解决策略（Last Write Wins vs CRDT）

**解决方案**：
```typescript
// 使用 Y.Map 管理 Puck State
const yDoc = new Y.Doc();
const yPuckState = yDoc.getMap('puckState');

// 双向绑定
yPuckState.observe((event) => {
  const newState = yPuckState.toJSON();
  setPuckState(newState);
});

puckState.onChange((newState) => {
  yPuckState.set('content', newState.content);
  yPuckState.set('root', newState.root);
});
```

---

### 难点 4: Runtime 协同数据冲突

**挑战**：
- 多用户同时编辑同一表单字段
- 表单验证和业务规则如何处理冲突

**解决方案**：
- **编辑器协同**：CRDT（Yjs 自动处理）
- **Runtime 协同**：Last Write Wins + 版本号 + 冲突提示
```typescript
// 字段级锁定
{
  fieldLock: {
    enabled: true,
    strategy: 'first-edit-lock', // 谁先编辑谁锁定
    timeout: 30000, // 30 秒无操作自动释放
  },
}
```

---

## API 设计

### 页面管理 API

```
GET    /api/lowcode/pages                    # 页面列表
POST   /api/lowcode/pages                    # 创建页面
GET    /api/lowcode/pages/:id                # 页面详情
PUT    /api/lowcode/pages/:id                # 更新页面
DELETE /api/lowcode/pages/:id                # 删除页面
POST   /api/lowcode/pages/:id/publish        # 发布页面
GET    /api/lowcode/pages/:id/versions       # 版本列表
POST   /api/lowcode/pages/:id/rollback/:ver  # 回滚版本
```

### 协同编辑 API

```
WS     /ws/lowcode/collab/:page_id           # Yjs 协同 WebSocket
GET    /api/lowcode/collab/:page_id/users    # 当前在线用户
POST   /api/lowcode/collab/:page_id/snapshot # 保存快照
```

### 工作流 API

```
GET    /api/lowcode/workflows                # 工作流列表
POST   /api/lowcode/workflows                # 创建工作流
PUT    /api/lowcode/workflows/:id            # 更新工作流
POST   /api/lowcode/workflows/:id/execute    # 执行工作流
GET    /api/lowcode/workflows/:id/logs       # 执行日志
```

### Runtime API

```
GET    /api/lowcode/runtime/:code            # 获取页面配置
POST   /api/lowcode/runtime/:code/data       # 提交数据
GET    /api/lowcode/runtime/:code/data/:id   # 获取数据
```

---

## 迁移策略

### 现有 form-app 迁移路径

1. **Phase 1**: 新旧共存
   - 低代码平台作为新模块独立运行
   - form-app 继续维护，不做破坏性修改

2. **Phase 2**: 数据迁移工具
   - 开发 FormAppInfo → LowCodePage 转换工具
   - 自动迁移 Formily Schema 到 Puck + Formily 组件

3. **Phase 3**: 功能对等
   - 确保低代码平台功能覆盖 form-app 所有场景
   - 用户可选择使用新旧编辑器

4. **Phase 4**: 逐步弃用
   - 新功能仅在低代码平台实现
   - form-app 进入维护模式
   - 用户逐步迁移到新平台

---

## 风险评估

### 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| Puck 不满足复杂需求 | 中 | 高 | 早期原型验证，必要时 fork 或替换 |
| Yjs 性能问题 | 低 | 中 | 限制协同用户数，优化文档大小 |
| Workflow Engine 集成复杂度 | 中 | 中 | 简化初期节点类型，分阶段扩展 |
| 现有系统集成冲突 | 低 | 高 | 独立模块，最小化依赖 |

### 产品风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 学习曲线过高 | 中 | 中 | 提供模板和向导，录制教学视频 |
| 现有用户抵触 | 低 | 中 | 保留旧功能，提供迁移工具 |
| 功能不如预期 | 低 | 高 | 早期用户调研，MVP 验证 |

---

## 时间估算

| Phase | 功能 | 工期 | 依赖 |
|-------|------|------|------|
| Phase 1 | 基础架构搭建 | 3-4 天 | - |
| Phase 2 | Formily 集成 | 3-4 天 | Phase 1 |
| Phase 3 | Workflow Engine 集成 | 4-5 天 | Phase 1 |
| Phase 4 | Yjs 协同编辑 | 4-5 天 | Phase 1, 2 |
| Phase 5 | 组件库和模板 | 3-4 天 | Phase 2, 3 |
| Phase 6 | Agent 集成和移动端 | 3-4 天 | Phase 2, 3 |
| Phase 7 | 测试和优化 | 2-3 天 | All |
| **总计** | | **22-29 天** | |

---

## 下一步行动

### 立即开始

1. **技术验证**（1-2 天）
   - [ ] Puck Demo: 创建一个简单页面
   - [ ] Formily 桥接 POC: Formily Field 作为 Puck 组件
   - [ ] Workflow Engine 集成 POC: 触发一个简单工作流
   - [ ] Yjs 协同 POC: 两个浏览器同步编辑

2. **架构评审**（0.5 天）
   - [ ] 与团队讨论技术方案
   - [ ] 确认数据模型设计
   - [ ] 评估风险和资源

3. **启动 Phase 1**（3-4 天）
   - [ ] 创建项目结构
   - [ ] 搭建开发环境
   - [ ] 实现第一个可运行的原型

---

## 参考资源

- [Puck 官方文档](https://puckeditor.com/docs)
- [Formily 文档](https://formilyjs.org/)
- [Yjs 文档](https://docs.yjs.dev/)
- [Workflow Engine USAGE.md](/Volumes/data/workspace/qianwen/workflow-engine/USAGE.md)

---

**最后更新**: 2026-06-25
**状态**: 待评审
**负责人**: TBD
