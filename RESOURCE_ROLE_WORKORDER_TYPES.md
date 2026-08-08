# 资源角色 - 工单类型直接分配功能

## 功能概述

资源角色现在支持直接分配工单类型，而不仅仅通过"工单管理"节点配置。这提供了更灵活的权限管理方式。

## 后端实现

### 1. 数据模型 (`server/models/resource_center.go`)

新增关联表模型：

```go
// ResourceRoleWorkOrderType 资源角色 - 工单类型 关联（直接授权工单类型，独立于节点配置）。
type ResourceRoleWorkOrderType struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RoleID    uint      `gorm:"uniqueIndex:idx_role_wotype;index" json:"role_id"`
	TypeCode  string    `gorm:"uniqueIndex:idx_role_wotype;size:64;index" json:"type_code"`
	CreatedAt time.Time `json:"created_at"`
}
```

### 2. 数据库迁移 (`server/database/db.go`)

在 Group 12（资源中心）中添加了新模型的自动迁移：

```go
&models.ResourceRoleWorkOrderType{},
```

### 3. API 端点 (`server/api/resource_center.go`)

#### 新增函数

- **`SetResourceRoleWorkOrderTypes`**: 全量替换角色授权的工单类型集合
  - 路由: `PUT /api/resource-center/roles/:id/work-order-types`
  - 请求体: `{ "type_codes": ["code1", "code2", ...] }`
  - 响应: `{ "ok": true }`

#### 修改函数

- **`GetResourceRoles`**: 返回值中增加 `work_order_type_codes` 字段

### 4. 路由注册 (`server/api/router.go`)

```go
rc.PUT("/roles/:id/work-order-types", SetResourceRoleWorkOrderTypes)
```

## 前端实现

### 1. API 调用 (`web/src/api/resourceCenter.js`)

```javascript
export const setResourceRoleWorkOrderTypes = (id, typeCodes) =>
  http.put(`/resource-center/roles/${id}/work-order-types`, { type_codes: typeCodes })
```

### 2. UI 组件 (`web/src/views/resource-center/ResourceRoles.vue`)

#### 表格列

- 新增"工单类型"列，显示已授权的工单类型数量

#### 操作按钮

- 新增"工单类型"按钮，打开工单类型授权对话框

#### 工单类型授权对话框

- 以复选框列表形式展示所有工单类型
- 显示类型名称和编码
- 支持多选
- 保存后全量替换角色的工单类型授权

## 使用方法

1. 进入"资源中心" -> "资源角色"页面
2. 找到需要授权的角色，点击"工单类型"按钮
3. 在弹出的对话框中勾选需要授权的工单类型
4. 点击"保存"按钮完成授权

## 数据流程

```
用户操作
  ↓
前端调用 setResourceRoleWorkOrderTypes(roleId, typeCodes)
  ↓
后端 SetResourceRoleWorkOrderTypes 处理
  ↓
事务处理：
  1. 删除该角色的所有工单类型关联
  2. 插入新的工单类型关联
  ↓
返回成功响应
  ↓
前端刷新角色列表，显示最新数据
```

## 数据库表

### resource_role_work_order_types

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | 主键 |
| role_id | uint | 资源角色 ID |
| type_code | string | 工单类型编码 |
| created_at | timestamp | 创建时间 |

- 唯一索引: `(role_id, type_code)`

## API 示例

### 设置工单类型

```bash
curl -X PUT http://localhost:8080/api/resource-center/roles/1/work-order-types \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type_codes": ["maintenance", "repair", "inspection"]
  }'
```

### 获取角色列表（含工单类型）

```bash
curl http://localhost:8080/api/resource-center/roles \
  -H "Authorization: Bearer <token>"
```

响应示例：

```json
{
  "data": [
    {
      "id": 1,
      "name": "运维角色",
      "code": "ops",
      "work_order_type_codes": ["maintenance", "repair"],
      ...
    }
  ]
}
```

## 注意事项

1. 工单类型编码（type_code）必须与 `work_order_types` 表中的 `code` 字段对应
2. 每次保存都是全量替换，不是增量更新
3. 空数组表示清空该角色的所有工单类型授权
4. 需要管理员（admin）权限才能操作

## 相关文件

### 后端
- `server/models/resource_center.go` - 数据模型
- `server/database/db.go` - 数据库迁移配置
- `server/api/resource_center.go` - API 实现
- `server/api/router.go` - 路由配置

### 前端
- `web/src/api/resourceCenter.js` - API 调用
- `web/src/views/resource-center/ResourceRoles.vue` - UI 组件

## 测试建议

1. 创建测试角色
2. 创建几个工单类型
3. 测试分配工单类型到角色
4. 验证角色列表正确显示工单类型数量
5. 测试修改和清空工单类型授权
6. 验证数据库中关联表的正确性
