# Form App 完整架构计划

## 一、核心理念

### 1.1 设计目标
- **数据源绑定**：一个 Form App 绑定到一个 DataSource，但可关联多个 Dataset
- **多页面交叉结构**：支持 form/list/detail 及自定义页面的灵活组合
- **快速生成**：基于 Formily Schema 一键生成完整业务逻辑
- **双向编辑**：生成页面可反向进入 Form Editor 修改
- **语义化创建**：后端对接 Claude API，支持自然语言描述直接生成表单
- **Agent 下发**：通过 AgentMenu 机制一键下发到设备
- **事件路由**：支持扫码等事件分流到指定页面，或单页面拦截所有事件

---

## 二、数据模型设计

### 2.1 核心模型

#### FormAppInfo（表单应用）
```go
type FormAppInfo struct {
  ID             uint       `gorm:"primaryKey"`
  Code           string     `gorm:"uniqueIndex"` // 唯一标识
  Name           string
  DataSourceID   uint       `gorm:"index"` // 绑定数据源（必须）
  Mode           string     // form | wizard | survey
  DesignSchema   string     `gorm:"type:longtext"` // Formily Designable JSON
  RuntimeSchema  string     `gorm:"type:longtext"` // 运行时配置
  UISchema       string     `gorm:"type:longtext"` // UI 配置
  PublishStatus  int        // 0=草稿 1=已发布
  ContentVersion int64      // 内容版本号（每次保存递增）
  CreatedAt      time.Time
  UpdatedAt      time.Time
}
```

#### FormAppPage（页面定义）
```go
type FormAppPage struct {
  ID            uint       `gorm:"primaryKey"`
  FormAppID     uint       `gorm:"index"`
  PageKey       string     // form | list | detail | custom_key
  PageType      string     // form | list | detail | custom
  Title         string
  DesignSchema  string     `gorm:"type:longtext"` // 该页面的 Formily Schema
  DatasetID     *uint      // 关联数据集（可选）
  InterfaceCode string     // 关联数据接口 code
  ConfigJSON    string     `gorm:"type:text"` // 页面级配置（分页/查询条件等）
  SortOrder     int
  CreatedAt     time.Time
  UpdatedAt     time.Time
}
```

#### FormAppPageLink（页面间跳转）
```go
type FormAppPageLink struct {
  ID            uint   `gorm:"primaryKey"`
  FormAppID     uint   `gorm:"index"`
  FromPageKey   string // 源页面
  ToPageKey     string // 目标页面
  TriggerType   string // button_click | row_click | auto_redirect
  TriggerConfig string `gorm:"type:text"` // 触发配置 JSON
  ParamMapping  string `gorm:"type:text"` // 参数映射 JSON
}
```

#### FormAppEventRoute（事件路由配置）
```go
type FormAppEventRoute struct {
  ID            uint   `gorm:"primaryKey"`
  FormAppID     uint   `gorm:"index"`
  EventType     string // barcode | qrcode | nfc | custom
  MatcherType   string // prefix | regex | exact | all
  MatcherValue  string // 匹配规则
  TargetPageKey string // 目标页面
  Priority      int    // 优先级（数字越小越优先）
  Enabled       bool
}
```

---

## 三、功能模块设计

### 3.1 表单应用创建流程

#### 方式一：可视化创建（现有流程优化）
1. **基础定义**：填写 code/name，选择数据源
2. **选择模式**：
   - 快速生成：选择数据源表 → 一键生成 form/list/detail
   - 手动创建：逐页面添加并配置
3. **页面配置**：
   - 每个页面独立配置 Formily Schema
   - 绑定 Dataset 或 DataInterface
   - 配置分页/查询条件/字段绑定
4. **页面跳转**：配置页面间导航关系
5. **事件路由**：配置扫码等事件分流规则
6. **发布**：保存并发布到 Agent

#### 方式二：语义化创建（Claude API 集成）
```
POST /api/form-app/ai-generate
{
  "prompt": "创建一个设备巡检表单，包含设备编号、巡检人、巡检时间、状态（正常/异常）、备注字段，支持扫码录入设备编号",
  "data_source_code": "inspection_db"
}
```

**后端处理流程**：
1. 调用 Claude API 解析需求
2. 自动创建数据源表（如不存在）
3. 生成 Formily Schema
4. 创建 Dataset 和 DataInterface
5. 配置事件路由（扫码 → 表单页）
6. 返回生成的 FormAppInfo

---

### 3.2 页面管理

