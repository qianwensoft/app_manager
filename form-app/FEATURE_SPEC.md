# Form App 功能定义

## 概述

Form App 是基于 Formily Designable 的低代码表单应用生成器，支持从数据源表自动生成 **表单页/列表页/详情页** 三页联动结构，并通过可视化编辑器定制表单 UI。

---

## 核心能力

### 1. 表单应用生命周期管理

#### 1.1 创建与定义（FormAppListPage）
- **表单元信息**：`code`（唯一标识）、`name`、`description`、`mode=form`
- **快速创建**：填写编码/名称后一键创建并进入配置
- **列表管理**：搜索、刷新、查看发布状态、进入配置/生成页

#### 1.2 三阶段配置流程（FormDesignerPage）

**Step 1 · 基础配置（表单/列表/详情）**
- **表单定义**：确认 `formCode` / `formName` 后进入 schema 配置阶段
- **Schema 模式**：
  - `select_schema`：选择已有数据源表
  - `create_schema`：执行 DDL 创建新表
- **数据源管理**：
  - 选择已有数据源（支持 SQLite/MySQL）
  - 配置新数据源（code/name/type/dsn）
- **表选择**：选择数据源表 + 主键字段
- **一键生成**：自动生成 `list`/`detail`/`form` 三页面结构并绑定接口
- **页面结构树**：可视化展示已生成页面，支持维护接口绑定、新增自定义页面

**Step 2 · 页面接口与标准分页参数**
- **接口绑定**：
  - `listInterfaceCode`：列表查询接口
  - `detailInterfaceCode`：详情查询接口
  - `submitInterfaceCode`：表单提交接口
- **分页配置**：
  - `pageParam` / `pageSizeParam`（页码模式）
  - `limitParam` / `offsetParam`（偏移模式）
  - `defaultPageSize`：默认分页大小

**Step 3 · Query 多条件查询模式**
- **查询条件配置**：
  - `field`：字段名
  - `operator`：操作符（contains/starts_with/ends_with/eq/gt/gte/lt/lte/between/in）
  - `value`：默认值/表达式
- **动态条件**：支持新增/删除查询条件

#### 1.3 数据绑定配置

**字段级绑定（bindings）**
- `field`：字段标识（如 `dept`）
- `contextKey`：写入 Context 的键（如 `ctx.dept`）
- `listenTargets`：监听该字段变化的组件（逗号分隔）
- `querySourceType`：`data_interface` | `app_interface`
- `queryCode`：查询接口编码

**提交绑定（submit_binding）**
- `sourceType`：`data_interface` | `app_interface`
- `submitCode`：提交接口编码
- `payloadPath`：提交数据路径（默认 `$form`）

---

### 2. 可视化表单设计器（Formily Designable）

#### 2.1 组件库
- **输入组件**：Input, Password, NumberPicker, Rate, Slider, Select, TreeSelect, Cascader, Transfer, Checkbox, Radio, DatePicker, TimePicker, Upload, Switch
- **布局组件**：Card, FormGrid, FormTab, FormLayout, FormCollapse, Space
- **数组组件**：ArrayCards, ArrayTable
- **展示组件**：Text, SubmitButton, ConfirmDialogButton

#### 2.2 编辑器功能
- **拖拽设计**：从组件面板拖拽到画布
- **属性配置**：右侧 SettingsPanel 配置组件属性
- **大纲树**：OutlineTreeWidget 查看组件层级
- **历史记录**：HistoryWidget 支持撤销/重做

#### 2.3 Schema 持久化
- **design_schema**：Formily Designable 设计态 JSON（存储组件树结构）
- **runtime_schema**：运行时配置（数据源/接口/分页/查询条件/绑定）
- **ui_schema**：UI 配置（mode: `generated-multi-pages`）

---

### 3. 多页面生成与运行时

#### 3.1 自动生成逻辑（`/api/form-app/infos/:id/generate-pages-from-table`）
- **输入**：`data_source_id` + `table` + `primary_key`
- **输出**：
  - 自动创建 3 个 DataInterface（list/detail/submit）
  - 生成 `runtime_schema` 包含页面配置
  - 返回接口编码供前端绑定

#### 3.2 生成页面路由（GeneratedFormAppPage）
- **表单页**：`/generated/:code/form`
  - 提交表单后跳转详情页
- **列表页**：`/generated/:code/list`
  - 多条件查询（动态 filters）
  - 分页导航（上一页/下一页/每页条数）
  - 点击行跳转详情页
