# 动态 SQL 查询系统使用指南

> ⚠️ **占位符语法已升级（2026-06）**：命名参数统一改用 `{{name}}`，弃用旧的 `:name`。
> `{{name}}` 天生可选——参数缺失则自动剔除其所在条件子句（`AND`/`OR`/`WHERE` 边界推断），不再需要 `/*? ... ?*/`（旧块仍兼容）。
> 底层仍为参数化绑定。下文示例中的 `:name` 与 `/*? ?*/` 请按此规则替换为 `{{name}}`。

本文档介绍 app-manager 数据栈中的动态 SQL 查询功能，包括可选参数、分页、排序等特性。

## 目录

1. [可选参数 - 动态条件查询](#可选参数)
2. [分页查询](#分页查询)
3. [排序查询](#排序查询)
4. [单条查询](#单条查询)
5. [完整示例](#完整示例)
6. [API 集成](#api-集成)

---

## 可选参数

### 语法

使用 `/*? ... ?*/` 注释语法标记可选的查询条件块：

```sql
SELECT * FROM users 
WHERE 1=1
  /*? AND name = :name ?*/
  /*? AND age > :min_age ?*/
  /*? AND status = :status ?*/
ORDER BY id DESC
```

### 工作原理

- **参数存在**：保留整个条件块
- **参数缺失**：移除整个条件块（包括 `AND`）

### 示例

**SQL 定义：**
```sql
SELECT * FROM products
WHERE 1=1
  /*? AND category_id = :category_id ?*/
  /*? AND price >= :min_price ?*/
  /*? AND price <= :max_price ?*/
  /*? AND name LIKE :keyword ?*/
ORDER BY created_at DESC
```

**场景 1：传入所有参数**
```json
{
  "param_values": {
    "category_id": 5,
    "min_price": 100,
    "max_price": 1000,
    "keyword": "%手机%"
  }
}
```

**实际执行的 SQL：**
```sql
SELECT * FROM products
WHERE 1=1
  AND category_id = ?
  AND price >= ?
  AND price <= ?
  AND name LIKE ?
ORDER BY created_at DESC
```

**场景 2：只传部分参数**
```json
{
  "param_values": {
    "category_id": 5,
    "keyword": "%手机%"
  }
}
```

**实际执行的 SQL：**
```sql
SELECT * FROM products
WHERE 1=1
  AND category_id = ?


  AND name LIKE ?
ORDER BY created_at DESC
```

价格范围条件被自动移除。

---

## 分页查询

### 方式 1：页码分页（推荐）

```json
{
  "param_values": {},
  "query_options": {
    "page": 2,
    "page_size": 20
  }
}
```

- `page`：页码，从 1 开始
- `page_size`：每页条数（最大 5000，默认 20）

**自动转换为：**
```sql
... LIMIT 20 OFFSET 20
```

### 方式 2：直接 LIMIT/OFFSET

```json
{
  "query_options": {
    "limit": 50,
    "offset": 100
  }
}
```

**自动转换为：**
```sql
... LIMIT 50 OFFSET 100
```

---

## 排序查询

### 单字段排序

```json
{
  "query_options": {
    "order_by": "created_at",
    "order_dir": "DESC"
  }
}
```

**生成：**
```sql
... ORDER BY created_at DESC
```

### 多字段排序

```json
{
  "query_options": {
    "multi_order": [
      {"field": "status", "dir": "ASC"},
      {"field": "priority", "dir": "DESC"},
      {"field": "created_at", "dir": "DESC"}
    ]
  }
}
```

**生成：**
```sql
... ORDER BY status ASC, priority DESC, created_at DESC
```

### 表名.列名格式

```json
{
  "query_options": {
    "order_by": "o.created_at",
    "order_dir": "DESC"
  }
}
```

适用于多表 JOIN 查询。

---

## 单条查询

### 方式 1：fetch_one 选项

```json
{
  "param_values": {
    "email": "admin@example.com"
  },
  "query_options": {
    "fetch_one": true
  }
}
```

自动添加 `LIMIT 1`，返回单个对象而非数组。

### 方式 2：使用 QueryOneRow API

```go
row, sql, args, err := QueryOneRow(db, "mysql", sqlStr, params)
if err != nil {
    // 处理错误
}
if row == nil {
    // 没有找到记录
}
```

---

## 完整示例

### 示例 1：电商订单查询

**数据集 SQL：**
```sql
SELECT 
  o.id,
  o.order_no,
  o.total_amount,
  o.status,
  o.created_at,
  u.name as user_name,
  u.email as user_email
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE 1=1
  /*? AND o.created_at >= :start_date ?*/
  /*? AND o.created_at <= :end_date ?*/
  /*? AND o.status = :status ?*/
  /*? AND o.user_id = :user_id ?*/
  /*? AND o.total_amount >= :min_amount ?*/
  /*? AND o.order_no LIKE :order_no_keyword ?*/
```

**请求示例 1：查询指定用户的所有待支付订单（第一页）**
```json
{
  "param_values": {
    "user_id": 123,
    "status": "pending"
  },
  "query_options": {
    "page": 1,
    "page_size": 20,
    "order_by": "created_at",
    "order_dir": "DESC"
  }
}
```

**请求示例 2：按时间范围和金额筛选**
```json
{
  "param_values": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "min_amount": 1000
  },
  "query_options": {
    "page": 1,
    "page_size": 50,
    "multi_order": [
      {"field": "total_amount", "dir": "DESC"},
      {"field": "created_at", "dir": "DESC"}
    ]
  }
}
```

### 示例 2：设备监控查询

**数据集 SQL：**
```sql
SELECT 
  d.*,
  g.name as group_name,
  TIMESTAMPDIFF(MINUTE, d.last_online_at, NOW()) as offline_minutes
FROM devices d
LEFT JOIN device_groups g ON d.device_group_id = g.id
WHERE 1=1
  /*? AND d.device_group_id = :group_id ?*/
  /*? AND d.status IN (:status_list) ?*/
  /*? AND (d.serial_number LIKE :keyword OR d.name LIKE :keyword) ?*/
  /*? AND d.last_online_at >= :online_since ?*/
```

**请求示例：查询特定分组的在线设备**
```json
{
  "param_values": {
    "group_id": 5,
    "status_list": [1, 2],
    "online_since": "2024-06-01"
  },
  "query_options": {
    "page": 1,
    "page_size": 100,
    "order_by": "last_online_at",
    "order_dir": "DESC"
  }
}
```

### 示例 3：用户详情单条查询

**数据集 SQL：**
```sql
SELECT 
  u.*,
  COUNT(o.id) as order_count,
  SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE 1=1
  /*? AND u.id = :user_id ?*/
  /*? AND u.email = :email ?*/
GROUP BY u.id
```

**请求示例：**
```json
{
  "param_values": {
    "email": "user@example.com"
  },
  "query_options": {
    "fetch_one": true
  }
}
```

---

## API 集成

### 后端集成

在 `DebugDataset` 或数据接口执行中使用：

```go
// 解析请求
var body struct {
    ParamValues  json.RawMessage `json:"param_values"`
    QueryOptions json.RawMessage `json:"query_options"`
}
c.ShouldBindJSON(&body)

// 解析参数
params, _ := parseFlexibleParamValues(body.ParamValues)
opts, _ := ParseQueryOptions(body.QueryOptions)

// 执行查询
rows, usedSQL, args, err := QueryDatasetWithOptions(
    db, 
    dataSource.Type, 
    dataset.Definition, 
    params, 
    opts,
)

// 返回结果
c.JSON(200, gin.H{
    "data": rows,
    "sql": usedSQL,
    "arg_count": len(args),
})
```

### 前端集成（Vue 3）

```vue
<template>
  <div>
    <!-- 参数输入 -->
    <el-form :model="form">
      <el-form-item label="分类ID">
        <el-input v-model="form.params.category_id" />
      </el-form-item>
      <el-form-item label="最低价格">
        <el-input-number v-model="form.params.min_price" />
      </el-form-item>
      <el-form-item label="关键词">
        <el-input v-model="form.params.keyword" />
      </el-form-item>
    </el-form>

    <!-- 查询选项 -->
    <el-form :model="form.options">
      <el-form-item label="排序字段">
        <el-select v-model="form.options.order_by">
          <el-option label="创建时间" value="created_at" />
          <el-option label="价格" value="price" />
          <el-option label="销量" value="sales" />
        </el-select>
      </el-form-item>
      <el-form-item label="排序方向">
        <el-radio-group v-model="form.options.order_dir">
          <el-radio label="ASC">升序</el-radio>
          <el-radio label="DESC">降序</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="form.options.page"
      v-model:page-size="form.options.page_size"
      :total="total"
      @change="executeQuery"
    />

    <!-- 执行按钮 -->
    <el-button @click="executeQuery">执行查询</el-button>

    <!-- 结果展示 -->
    <el-table :data="results">
      <!-- 列定义 -->
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { debugDataset } from '@/api/dataset'

const form = reactive({
  params: {
    category_id: null,
    min_price: null,
    keyword: null
  },
  options: {
    page: 1,
    page_size: 20,
    order_by: 'created_at',
    order_dir: 'DESC'
  }
})

const results = ref([])
const total = ref(0)

const executeQuery = async () => {
  // 过滤掉空值参数
  const params = Object.fromEntries(
    Object.entries(form.params).filter(([k, v]) => v != null && v !== '')
  )

  const { data } = await debugDataset(datasetId, {
    param_values: params,
    query_options: form.options
  })

  results.value = JSON.parse(data.data)
  total.value = data.total || 0
}
</script>
```

---

## 最佳实践

### 1. WHERE 1=1 模式

始终使用 `WHERE 1=1` 作为基础条件，所有动态条件都用 `AND` 连接：

```sql
SELECT * FROM users
WHERE 1=1
  /*? AND status = :status ?*/
  /*? AND age > :min_age ?*/
```

### 2. 必需参数放在外面

只把可选参数放在 `/*? ?*/` 块中，必需参数直接写在 WHERE 后：

```sql
SELECT * FROM orders
WHERE user_id = :user_id  -- 必需参数
  /*? AND status = :status ?*/  -- 可选参数
```

### 3. 复杂条件组合

可以在一个块中包含多个参数的复杂条件：

```sql
/*? AND created_at BETWEEN :start_date AND :end_date ?*/
/*? AND (name LIKE :keyword OR description LIKE :keyword) ?*/
```

只有块内所有参数都存在时，条件才会保留。

### 4. IN 操作符

IN 操作符也支持动态参数：

```sql
/*? AND status IN (:status_list) ?*/
```

### 5. 安全性

- 所有参数都会被正确转义，防止 SQL 注入
- 排序字段名会被验证，只允许合法的列名
- 分页参数有最大值限制（5000）

---

## 注意事项

1. **参数命名**：使用 `:name` 格式，名称只能包含字母、数字、下划线
2. **空格处理**：`/*? ... ?*/` 中的前后空格会被自动去除
3. **多参数块**：一个块内的所有参数必须同时存在，条件才会保留
4. **性能**：避免在大表上不加任何筛选条件的查询
5. **SQL 原有的 LIMIT/ORDER BY**：如果原 SQL 已有，不会重复添加

---

## 故障排查

### 问题：参数没有生效

**检查：**
1. 参数名是否完全匹配（区分大小写）
2. `param_values` 是否正确传递
3. 是否在 `/*? ?*/` 块中

### 问题：排序不生效

**检查：**
1. 列名是否有效（不含特殊字符）
2. 原 SQL 是否已有 ORDER BY
3. `order_dir` 是否为 ASC 或 DESC

### 问题：分页结果不对

**检查：**
1. `page` 是否从 1 开始
2. `page_size` 是否超过限制
3. 原 SQL 是否已有 LIMIT

---

## 版本历史

- **v1.0** (2024-06-09): 初始版本
  - 可选参数支持
  - 分页、排序、单条查询
  - 多方言支持（MySQL, PostgreSQL, SQLite, SQL Server）
