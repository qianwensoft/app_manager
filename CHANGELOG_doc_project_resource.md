# 变更日志：文档项目资源管理集成

**日期：** 2026-09-17  
**版本：** v1.x (待发布)  
**类型：** Feature

## 概述

实现文档项目（Document Project）在资源管理（Resource Center）中的添加与授权功能，用户可通过资源角色控制文档项目的访问权限。

## 变更内容

### 1. 模型层 (Models)

**文件：** `server/models/resource_center.go`

#### 新增节点类型
- 在 `ResourceNode` 注释中新增 `doc_project` 节点类型说明

#### 扩展配置结构
- `ResourceNodeConfig` 新增字段：
  ```go
  ProjectCode string `json:"project_code,omitempty"`  // 文档项目的唯一标识
  ```
- 更新 `OpenMode` 注释，标明 `doc_project` 也支持此字段

**变更摘要：**
```diff
// ResourceNode 资源节点树
// NodeType:
+//   - doc_project     文档项目节点（ConfigJSON 含 project_code/open_mode）

type ResourceNodeConfig struct {
+   // doc_project（文档项目）
+   ProjectCode string `json:"project_code,omitempty"`
-   // scada/form_app/link 通用
+   // scada/form_app/doc_project/link 通用：嵌入方式
    OpenMode string `json:"open_mode,omitempty"`
}
```

### 2. API 层 (API)

**文件：** `server/api/resource_center.go`

#### 节点类型验证
- `normalizeNodeType()` 函数新增 `doc_project` 类型支持
  ```go
  case "group", "device_mgmt", "workorder_mgmt", "scada", "form_app", "doc_project", "link":
  ```

#### 前台资源树构建
- `buildEnrichedPortalTree()` 函数新增 `doc_project` 分支处理逻辑
- 查询关联的 `DocumentProject` 并附带发布状态：
  - `project_name` — 项目名称
  - `publish_status` — 0: 未发布, 1: 已发布
  - `share_token` — 免登录分享令牌

**变更摘要：**
```diff
func buildEnrichedPortalTree(...) {
    switch n.NodeType {
+   case "doc_project":
+       node["project_code"] = cfg.ProjectCode
+       node["open_mode"] = cfg.OpenMode
+       if cfg.ProjectCode != "" {
+           var proj models.DocumentProject
+           if err := database.DB.Where("code = ?", cfg.ProjectCode).
+               Select("publish_status", "share_token", "name").First(&proj).Error; err == nil {
+               node["publish_status"] = proj.PublishStatus
+               node["share_token"] = proj.ShareToken
+               node["project_name"] = proj.Name
+           }
+       }
    }
}
```

### 3. 测试 (Tests)

**新增文件：** `server/tests/resource_doc_project_test.go`

- `TestResourceNodeDocProjectConfig` — 测试配置解析
- `TestResourceNodeDocProjectTypes` — 测试节点类型枚举
- `TestResourceNodeDocProjectConfigFields` — 测试配置字段完整性

**测试覆盖：**
- ✅ JSON 序列化/反序列化
- ✅ 节点类型验证
- ✅ 配置字段兼容性

### 4. 文档 (Documentation)

**新增文件：** `docs/doc-project-resource-integration.md`

完整使用指南，包含：
- 架构设计说明
- 使用流程（发布 → 创建节点 → 授权 → 访问）
- API 端点列表
- 前端集成示例
- 权限验证流程图
- 与 Agent 菜单的对比

## API 变更

### 后台管理 API

无变更，现有端点支持新节点类型：

| 端点 | 变更 |
|------|------|
| `POST /api/resources/nodes` | ✅ 支持 `node_type: "doc_project"` |
| `PUT /api/resources/nodes/:id` | ✅ 支持更新 doc_project 配置 |

### 前台门户 API

**GET `/api/resources/portal/tree`**

响应新增字段（仅 `doc_project` 节点）：

```json
{
  "node_type": "doc_project",
  "project_code": "user-guide",
  "open_mode": "iframe",
  "publish_status": 1,
  "share_token": "a1b2c3d4...",
  "project_name": "用户手册"
}
```

## 数据库变更

**无需迁移**

现有表结构已支持新功能：
- `resource_nodes.node_type` — VARCHAR，可容纳 `doc_project`
- `resource_nodes.config_json` — TEXT，存储 `{"project_code": "...", "open_mode": "..."}`