- **详情页**：`/generated/:code/detail`
  - 输入 ID 查询单条记录
  - 展示 JSON 详情

#### 3.3 运行时查询/提交（`/api/form-app/runtime/*`）
- **查询接口**：`POST /api/form-app/runtime/query`
  - `interface_code`：接口编码
  - `param_values`：查询参数（支持分页/过滤）
  - `query_filters`：多条件过滤（field/operator/value）
- **提交接口**：`POST /api/form-app/runtime/submit`
  - `interface_code`：提交接口编码
  - `param_values`：表单数据
  - 返回 `record_id` / `last_insert_id`

---

### 4. Demo 与测试

#### 4.1 test_app Demo（TestAppDemoPage）
- **初始化**：`POST /api/form-app/demo/bootstrap`
  - 自动创建 `test_app` 数据源（SQLite）
  - 创建 `demo_form` 表（id/name/dept/remark/created_at）
  - 生成 list/single/submit 三个接口
- **功能演示**：
  - 列表查看（分页）
  - 单条查看（按 ID）
  - 表单提交（name/dept/remark）

#### 4.2 Schema 文档（SchemaPage）
- **form_app 核心 schema**：schema_version / code / mode / design_schema / runtime_schema / ui_schema
- **bindings**：DataInterface 绑定示例
- **scan_config**：菜单侧扫码策略（Phase 2-3 预留）
- **menu_bundle**：统一下发结构（Phase 2-3 预留）

---

## 数据模型

### FormAppInfo（数据库表）
```go
type FormAppInfo struct {
  ID             uint   `gorm:"primaryKey"`
  Code           string `gorm:"uniqueIndex;not null"` // 唯一标识
  Name           string
  Description    string
  Mode           string // "form" | "wizard" | "survey"
  GroupID        uint   // 关联数据源 ID
  DesignSchema   string `gorm:"type:text"` // Formily Designable JSON
  RuntimeSchema  string `gorm:"type:text"` // 运行时配置 JSON
  UISchema       string `gorm:"type:text"` // UI 配置 JSON
  PublishStatus  int    // 0=未发布, 1=已发布
  CreatedAt      time.Time
  UpdatedAt      time.Time
}
```

### RuntimeSchema 结构
```json
{
  "schema_version": "1.0.0",
  "datasource": {
    "source_id": 1,
    "source_query_params": {
      "tenant_id": "$context.tenant_id",
      "org_id": "$context.org_id"
    }
  },
  "pages": {
    "form": {
      "submit_interface_code": "demo_form_submit"
    },
    "list": {
      "interface_code": "demo_form_list",
      "pagination": {
        "pageParam": "page",
        "pageSizeParam": "page_size",
        "limitParam": "limit",
        "offsetParam": "offset",
        "defaultPageSize": 10
      },
      "query_conditions": [
        { "field": "name", "operator": "contains", "value": "" },
        { "field": "dept", "operator": "eq", "value": "" }
      ]
    },
    "detail": {
      "interface_code": "demo_form_detail"
    }
  },
  "bindings": [
    {
      "field": "dept",
      "context_key": "ctx.dept",
      "listen_targets": ["employee_select"],
      "query_source_type": "data_interface",
      "query_interface_code": "dept_options"
    }
  ],
  "submit_binding": {
    "source_type": "data_interface",
    "submit_interface_code": "demo_form_submit",
    "payload_path": "$form"
  }
}
```

---

## API 端点

### 表单应用管理
- `GET /api/form-app/infos` - 列表
- `POST /api/form-app/infos` - 创建
- `GET /api/form-app/infos/:id` - 详情
- `GET /api/form-app/infos/code/:code` - 按 code 查询
- `PUT /api/form-app/infos/:id` - 更新
- `POST /api/form-app/infos/:id/save-schema` - 保存 schema
- `POST /api/form-app/infos/:id/generate-pages-from-table` - 从数据源表生成页面

### 运行时
- `POST /api/form-app/runtime/query` - 查询（列表/详情）
- `POST /api/form-app/runtime/submit` - 提交表单

### Demo
- `POST /api/form-app/demo/bootstrap` - 初始化 test_app 演示

---

## 技术栈

### 前端
- **React 17** + **TypeScript**
- **Vite** 构建工具
- **React Router 6** 路由
- **Formily 2.x** 表单方案
- **@designable/formily-antd** 可视化设计器
- **Ant Design 4.22.8** UI 组件库

