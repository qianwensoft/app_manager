# 资源角色设备授权问题修复

## 问题描述

1. **数据库表缺失错误**：
   ```
   Error 1146 (42S02): Table 'app_manager.resource_role_device_groups' doesn't exist
   ```

2. **设备分组列表为空**：在资源角色的「设备授权」对话框中，设备分组树显示为空。

## 根本原因

### 问题 1：缺失的数据库表

在 `server/database/db.go` 的 `migrateGroups` 中，Group 12（资源中心）缺少了两个模型：
- `ResourceRoleDevice` - 资源角色与单独设备的关联表
- `ResourceRoleDeviceGroup` - 资源角色与设备分组的关联表

这导致 GORM AutoMigrate 时没有创建这两张表，但代码在运行时尝试查询这些表，从而报错。

### 问题 2：API 响应字段不匹配

后端 `ListDeviceGroupsTree` 接口返回：
```go
gin.H{"items": buildGroupTree(rows, nil)}
```

但前端期望：
```javascript
const deviceGroupTree = (await getDeviceGroupsTree()).data || []
```

字段不匹配（`items` vs `data`），导致前端无法正确解析设备分组数据。

## 修复方案

### 修复 1：添加缺失的模型到 AutoMigrate

**文件**：`server/database/db.go`

**修改**：在 Group 12 中添加缺失的模型

```go
// Group 12 — resource center (资源中心)
{
    &models.ResourceNode{},
    &models.ResourceRole{},
    &models.ResourceRoleNode{},
    &models.ResourceRoleUser{},
    &models.ResourceRoleDevice{},           // ✅ 新增
    &models.ResourceRoleDeviceGroup{},      // ✅ 新增
},
```

### 修复 2：统一 API 响应字段

**文件**：`server/api/org.go`

**修改**：将返回字段从 `items` 改为 `data`

```go
func ListDeviceGroupsTree(c *gin.Context) {
    var rows []models.DeviceGroup
    database.DB.Order("sort_order ASC, id ASC").Find(&rows)
    c.JSON(http.StatusOK, gin.H{"data": buildGroupTree(rows, nil)})  // ✅ items → data
}
```

## 验证步骤

### 1. 重新构建服务器
```bash
cd /Volumes/data/workspace/qianwen/app-manager
make server-only
```

### 2. 启动服务器
```bash
./bin/app-manager server/config.sqlite.yaml
```

服务器启动时会自动执行 AutoMigrate，创建缺失的表：
- `resource_role_devices`
- `resource_role_device_groups`

### 3. 测试功能

1. 打开资源中心 → 资源角色页面
2. 点击任意角色的「设备授权」按钮
3. 验证：
   - ✅ 不再报数据库表不存在错误
   - ✅ 「设备分组」标签页正确显示设备分组树
   - ✅ 可以勾选设备分组并保存
   - ✅ 「单独设备」标签页正确显示设备列表

## 相关代码文件

- `server/database/db.go` - 数据库迁移配置
- `server/models/resource_center.go` - 资源中心模型定义
- `server/api/org.go` - 设备分组 API
- `server/api/resource_center.go` - 资源角色 API
- `web/src/views/resource-center/ResourceRoles.vue` - 资源角色管理页面
- `web/src/api/resourceCenter.js` - 资源中心前端 API

## 注意事项

### 对于已有数据库

如果数据库已经在运行且缺少这两张表，重启服务器后 GORM 会自动创建它们。无需手动执行 SQL。

### SQLite vs MySQL

- **SQLite**：AutoMigrate 顺序执行，启动稍慢但安全
- **MySQL**：AutoMigrate 并发执行，启动快速

两种数据库都会正确创建表结构。

## 总结

本次修复解决了资源角色功能的两个关键问题：
1. ✅ 修复了缺失的数据库表导致的运行时错误
2. ✅ 修复了 API 响应字段不匹配导致的前端显示问题

修复后，资源角色的设备授权功能可以正常使用，包括：
- 授权整个设备分组
- 授权单独设备
- 查看和管理已授权的设备
