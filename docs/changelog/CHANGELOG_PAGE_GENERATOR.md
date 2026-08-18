# 页面生成器改进日志

## 功能概述

为 form-app 的"从数据表生成页面"功能添加了以下增强：

### 1. 多页面类型同时生成
- **改进前**: 页面类型单选（表单页/列表页/详情页），每次只能生成一个
- **改进后**: 页面类型多选，可同时生成多个页面（例如同时生成列表页+详情页+表单页）

### 2. 平台类型选择（移动端/Web端）
- **新增**: 平台类型选择器，支持 Web 端和移动端两种模式
- **Web 端**: 使用 ArrayTable 组件 + 传统分页
- **移动端**: 使用 ArrayCards 卡片式布局 + 下拉刷新 + 上拉加载更多

## 技术实现

### 前端改动

#### 1. PagesPanel.tsx (控制台页面生成面板)
- 添加 `platformType` 状态: `'web' | 'mobile'`
- 修改 `regenerateTargets` 为数组，支持多选
- 添加平台类型选择按钮
- 修改 API 调用，传递 `page_types` (数组) 和 `platform_type`

```typescript
// 原来：单个 page_type
{ page_type: 'list', data_source_id: xxx, ... }

// 现在：多个 page_types + platform_type
{
  page_types: ['list', 'detail', 'form'],
  platform_type: 'mobile',
  data_source_id: xxx,
  ...
}
```

#### 2. ListRenderer.tsx (列表渲染组件)
新增功能：
- `mode` 属性: `'web' | 'mobile'`
- 移动端卡片式布局渲染
- 下拉刷新逻辑 (通过 `refreshing` 状态)
- 上拉加载更多 (通过滚动监听 + `loadingMore` 状态)
- 分页数据追加模式 (`append` 参数)

关键逻辑：
```typescript
const loadData = async (p: number = page, append = false) => {
  // append=true 时追加数据，false 时替换
  if (append) {
    setData(prev => [...prev, ...resultData])
  } else {
    setData(resultData)
  }
}
```

滚动监听触发加载更多：
```typescript
useEffect(() => {
  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    // 距离底部 100px 触发
    if (scrollHeight - scrollTop - clientHeight < 100) {
      handleLoadMore()
    }
  }
  // ...
}, [mode, handleLoadMore])
```

#### 3. MultiPageRuntime.tsx (运行时)
- 根据 `design_schema` 中的 `x-component` 判断模式
- 传递 `mode` 属性给 ListRenderer

```typescript
mode={designSchema?.schema?.properties?.table?.['x-component'] === 'ArrayCards' ? 'mobile' : 'web'}
```

### 后端改动

#### 1. form_app.go - RegenerateSinglePage
请求体扩展：
```go
var body struct {
  PageType     string   `json:"page_type"`      // 向后兼容
  PageTypes    []string `json:"page_types"`     // 新增：多页面类型
  PlatformType string   `json:"platform_type"`  // 新增：平台类型
  DataSourceID uint     `json:"data_source_id"`
  Table        string   `json:"table"`
  PrimaryKey   string   `json:"primary_key"`
}
```

逻辑改进：
- 同时支持单个 `page_type` (向后兼容) 和多个 `page_types`
- 校验 `platform_type` 必须为 `web` 或 `mobile`，默认 `web`
- 在事务中循环生成每个 pageType
- 为每个生成的页面创建对应的 Dataset、DataInterface

#### 2. buildGeneratedListDesignSchema
根据 `platformType` 生成不同的组件配置：

**Web 端 (ArrayTable):**
```go
schema = map[string]interface{}{
  "type": "object",
  "properties": map[string]interface{}{
    "table": map[string]interface{}{
      "type":              "void",
      "x-component":       "ArrayTable",
      "x-component-props": map[string]interface{}{
        "columns": columns,  // 列定义
        "rowKey":  pk,
      },
    },
  },
}
```

**移动端 (ArrayCards):**
```go
// 为每个字段生成 Formily schema 定义
cardProperties := map[string]interface{}{}
for i, c := range cols {
  cardProperties[name] = map[string]interface{}{
    "type":              "string",
    "title":             strings.ToUpper(name),
    "x-decorator":       "FormItem",
    "x-component":       "Input",
    "x-component-props": map[string]interface{}{"readOnly": true},
    "x-index":           i,
  }
}

schema = map[string]interface{}{
  "type": "object",
  "properties": map[string]interface{}{
    "list": map[string]interface{}{
      "type":        "array",
      "x-component": "ArrayCards",
      "x-component-props": map[string]interface{}{
        "title": "列表数据",
      },
      "items": map[string]interface{}{
        "type":       "object",
        "properties": cardProperties,  // 卡片内部字段定义
      },
    },
  },
}
```

**关键区别**:
- ArrayTable: 通过 `columns` 数组配置表格列
- ArrayCards: 通过 `items.properties` 配置卡片内部的每个字段，每个字段是完整的 Formily 字段定义（包含 `x-component`、`x-decorator` 等）

#### 3. 列表页 config_json 修复
**关键修复**: 列表页的 `config_json` 现在包含 `field_definitions`：

```go
cfg := map[string]interface{}{
  "field_definitions": fieldDefs,  // 新增：用于渲染列表列/卡片字段
  "pagination": map[string]interface{}{
    "enabled":           true,
    "page_param":        "page",
    "page_size_param":   "page_size",
    "limit_param":       "limit",
    "offset_param":      "offset",
    "default_page_size": 10,
  },
  "query_conditions": conditions,
}
```