#### 页面类型
- **form**：表单录入页
- **list**：列表查询页
- **detail**：详情展示页
- **custom**：自定义页面（报表/统计/审批流等）

#### 页面配置结构（ConfigJSON）
```json
{
  "pagination": {
    "enabled": true,
    "pageParam": "page",
    "pageSizeParam": "page_size",
    "defaultPageSize": 10
  },
  "query_conditions": [
    { "field": "name", "operator": "contains", "label": "姓名" }
  ],
  "actions": [
    { "type": "submit", "label": "提交", "target": "detail" },
    { "type": "navigate", "label": "返回列表", "target": "list" }
  ],
  "field_bindings": [
    {
      "field": "dept_id",
      "query_interface": "dept_options",
      "listen_targets": ["employee_select"]
    }
  ]
}
```

---

### 3.3 事件路由系统

#### 事件类型
- **barcode**：条码扫描
- **qrcode**：二维码扫描
- **nfc**：NFC 标签读取
- **custom**：自定义事件

#### 路由模式
1. **分流模式**：根据事件数据匹配规则，路由到不同页面
2. **拦截模式**：单个页面拦截所有事件，自行处理

#### 配置示例
```json
{
  "mode": "dispatch",
  "routes": [
    {
      "event_type": "barcode",
      "matcher_type": "prefix",
      "matcher_value": "EQP-",
      "target_page": "equipment_form",
      "param_mapping": { "equipment_code": "$event.data" }
    },
    {
      "event_type": "qrcode",
      "matcher_type": "regex",
      "matcher_value": "^LOT\\d{6}$",
      "target_page": "lot_detail",
      "param_mapping": { "lot_number": "$event.data" }
    }
  ],
  "fallback": {
    "target_page": "scan_error",
    "message": "无法识别的扫码内容"
  }
}
```

#### 拦截模式配置
```json
{
  "mode": "intercept",
  "intercept_page": "universal_scanner",
  "event_types": ["barcode", "qrcode", "nfc"]
}
```

---

### 3.4 Agent 菜单下发

#### AgentMenuItem 扩展
```go
type AgentMenuItem struct {
  // ... 现有字段
  TargetType        string // 新增：form_app_entry
  TargetRef         string // FormAppInfo.code
  FormAppPageKey    string // 指定入口页面（默认 form）
  ScanConfigJSON    string // 扫码配置
  AccessPolicyJSON  string // 访问策略（用户/部门/设备）
}
```

#### 下发策略
- **按设备下发**：指定设备 ID 列表
- **按用户下发**：指定用户 ID 列表
- **按部门下发**：指定部门编码
- **全局下发**：所有设备可见

#### FormAppAccessPolicy（访问策略）
```go
type FormAppAccessPolicy struct {
  ID         uint
  FormAppID  uint
  TargetType string // device | user | department | position
  TargetRef  string // 目标标识
  CanView    bool
  CanSubmit  bool
}
```

---

## 四、前端架构

### 4.1 页面结构

```
form-app/
├── src/
│   ├── pages/
│   │   ├── FormAppListPage.tsx          # 应用列表
│   │   ├── FormAppDesignerPage.tsx      # 设计器（重构）
│   │   ├── PageEditorPage.tsx           # 单页面编辑器
│   │   ├── PageLinkEditorPage.tsx       # 页面跳转配置
│   │   ├── EventRouteEditorPage.tsx     # 事件路由配置
│   │   ├── GeneratedFormAppPage.tsx     # 运行时渲染（重构）
│   │   ├── AIGeneratorPage.tsx          # AI 生成器
│   ├── components/
│   │   ├── FormDesigner/                # Formily Designable 封装
│   │   ├── PageNavigator/               # 页面导航组件
│   │   ├── EventRouter/                 # 事件路由组件
│   │   ├── DataBindingPanel/            # 数据绑定面板
│   ├── runtime/
│   │   ├── FormRenderer.tsx             # 表单渲染器
│   │   ├── ListRenderer.tsx             # 列表渲染器
│   │   ├── DetailRenderer.tsx           # 详情渲染器
│   │   ├── EventHandler.ts              # 事件处理器
```

### 4.2 设计器重构

#### 多页面管理
- 左侧：页面树（可拖拽排序）
- 中间：当前页面 Formily 编辑器
- 右侧：页面配置面板（数据源/接口/跳转/事件）

#### 页面间跳转配置
- 可视化连线：拖拽建立页面间关系
- 参数映射：配置跳转时的参数传递
- 触发条件：按钮点击/行点击/自动跳转

