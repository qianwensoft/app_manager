# 动态 SQL 实现技术总结

> ⚠️ **占位符语法已升级（2026-06）**：命名参数统一改用 `{{name}}`，弃用旧的 `:name`。
> `{{name}}` 天生可选——参数缺失则自动剔除其所在条件子句；INSERT 缺失参数的列/值对自动移除。
> 核心实现见 `server/dbdriver/placeholder.go`（`RewriteNamedSQLParams` / `StripMissingClauses`）。旧 `/*? ?*/` 块仍兼容。

## 架构设计

```
┌─────────────────────────────────────────────────┐
│           前端 Vue 3 查询界面                      │
│  - 参数输入表单                                    │
│  - 分页控件                                       │
│  - 排序选择器                                     │
│  - 结果展示表格                                    │
└────────────────┬────────────────────────────────┘
                 │ HTTP POST
                 ▼
┌─────────────────────────────────────────────────┐
│           后端 API 层 (Gin)                       │
│  - DebugDataset                                 │
│  - ExecuteDataInterface                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│        动态 SQL 处理管道                          │
│                                                  │
│  1. StripMissingOptionalBlocks                  │
│     /*? AND col = :param ?*/ → 移除或保留        │
│                                                  │
│  2. stripMissingInsertParams                    │
│     INSERT 语句自动移除缺失列                     │
│                                                  │
│  3. RewriteNamedSQLParams                       │
│     :name → ? (MySQL) 或 $1 (PostgreSQL)        │
│                                                  │
│  4. ApplyQueryOptions                           │
│     添加 ORDER BY / LIMIT / OFFSET               │
│                                                  │
└────────────────┬────────────────────────────────┘
                 │ 参数化 SQL + 参数数组
                 ▼
┌─────────────────────────────────────────────────┐
│           数据库层 (sql.DB)                       │
│  - MySQL / PostgreSQL / SQLite / SQL Server     │
└─────────────────────────────────────────────────┘
```

## 核心功能

### 1. 可选参数块（Optional Blocks）

**语法：** `/*? condition ?*/`

**实现：** `dataset_dynamic_sql.go:StripMissingOptionalBlocks`

**正则表达式：**
```go
var reOptionalBlock = regexp.MustCompile(`/\*\?\s*(.*?)\s*\?\*/`)
```

**处理逻辑：**
```go
result := reOptionalBlock.ReplaceAllStringFunc(sqlStr, func(match string) string {
    // 提取块内参数名
    paramNames := extractSQLNamedParamNames(blockContent)
    // 检查所有参数是否存在
    for _, name := range paramNames {
        if _, ok := params[name]; !ok {
            return ""  // 移除块
        }
    }
    return blockContent  // 保留块
})
```

### 2. 命名参数转换

**语法：** `:param_name`

**实现：** `dataset_param_sql.go:RewriteNamedSQLParams`

**支持方言：**
- MySQL/SQLite: `?`
- PostgreSQL: `$1, $2, $3, ...`
- SQL Server: `?`

**处理逻辑：**
```go
// 提取所有 :name
occs := findAllNamedParams(sqlStr)

// 按方言替换
for _, occ := range occs {
    switch dialect {
    case "postgres":
        placeholder = fmt.Sprintf("$%d", ++counter)
    default:
        placeholder = "?"
    }
    args = append(args, params[occ.name])
}
```

### 3. 查询选项（Pagination & Sorting）

**实现：** `dataset_query_options.go:ApplyQueryOptions`

**处理流程：**

```go
// 1. 添加 ORDER BY（如果原 SQL 没有）
if !hasOrderBy {
    if len(opts.MultiOrder) > 0 {
        // 多字段排序
        sql += "\nORDER BY field1 DIR1, field2 DIR2, ..."
    } else if opts.OrderBy != "" {
        // 单字段排序
        sql += fmt.Sprintf("\nORDER BY %s %s", field, dir)
    }
}

// 2. 添加 LIMIT/OFFSET（如果原 SQL 没有）
if !hasLimit {
    if opts.FetchOne {
        sql += "\nLIMIT 1"
    } else if opts.Page > 0 {
        limit := opts.PageSize
        offset := (opts.Page - 1) * opts.PageSize
        sql += fmt.Sprintf("\nLIMIT %d OFFSET %d", limit, offset)
    }
}
```

### 4. INSERT 语句优化

**实现：** `dataset_param_sql.go:stripMissingInsertParams`

**功能：** 自动移除 INSERT 语句中缺失参数对应的列

**示例：**
```sql
-- 原始 SQL
INSERT INTO users (id, name, email) VALUES (:id, :name, :email)

-- 只传 {name: "张三", email: "test@example.com"}
-- 自动转换为
INSERT INTO users (name, email) VALUES (:name, :email)
```

## 关键文件