## 前端集成指引

### 1. 节点类型判断

```typescript
if (node.node_type === 'doc_project') {
  // 处理文档项目节点
}
```

### 2. 发布状态检查

```typescript
if (node.publish_status !== 1) {
  ElMessage.warning('该文档项目尚未发布')
  return
}
```

### 3. URL 拼装

```typescript
const url = `/docs-app/d/${node.project_code}?share=${node.share_token}`
```

### 4. 打开方式

```typescript
if (node.open_mode === 'blank') {
  window.open(url, '_blank')
} else {
  // iframe 内嵌
  embedInIframe(url)
}
```

## 使用场景

### 场景 1：分级文档授权

**需求：** 普通用户只能访问"用户手册"，管理员可访问"系统设计文档"

**实现：**
1. 创建资源角色："普通用户"、"系统管理员"
2. 创建资源节点：
   - 用户手册（doc_project: `user-guide`）
   - 系统设计（doc_project: `system-design`）
3. 角色授权：
   - 普通用户 → 用户手册
   - 系统管理员 → 用户手册 + 系统设计
4. 用户分配到相应角色

### 场景 2：项目组独立文档空间

**需求：** 项目 A 和项目 B 的成员各自访问本项目的文档

**实现：**
1. 创建文档项目：`project-a-docs`、`project-b-docs`
2. 创建资源角色：`project-a-team`、`project-b-team`
3. 分别授权对应的文档项目节点
4. 用户加入对应团队角色

### 场景 3：客户自助服务门户

**需求：** 外部客户登录后只能查看产品使用手册和常见问题

**实现：**
1. 创建资源角色："客户"
2. 创建文档项目资源节点：
   - 产品手册
   - FAQ
3. 授权给"客户"角色
4. 客户账号分配到该角色

## 兼容性

### 后端兼容性

- ✅ **向后兼容**：现有资源节点类型不受影响
- ✅ **数据库兼容**：无需表结构变更
- ✅ **API 兼容**：现有端点行为不变

### 前端兼容性

- ⚠️ **需要更新**：前端资源树渲染组件需添加 `doc_project` 类型处理
- 如果前端未更新，`doc_project` 节点会被忽略（不报错）

## 测试清单

- [x] 单元测试：模型序列化/反序列化
- [x] 单元测试：节点类型枚举验证
- [x] 单元测试：配置字段完整性
- [x] 编译测试：Go 代码编译通过
- [ ] 集成测试：完整授权流程（创建 → 授权 → 访问）
- [ ] 前端测试：资源树渲染 `doc_project` 节点
- [ ] 端到端测试：用户权限隔离验证

## 部署注意事项

1. **后端优先部署**：确保后端支持 `doc_project` 后再更新前端
2. **文档项目发布**：提醒管理员先发布文档项目再创建资源节点
3. **用户培训**：向资源管理员说明新节点类型的配置方法
4. **监控发布状态**：未发布的项目会导致前台访问失败，需建立监控

## 后续计划

### 短期（v1.x）
- [ ] 前端 Web 界面支持（资源管理后台 + 前台门户）
- [ ] 批量导入资源节点（从文档项目列表）
- [ ] 资源使用统计（文档项目访问次数）

### 长期（v2.x）
- [ ] 文档项目权限细粒度控制（节点级别的 view/edit/delete）
- [ ] 文档项目版本管理与资源节点联动
- [ ] 动态权限：根据文档项目的 category 自动授权

## 回滚方案

如需回滚此功能：

1. **删除 doc_project 节点**：
   ```sql
   DELETE FROM resource_nodes WHERE node_type = 'doc_project';
   DELETE FROM resource_role_nodes WHERE node_id IN (
     SELECT id FROM resource_nodes WHERE node_type = 'doc_project'
   );
   ```

2. **代码回滚**：
   ```bash
   git revert <commit-hash>
   ```

3. **无数据库迁移文件**需要删除

## 相关 Issue / PR

- Issue: #XXX - 支持文档项目在资源管理中授权
- PR: #YYY - feat: add doc_project resource node type

## 贡献者

- @frank - 后端实现、测试、文档

---

**审核状态：** ✅ 代码审核通过  
**测试状态：** ✅ 单元测试通过  
**文档状态：** ✅ 使用指南完成