---

## 五、后端 API 设计

### 5.1 表单应用管理

```
GET    /api/form-app/infos                    # 列表
POST   /api/form-app/infos                    # 创建
GET    /api/form-app/infos/:id                # 详情
PUT    /api/form-app/infos/:id                # 更新
DELETE /api/form-app/infos/:id                # 删除
POST   /api/form-app/infos/:id/publish        # 发布
POST   /api/form-app/infos/:id/unpublish      # 取消发布
```

### 5.2 页面管理

```
GET    /api/form-app/infos/:id/pages          # 页面列表
POST   /api/form-app/infos/:id/pages          # 创建页面
GET    /api/form-app/pages/:page_id           # 页面详情
PUT    /api/form-app/pages/:page_id           # 更新页面
DELETE /api/form-app/pages/:page_id           # 删除页面
POST   /api/form-app/pages/:page_id/duplicate # 复制页面
```

### 5.3 页面跳转配置

```
GET    /api/form-app/infos/:id/links          # 跳转列表
POST   /api/form-app/infos/:id/links          # 创建跳转
PUT    /api/form-app/links/:link_id           # 更新跳转
DELETE /api/form-app/links/:link_id           # 删除跳转
```

### 5.4 事件路由配置

```
GET    /api/form-app/infos/:id/event-routes   # 路由列表
POST   /api/form-app/infos/:id/event-routes   # 创建路由
PUT    /api/form-app/event-routes/:route_id   # 更新路由
DELETE /api/form-app/event-routes/:route_id   # 删除路由
POST   /api/form-app/infos/:id/test-event     # 测试事件路由
```

### 5.5 AI 生成

```
POST   /api/form-app/ai-generate               # AI 生成表单
POST   /api/form-app/ai-enhance/:id            # AI 增强现有表单
POST   /api/form-app/ai-suggest-fields         # AI 建议字段
```

### 5.6 运行时

```
POST   /api/form-app/runtime/query             # 查询数据
POST   /api/form-app/runtime/submit            # 提交数据
POST   /api/form-app/runtime/navigate          # 页面导航
POST   /api/form-app/runtime/handle-event      # 处理事件
GET    /api/form-app/runtime/:code/config      # 获取运行时配置
```

---

## 六、实施计划

### Phase 1：数据模型与基础 API（1-2 天）
- [ ] 创建 FormAppPage 模型
- [ ] 创建 FormAppPageLink 模型
- [ ] 创建 FormAppEventRoute 模型
- [ ] 实现页面管理 API
- [ ] 实现跳转配置 API
- [ ] 实现事件路由 API

### Phase 2：前端设计器重构（3-4 天）
- [ ] 重构 FormAppDesignerPage 支持多页面
- [ ] 实现 PageEditorPage 单页面编辑器
- [ ] 实现 PageLinkEditorPage 跳转配置
- [ ] 实现 EventRouteEditorPage 事件路由配置
- [ ] 实现页面树拖拽排序
- [ ] 实现可视化连线配置跳转

### Phase 3：运行时渲染器（2-3 天）
- [ ] 重构 GeneratedFormAppPage 支持多页面
- [ ] 实现 FormRenderer 表单渲染器
- [ ] 实现 ListRenderer 列表渲染器
- [ ] 实现 DetailRenderer 详情渲染器
- [ ] 实现 EventHandler 事件处理器
- [ ] 实现页面间导航逻辑

### Phase 4：Agent 集成（2-3 天）
- [ ] 扩展 AgentMenuItem 支持 form_app_entry
- [ ] 实现 FormAppAccessPolicy 访问控制
- [ ] 实现菜单下发 API
- [ ] Android Agent 端实现表单入口
- [ ] Android Agent 端实现事件路由
- [ ] 测试扫码跳转流程

### Phase 5：AI 生成（3-4 天）
- [ ] 集成 Claude API
- [ ] 实现 AI 生成表单 API
- [ ] 实现 AI 增强表单 API
- [ ] 实现 AI 建议字段 API
- [ ] 前端实现 AIGeneratorPage
- [ ] 测试语义化创建流程

### Phase 6：测试与优化（2-3 天）
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 文档完善
- [ ] 示例应用

---

## 七、技术要点

### 7.1 多页面 Schema 存储策略

**方案一：单一 RuntimeSchema（当前）**
```json
{
  "pages": {
    "form": { "design_schema": {...}, "config": {...} },
    "list": { "design_schema": {...}, "config": {...} }
  }
}
```