字段定义生成逻辑：
```go
fieldDefs := []map[string]interface{}{}
for _, c := range cols {
  name := strings.TrimSpace(c.Name)
  if name == "" {
    continue
  }
  fieldDefs = append(fieldDefs, map[string]interface{}{
    "field": name,
    "label": strings.ToUpper(name),
  })
}
```

## 使用方式

### 1. 打开页面生成面板
控制台 → form-app 编辑 → 页面与字段 tab → "从表生成" 按钮

### 2. 选择配置
- **数据源**: 选择数据库连接
- **数据表**: 选择要生成的表
- **主键字段**: 默认为 `id`，可修改
- **平台类型**: 选择 "Web 端" 或 "移动端"
- **页面类型**: 多选（表单页/列表页/详情页）

### 3. 生成结果
- 一次生成多个页面（例如选中 3 个类型就生成 3 个页面）
- 每个页面自动创建对应的数据接口 (DataInterface) 和数据集 (Dataset)
- 列表页自动配置分页查询
- 列表页自动生成所有字段的 field_definitions（用于卡片/表格显示）
- 详情页自动添加 list→detail 跳转链接

## 移动端特性

### 下拉刷新
- 顶部显示刷新指示器
- 刷新时重新加载第 1 页数据

### 上拉加载
- 滚动到距离底部 100px 时自动触发
- 底部显示"加载更多..."指示器
- 数据追加到列表末尾
- 加载完毕显示"已加载全部 N 条"

### 卡片布局
- 每条记录一个独立卡片
- 字段以 `label: value` 形式纵向排列
- 支持点击卡片跳转详情
- 所有表字段自动显示（包括主键）

## 向后兼容

- 旧的单选接口 (`page_type`) 依然支持
- 未指定 `platform_type` 时默认为 `web`
- 已有的 Web 端列表页不受影响

## Bug 修复

### 1. 移动端卡片内部没有显示字段
**原因**: 列表页的 `config_json` 缺少 `field_definitions`，只有 `query_conditions`。`ListRenderer` 组件依赖 `fields` 属性（来自 `config.field_definitions`）来渲染列表内容。

**修复**: 在生成列表页时，为所有表字段（包括主键）生成 `field_definitions`，格式为：
```json
{
  "field": "column_name",
  "label": "COLUMN_NAME"
}
```

### 2. ArrayCards design_schema 缺少字段定义
**原因**: 
- 最初的实现将 ArrayCards 的 `x-component-props.columns` 设置为表格列定义
- 但 ArrayCards 是 Formily 组件，需要在 `items.properties` 中定义每个字段的完整 schema（包括 `x-component`、`x-decorator` 等）
- 缺少 `items.properties`，导致 ArrayCards 无法渲染内部字段

**修复**: 
为 ArrayCards 生成正确的 Formily schema 结构：

```go
// 为每个数据库字段生成 Formily 字段定义
cardProperties := map[string]interface{}{}
for i, c := range cols {
  name := strings.TrimSpace(c.Name)
  cardProperties[name] = map[string]interface{}{
    "type":              "string",
    "title":             strings.ToUpper(name),  // 字段标签
    "x-decorator":       "FormItem",             // 使用 FormItem 包装
    "x-component":       "Input",                // 渲染为只读输入框
    "x-component-props": map[string]interface{}{"readOnly": true},
    "x-index":           i,                      // 字段顺序
  }
}

// ArrayCards schema 结构
schema = {
  "type": "object",
  "properties": {
    "list": {
      "type": "array",
      "x-component": "ArrayCards",
      "items": {
        "type": "object",
        "properties": cardProperties,  // 卡片内部字段定义
      },
    },
  },
}
```

**ArrayTable vs ArrayCards 的 schema 差异**:
- **ArrayTable**: `x-component-props.columns` 包含表格列配置（纯数据结构）
- **ArrayCards**: `items.properties` 包含完整的 Formily 字段定义（每个字段都是独立的 Formily schema）

这样生成的 ArrayCards 会为每条数据渲染一个卡片，卡片内包含所有字段的 FormItem + Input 组合。

## 测试建议

1. **多页面生成**: 同时选中 3 种页面类型，确认生成 3 个页面
2. **移动端列表**: 生成移动端列表页，测试下拉刷新和上拉加载
3. **移动端卡片字段**: 确认卡片内所有字段都正确显示
4. **Web 端列表**: 生成 Web 端列表页，确认传统分页正常
5. **数据接口**: 确认每个页面的 DataInterface 和 Dataset 正确创建
6. **跳转链接**: 列表页点击行应跳转到详情页（如果同时生成了详情页）

## 文件清单

### 前端
- `form-app/src/console/PagesPanel.tsx` - 生成面板 UI
- `form-app/src/runtime/ListRenderer.tsx` - 列表渲染组件（新增移动端模式）
- `form-app/src/runtime/MultiPageRuntime.tsx` - 运行时（传递 mode）

### 后端
- `server/api/form_app.go` - RegenerateSinglePage 函数（多页面 + 平台类型）
- `server/api/form_app.go` - buildGeneratedListDesignSchema 函数（根据平台类型生成不同 schema）
- `server/api/form_app.go` - 列表页生成逻辑（新增 field_definitions 生成）

## 后续优化建议

1. 移动端下拉刷新可使用原生手势库（如 better-scroll）提升体验
2. 支持自定义卡片模板（字段排列方式、样式等）
3. 支持配置上拉加载的触发距离阈值
4. 列表页支持搜索条件持久化
5. 移动端支持虚拟滚动优化大数据量性能
6. 支持选择性显示字段（而非全部字段）