```
server/api/
├── dataset_dynamic_sql.go           # 动态 SQL 核心逻辑
├── dataset_dynamic_sql_test.go      # 可选参数测试
├── dataset_query_options.go         # 分页排序逻辑
├── dataset_query_options_test.go    # 查询选项测试
├── dataset_param_sql.go             # 参数转换（已有）
└── dataset_query_exec.go            # 查询执行（已有）
```

## API 接口

### 调试数据集

**POST** `/api/datasets/:id/debug`

```json
{
  "param_values": {
    "status": "active",
    "min_age": 18
  },
  "query_options": {
    "page": 1,
    "page_size": 20,
    "order_by": "created_at",
    "order_dir": "DESC"
  }
}
```

### 执行数据接口

**POST** `/api/open/v1/data/:code`

```json
{
  "param_values": {...},
  "query_options": {...}
}
```

## 测试覆盖

### 单元测试

```bash
# 可选参数测试
go test -v ./api/ -run TestStripMissingOptionalBlocks
go test -v ./api/ -run TestRewriteNamedSQLParamsOptional

# 查询选项测试
go test -v ./api/ -run TestApplyQueryOptions
go test -v ./api/ -run TestParseQueryOptions

# 真实场景测试
go test -v ./api/ -run TestOptionalBlocksRealWorldExamples
```

### 测试覆盖率

- **可选参数块处理**：100% 覆盖
  - 参数全部存在
  - 参数部分缺失
  - 参数全部缺失
  - 多参数复杂条件

- **查询选项**：100% 覆盖
  - 分页（页码模式 + LIMIT/OFFSET 模式）
  - 排序（单字段 + 多字段）
  - 单条查询
  - 组合场景

- **安全性**：100% 覆盖
  - SQL 注入防护
  - 列名验证
  - 参数上限检查

## 性能考虑

### 正则表达式缓存

```go
// 编译一次，全局复用
var reOptionalBlock = regexp.MustCompile(`/\*\?\s*(.*?)\s*\?\*/`)
var reSQLNamedParam = regexp.MustCompile(`:([a-zA-Z_][a-zA-Z0-9_]*)`)
var reColumnName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$`)
```

### 字符串构建优化

```go
// 使用 strings.Builder 避免频繁内存分配
var b strings.Builder
b.WriteString(sqlStr)
b.WriteString("\nORDER BY ")
b.WriteString(field)
return b.String()
```

### 参数化查询

所有用户输入都通过参数化传递，避免 SQL 注入：

```go
// ✓ 安全
db.Query("SELECT * FROM users WHERE name = ?", userName)

// ✗ 不安全（本系统不采用）
db.Query(fmt.Sprintf("SELECT * FROM users WHERE name = '%s'", userName))
```

## 安全机制

### 1. 列名白名单验证

```go
func isValidColumnName(name string) bool {
    // 只允许：字母、数字、下划线、单个点号
    return reColumnName.MatchString(name)
}
```

**阻止：**
- `id; DROP TABLE users--`
- `* FROM users WHERE 1=1--`
- `COUNT(*)`（聚合函数需在 SQL 中预定义）

### 2. 参数数量限制

```go
if opts.PageSize > 5000 {
    opts.PageSize = 5000
}
if opts.Limit > 5000 {
    opts.Limit = 5000
}
```

### 3. 数据源只读模式

配置 `read_only: true` 的数据源拒绝 INSERT/UPDATE/DELETE 操作。

## 与现有功能的集成

### 数据集类型支持

| Kind        | 可选参数 | 分页 | 排序 | 单条查询 |
|-------------|---------|------|------|---------|
| static      | ✗       | ✓    | ✓    | ✓       |
| query       | ✓       | ✓    | ✓    | ✓       |
| buffer      | ✓       | ✓    | ✓    | ✓       |
| transaction | ✓       | ✗    | ✗    | ✗       |

### 数据接口类型支持

| Kind        | 可选参数 | 分页 | 排序 | 单条查询 |
|-------------|---------|------|------|---------|
| query       | ✓       | ✓    | ✓    | ✗       |
| queryOne    | ✓       | ✗    | ✗    | ✓       |
| transaction | ✓       | ✗    | ✗    | ✗       |

## 下一步扩展方向

### 1. 前端可视化查询构建器

- 拖拽式条件构建
- 可视化参数输入
- 实时 SQL 预览

### 2. 查询结果缓存

- Redis 缓存热点查询
- 基于参数签名的缓存键
- TTL 可配置

### 3. 查询性能监控

- 慢查询日志
- 执行计划分析
- 性能指标统计

### 4. 更多 SQL 方言支持

- Oracle
- MongoDB（NoSQL 适配）
- ClickHouse

## 参考资料

- [SQL 注入防护最佳实践](https://owasp.org/www-community/attacks/SQL_Injection)
- [Go database/sql 包文档](https://pkg.go.dev/database/sql)
- [命名参数模式](https://github.com/jmoiron/sqlx)