**方案二：独立 FormAppPage 表（推荐）**
- 每个页面独立存储 DesignSchema
- 支持页面级版本控制
- 便于页面复用和模板化

### 7.2 事件路由优先级

1. 页面级拦截模式（最高优先级）
2. 精确匹配（exact）
3. 正则匹配（regex）
4. 前缀匹配（prefix）
5. 全匹配（all）
6. Fallback 页面

### 7.3 Claude API 集成

**Prompt 模板**：
```
你是一个表单设计专家。根据以下需求生成 Formily Schema：

需求：{user_prompt}
数据源：{data_source_info}
现有表：{existing_tables}

请生成：
1. 数据表 DDL（如需创建新表）
2. Formily Design Schema（表单页）
3. 列表页配置（字段/查询条件/分页）
4. 详情页配置
5. 数据接口定义（list/detail/submit）
6. 事件路由配置（如涉及扫码）

输出 JSON 格式。
```

---

## 八、示例场景

### 场景一：设备巡检表单

**需求**：
- 扫码录入设备编号
- 填写巡检人、巡检时间、状态、备注
- 提交后查看历史巡检记录
- 支持按设备编号查询

**实现**：
1. 创建 FormApp：`equipment_inspection`
2. 绑定数据源：`inspection_db`
3. 生成页面：
   - `form`：巡检表单（扫码自动填充设备编号）
   - `list`：巡检记录列表（支持按设备编号查询）
   - `detail`：巡检详情
4. 配置事件路由：
   - 扫码前缀 `EQP-` → 跳转 `form` 页并填充设备编号
5. 下发到巡检员设备

### 场景二：多表单交叉结构

**需求**：
- 员工信息表单
- 部门信息表单
- 员工列表（关联部门）
- 部门列表（显示员工数）

**实现**：
1. 创建 FormApp：`hr_management`
2. 绑定数据源：`hr_db`
3. 创建页面：
   - `employee_form`：员工表单（部门字段联动查询）
   - `employee_list`：员工列表
   - `employee_detail`：员工详情
   - `dept_form`：部门表单
   - `dept_list`：部门列表
   - `dept_detail`：部门详情（显示员工列表）
4. 配置跳转：
   - `employee_list` 行点击 → `employee_detail`
   - `employee_detail` 部门链接 → `dept_detail`
   - `dept_detail` 员工行 → `employee_detail`

---

## 九、关键决策

### 9.1 数据模型
✅ **采用独立 FormAppPage 表**，而非单一 RuntimeSchema
- 理由：支持页面级版本控制、复用、模板化

### 9.2 事件路由
✅ **支持分流和拦截两种模式**
- 理由：分流适合多表单场景，拦截适合复杂业务逻辑

### 9.3 AI 生成
✅ **后端调用 Claude API**，而非前端直接调用
- 理由：保护 API Key、统一 Prompt 管理、便于审计

### 9.4 Agent 下发
✅ **复用现有 AgentMenuItem 机制**
- 理由：统一菜单管理、支持访问控制、版本同步

---

## 十、风险与挑战

### 10.1 技术风险
- **Formily Schema 复杂度**：多页面场景下 Schema 管理复杂
  - 缓解：页面级独立存储、提供模板库
- **事件路由性能**：大量路由规则匹配性能
  - 缓解：优先级排序、缓存匹配结果
- **Claude API 稳定性**：依赖外部 API
  - 缓解：降级到模板生成、本地缓存常用 Schema

### 10.2 产品风险
- **学习曲线**：多页面配置复杂度高
  - 缓解：提供向导式创建、示例模板
- **性能问题**：大表单渲染性能
  - 缓解：虚拟滚动、懒加载、分页

---

## 十一、后续扩展

### 11.1 表单模板市场
- 预置常用表单模板（巡检/报修/审批等）
- 支持导入/导出表单配置
- 社区分享机制

### 11.2 工作流集成
- 表单提交触发工作流
- 审批流程配置
- 消息通知

### 11.3 数据分析
- 表单提交统计
- 字段分布分析
- 自定义报表

---

## 十二、总结

本架构计划基于现有代码，重新设计了 Form App 的核心能力：

1. **数据源绑定 + 多 Dataset 关联**：灵活的数据模型
2. **多页面交叉结构**：支持复杂业务场景
3. **事件路由系统**：扫码等事件智能分流
4. **Agent 下发机制**：一键部署到设备
5. **AI 语义化创建**：自然语言生成表单

预计总工期：**15-20 天**，可分阶段交付。
