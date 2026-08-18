# 修复：列表接口缺少 pagination 配置导致"缺少参数 {{limit}}"错误

## 问题描述

用户反馈自动生成的列表页面在加载数据时报错：
```
SQL rewrite failed: 缺少参数 {{limit}}
Original SQL: SELECT * FROM `wms_stock_batch` LIMIT {{limit}} OFFSET {{offset}}
Params: map[]
```

## 根本原因

1. **自动生成的列表接口 SQL** 包含 `{{limit}}` 和 `{{offset}}` 占位符
2. **前端运行时** 传递的是 `page` 和 `page_size` 参数（标准分页参数）
3. **后端运行时逻辑** 需要读取接口 `schema_json` 中的 `pagination` 配置，才会自动将 `page`/`page_size` 转换为 `limit`/`offset`
4. **旧版本自动生成的接口 `schema_json` 缺少 `pagination` 配置**，导致参数转换未执行

## 修复内容

### 1. 后端代码修复 (`server/api/form_app.go`)

#### 修复点 1：`GenerateFormAppPagesFromTable` 函数
- 为列表接口单独创建 `listIfaceMeta`，包含完整的 `pagination` 配置
- 为详情/提交接口创建独立的 `detailIfaceMeta`
- 确保每个接口使用正确的元数据

```go
listIfaceMeta := map[string]interface{}{
    "schema_version": "1.0.0",
    "generated_at":   time.Now().Format(time.RFC3339),
    "pagination": map[string]interface{}{
        "pageParam":       "page",
        "pageSizeParam":   "page_size",
        "limitParam":      "limit",
        "offsetParam":     "offset",
        "defaultPageSize": 10,
    },
}
```

#### 修复点 2：`RegenerateSinglePage` 函数
列表接口的 `SchemaJSON` 从简单的 `{"schema_version":"1.0.0"}` 改为包含完整 `pagination` 配置的 JSON。

### 2. 前端增强 (`form-app/src/pages/PageEditorPage.tsx`)

在页面编辑器中添加**「页面跳转」配置面板**，让用户可以：
- 查看当前页面的所有跳转（`row_click`、`button_click`）
- 新增/编辑/删除跳转规则
- 配置参数映射（支持 `$row.xxx` 和 `$url.xxx` 占位符）

这样用户就可以在布局编辑器中看到并管理表格自动生成的跳转，不再需要在多个地方查找。

## 解决方案

### 方案 A：重新生成页面（推荐）

1. 重新构建并启动服务器（已包含修复）
2. 在 form-app 管理后台，删除旧的列表页
3. 重新从数据表生成页面
4. 新生成的接口会自动包含 `pagination` 配置

### 方案 B：修复现有接口

如果不想重新生成页面，可以手动更新现有接口的 `schema_json`：

1. 使用提供的 SQL 脚本：`fix_list_pagination.sql`
2. 先执行查询语句，确认需要修复的接口
3. 执行更新语句（MySQL 或 SQLite 版本）

**注意**：执行前请先备份数据库！

## 验证步骤

1. 重新启动服务器
2. 打开浏览器开发者工具 Network 面板
3. 访问列表页面
4. 检查请求 Payload：
   - `param_values` 应包含 `page` 和 `page_size`
5. 检查响应：应成功返回数据，不再报"缺少参数"错误

## 技术细节

### 参数转换流程

```
前端 ListRenderer
  └─> onQuery({ page: 1, page_size: 10, ...queryParams })
      └─> MultiPageRuntime
          └─> POST /api/form-app/runtime/query
              {
                "interface_code": "xxx_list_123",
                "param_values": { "page": 1, "page_size": 10 }
              }
              └─> 后端 FormAppRuntimeQuery
                  └─> mergeRuntimeSchemaParams() 
                      读取 interface.schema_json.pagination 配置
                      └─> 转换参数
                          page=1, page_size=10
                          ↓
                          limit=10, offset=0
                      └─> QueryDatasetSQL
                          SELECT * FROM table LIMIT {{limit}} OFFSET {{offset}}
                          ↓
                          SELECT * FROM table LIMIT ? OFFSET ?
                          args: [10, 0]
```

### Pagination 配置结构

```json
{
  "schema_version": "1.0.0",
  "pagination": {
    "pageParam": "page",           // 前端传递的页码参数名
    "pageSizeParam": "page_size",  // 前端传递的每页大小参数名
    "limitParam": "limit",         // SQL 中的 LIMIT 参数名
    "offsetParam": "offset",       // SQL 中的 OFFSET 参数名
    "defaultPageSize": 10          // 默认每页大小
  }
}
```

## 影响范围

- ✅ 新生成的列表页面：自动包含正确配置
- ⚠️ 旧版本生成的列表页面：需要重新生成或手动修复
- ✅ 详情页面：无影响（不使用分页）
- ✅ 表单页面：无影响（不使用分页）

## 相关文件

- `server/api/form_app.go` - 后端接口生成逻辑
- `form-app/src/runtime/ListRenderer.tsx` - 前端列表渲染器
- `form-app/src/runtime/MultiPageRuntime.tsx` - 前端运行时入口
- `form-app/src/pages/PageEditorPage.tsx` - 页面编辑器（新增跳转配置）
- `fix_list_pagination.sql` - 数据库修复脚本

## 日期

2026-07-04