### 后端（Go）
- **Gin** Web 框架
- **GORM** ORM
- **SQLite/MySQL** 数据库
- **DataInterface** 统一数据接口层

---

## 使用流程

### 快速开始
1. **创建表单应用**：在 `/forms` 页面填写 code/name 并创建
2. **选择数据源**：选择已有数据源或创建新数据源
3. **选择表**：选择数据源表 + 主键字段
4. **一键生成**：点击"一键生成多页面结构"自动创建 list/detail/form 三页面
5. **配置接口**：确认列表/详情/提交接口绑定
6. **配置分页**：设置分页参数（page/page_size 或 limit/offset）
7. **配置查询条件**：添加多条件查询字段
8. **可视化设计**：在左侧 Formily Designable 编辑器中拖拽组件设计表单 UI
9. **保存配置**：点击"保存配置"持久化 design_schema + runtime_schema
10. **预览生成页面**：点击"预览生成页面"或"打开生成页"查看效果

### 高级功能
- **自定义页面**：点击"新增其他页面"添加扩展页面（如 report）
- **数据绑定**：配置字段级联查询（如部门选择联动员工列表）
- **只读数据源**：自动降级为仅查询页面（list/detail）

---

## 待完成功能（Phase 2-3）

### 1. 扫码路由集成
- **scan_config**：菜单侧扫码策略（barcode/qrcode 事件路由）
- **scan_router**：根据扫码内容动态跳转表单页

### 2. 菜单下发
- **menu_bundle**：统一下发结构（bundle_revision/menus/linked_pages）
- **Agent 同步**：Android Agent 拉取菜单配置并展示

### 3. 自定义组件
- **SubmitButton**：提交按钮组件（需实现 Formily 组件协议）
- **ConfirmDialogButton**：确认对话框按钮（需实现 Formily 组件协议）

### 4. 表单验证
- **字段级验证**：required/pattern/min/max/custom validator
- **跨字段验证**：依赖关系验证

### 5. 权限控制
- **字段级权限**：根据用户角色显示/隐藏字段
- **操作权限**：提交/查看/编辑权限控制

---

## 文件结构

```
form-app/
├── src/
│   ├── pages/
│   │   ├── FormAppListPage.tsx       # 表单应用列表
│   │   ├── FormDesignerPage.tsx      # 可视化设计器（核心）
│   │   ├── GeneratedFormAppPage.tsx  # 生成页面运行时
│   │   ├── TestAppDemoPage.tsx       # test_app 演示
│   │   ├── SchemaPage.tsx            # Schema 文档
│   │   ├── FormPreviewPage.tsx       # 预览页（待实现）
│   ├── designable/
│   │   ├── SubmitButton.tsx          # 自定义提交按钮（待实现）
│   │   ├── ConfirmDialogButton.tsx   # 自定义确认按钮（待实现）
│   ├── App.tsx                       # 路由配置
│   ├── main.tsx                      # 入口
│   ├── styles.css                    # 全局样式
├── package.json
├── vite.config.ts
├── tsconfig.json
└── FEATURE_SPEC.md                   # 本文档
```

---

## 开发指南

### 本地开发
```bash
cd form-app
npm install
npm run dev  # 启动开发服务器（http://localhost:5173）
```

### 生产构建
```bash
npm run build  # 输出到 form-app/dist/
```

### 集成到主应用
Go 服务器在 `/form-app/*` 路由下提供静态文件服务，Vue 主应用通过 `openFormApp()` 打开新标签页。

---

## 注意事项

1. **只读数据源**：选择只读数据源时，自动降级为仅生成 list/detail 页面（无 submit）
2. **主键字段**：必须正确选择主键字段，否则详情查询/更新操作会失败
3. **接口编码唯一性**：自动生成的接口 code 格式为 `{table}_list` / `{table}_detail` / `{table}_submit`
4. **分页参数**：支持两种模式（page/page_size 或 limit/offset），根据后端接口选择
5. **查询条件**：`value` 字段支持表达式（如 `$context.user_id`）实现动态过滤
6. **Schema 版本**：当前 `schema_version: "1.0.0"`，未来升级需兼容旧版本

---

## 相关文档

- [Formily 官方文档](https://formilyjs.org/)
- [Designable 官方文档](https://designable-antd.formilyjs.org/)
- [DataInterface 设计文档](../docs/data-interface.md)
- [CLAUDE.md](../CLAUDE.md) - 项目整体架构说明
