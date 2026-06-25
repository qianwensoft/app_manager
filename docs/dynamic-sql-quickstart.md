# 动态 SQL 快速开始

> ⚠️ **占位符语法已升级（2026-06）**：命名参数统一改用 `{{name}}`，弃用旧的 `:name`。
> `{{name}}` **天生可选**——参数存在则参数化绑定，缺失则自动剔除其所在条件子句（按 `AND`/`OR`/`WHERE` 边界推断），
> 不再需要 `/*? ... ?*/` 显式标记（旧块仍兼容）。底层仍是参数化绑定（`?`/`$N`），防注入不变。

## 5 分钟快速上手

### 1. 编写带可选参数的 SQL

直接用 `{{name}}` 书写条件，缺失的参数会让对应条件自动消失：

```sql
SELECT * FROM products
WHERE 1=1
  AND category_id = {{category_id}}
  AND price >= {{min_price}}
  AND price <= {{max_price}}
  AND name LIKE {{keyword}}
ORDER BY id DESC
```

<!-- 旧写法（仍兼容，但不再推荐）：
SELECT * FROM products
WHERE 1=1
  /*? AND category_id = :category_id ?*/
  /*? AND price >= :min_price ?*/
  /*? AND price <= :max_price ?*/
  /*? AND name LIKE :keyword ?*/
ORDER BY id DESC
-->

### 2. 执行查询

**只传部分参数：**
```bash
curl -X POST http://localhost:8080/api/datasets/1/debug \
  -H "Content-Type: application/json" \
  -d '{
    "param_values": {
      "category_id": 5,
      "keyword": "%手机%"
    },
    "query_options": {
      "page": 1,
      "page_size": 20,
      "order_by": "price",
      "order_dir": "DESC"
    }
  }'
```

**实际执行的 SQL：**
```sql
SELECT * FROM products
WHERE 1=1
  AND category_id = ?
  AND name LIKE ?
ORDER BY price DESC
LIMIT 20 OFFSET 0
```

价格范围条件自动被移除！

### 3. 常用场景

#### 场景 1：列表查询（分页 + 排序）

```json
{
  "param_values": {
    "status": "active"
  },
  "query_options": {
    "page": 1,
    "page_size": 20,
    "order_by": "created_at",
    "order_dir": "DESC"
  }
}
```

#### 场景 2：详情查询（单条）

```json
{
  "param_values": {
    "id": 123
  },
  "query_options": {
    "fetch_one": true
  }
}
```

#### 场景 3：多字段排序

```json
{
  "query_options": {
    "multi_order": [
      {"field": "priority", "dir": "DESC"},
      {"field": "created_at", "dir": "ASC"}
    ]
  }
}
```

## 语法规则

### ✅ 正确用法

```sql
-- ✓ 可选的 AND 条件
/*? AND status = :status ?*/

-- ✓ 可选的复杂条件
/*? AND (name LIKE :keyword OR description LIKE :keyword) ?*/

-- ✓ 可选的时间范围
/*? AND created_at BETWEEN :start_date AND :end_date ?*/

-- ✓ 可选的 IN 条件
/*? AND id IN (:id_list) ?*/
```

### ❌ 错误用法

```sql
-- ✗ 不要在 WHERE 关键字前使用
WHERE /*? status = :status ?*/

-- ✗ 不要省略 AND
/*? status = :status ?*/

-- ✗ 不要在 SELECT 中使用
SELECT id, name /*? , email ?*/ FROM users
```

## 更多资料

- 📖 **完整指南**: `docs/dynamic-sql-guide.md`
- 🔧 **技术实现**: `docs/dynamic-sql-implementation.md`
- 🎯 **测试用例**: `server/api/dataset_dynamic_sql_test.go`
- 🖥️ **前端界面**: `web/src/components/DatasetQueryTester.vue`

## 示例数据集

创建一个示例数据集体验功能：

**SQL：**
```sql
SELECT 
  o.id,
  o.order_no,
  o.total_amount,
  o.status,
  u.name as user_name
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE 1=1
  /*? AND o.status = :status ?*/
  /*? AND o.user_id = :user_id ?*/
  /*? AND o.total_amount >= :min_amount ?*/
```

**测试查询 1：查询指定用户的订单**
```json
{"param_values": {"user_id": 123}}
```

**测试查询 2：查询大额订单**
```json
{"param_values": {"min_amount": 1000}}
```

**测试查询 3：查询指定用户的待支付订单**
```json
{
  "param_values": {
    "user_id": 123,
    "status": "pending"
  }
}
```

每个查询只会使用传入的参数，其他条件自动忽略！

---

**问题反馈**: 如遇问题，请查看完整文档或提交 issue。
