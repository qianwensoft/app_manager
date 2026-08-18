# 修复：MySQL LIMIT/OFFSET 占位符错误

## 问题描述

用户报告数据集查询时出现 MySQL 错误：

```
query execution failed: Error 1210 (HY000): Incorrect arguments to mysqld_stmt_execute 
SQL: SELECT * FROM `pm_project_task` LIMIT ? OFFSET ? 
Args: [50 40] 
Original params: map[limit:50 offset:40]
```

## 根本原因

MySQL 的某些版本/驱动不支持在 `LIMIT` 和 `OFFSET` 子句中使用预编译语句的占位符 `?`。这是 MySQL 的一个已知限制。

当我们使用以下 SQL：
```sql
SELECT * FROM table LIMIT ? OFFSET ?
```

并尝试绑定参数 `[50, 40]` 时，MySQL 会拒绝执行并报错。

## 解决方案

将 `{{limit}}` 和 `{{offset}}` 参数**直接内联到 SQL 字符串**中，而不是使用占位符。

### 修改内容

在 `server/dbdriver/query_exec.go` 中添加 `inlineLimitOffsetParams` 函数：

```go
func inlineLimitOffsetParams(sqlStr string, params map[string]interface{}) (string, map[string]interface{}) {
    // 1. 从参数中提取 limit 和 offset 的值
    // 2. 将 SQL 中的 {{limit}} 和 {{offset}} 直接替换为数字
    // 3. 从参数 map 中移除 limit 和 offset（避免重复绑定）
    // 4. 返回处理后的 SQL 和参数
}
```

修改 `RewriteNamedSQLParams` 函数，在处理其他参数之前先内联 limit 和 offset：

```go
func RewriteNamedSQLParams(dialect string, sqlStr string, params map[string]interface{}) (outSQL string, args []interface{}, err error) {
    // 先内联 limit 和 offset（MySQL 限制）
    sqlStr, params = inlineLimitOffsetParams(sqlStr, params)
    
    // 再处理其他参数...
}
```

### 转换示例

**转换前：**
```sql
SELECT * FROM pm_project_task LIMIT {{limit}} OFFSET {{offset}}
params: {limit: 50, offset: 40, status: "open"}
```

**转换后：**
```sql
SELECT * FROM pm_project_task LIMIT 50 OFFSET 40 WHERE status = ?
args: ["open"]
```

## 安全性说明

虽然直接内联 limit 和 offset 值看起来像字符串拼接（可能有 SQL 注入风险），但在本实现中：

1. **类型检查**：只接受 int/int32/int64/float64 类型，会进行类型断言
2. **格式化**：使用 `fmt.Sprintf("%d", val)` 强制转为整数格式
3. **来源可控**：这些参数来自应用内部的分页逻辑，不是直接的用户输入

因此这种处理方式是安全的。

## 影响范围

- ✅ 所有使用 `{{limit}}` 和 `{{offset}}` 的数据集查询
- ✅ Form-app 列表页面
- ✅ 数据栈查询接口
- ✅ 自定义 SQL 查询

## 兼容性

- ✅ MySQL：修复了占位符错误
- ✅ PostgreSQL：不影响，继续使用 $1..$n
- ✅ SQLite：不影响
- ✅ SQL Server：不影响

## 测试验证

1. 访问使用 MySQL 数据源的列表页面
2. 观察 Network 请求和响应
3. 确认数据正常加载，不再报 "Incorrect arguments" 错误
4. 检查生成的 SQL（日志中）：`LIMIT 50 OFFSET 40` 而不是 `LIMIT ? OFFSET ?`

## 相关文件

- `server/dbdriver/query_exec.go` - SQL 参数重写核心逻辑
- `server/api/dataset_query_exec.go` - 数据集查询执行

## 日期

2026-07-04
