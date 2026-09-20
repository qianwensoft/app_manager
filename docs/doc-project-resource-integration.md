# 文档项目资源管理集成指南

## 概述

文档项目（Document Project）现已支持在资源管理（Resource Center）中进行配置和授权。用户可以将文档项目作为资源节点添加到资源树中，并通过资源角色控制访问权限。

## 架构设计

### 1. 资源节点类型

资源节点新增 `doc_project` 类型，与现有类型并列：

- `group` — 纯分组节点
- `device_mgmt` — 设备管理节点
- `workorder_mgmt` — 工单管理节点
- `scada` — 组态预览节点
- `form_app` — 表单应用节点
- **`doc_project`** — **文档项目节点（新增）**
- `link` — 自定义链接节点

### 2. 配置结构

`doc_project` 节点的 `config_json` 包含以下字段：

```json
{
  "project_code": "user-guide",  // 文档项目的唯一标识（DocumentProject.code）
  "open_mode": "iframe"          // 打开方式：iframe（内嵌）| blank（新标签页）
}
```

### 3. 发布状态关联

资源前台 API 会自动关联文档项目的发布状态：

- `publish_status` — 0: 未发布，1: 已发布
- `share_token` — 分享令牌（已发布时可用）
- `project_name` — 项目名称

**前台访问规则：**
- **已发布**：使用免登录分享地址 `/docs-app/d/:code?share=<token>`
- **未发布**：提示用户先在文档项目管理中发布

## 使用流程

### 第一步：发布文档项目

在文档项目管理界面，先发布目标项目：

1. 进入"文档项目管理"
2. 选择要授权的项目（例如"用户手册"）
3. 点击"发布"按钮，生成 `share_token`
4. 记下项目的 `code`（如 `user-guide`）

### 第二步：创建资源节点

通过资源管理后台添加 `doc_project` 类型节点：

**API 请求：** `POST /api/resources/nodes`

```json
{
  "parent_id": 1,
  "name": "用户手册",
  "node_type": "doc_project",
  "icon": "BookOpen",
  "sort_order": 10,
  "config_json": "{\"project_code\":\"user-guide\",\"open_mode\":\"iframe\"}"
}
```

**字段说明：**
- `parent_id` — 父节点 ID（null 表示根节点）
- `node_type` — 必须为 `doc_project`
- `config_json` — JSON 字符串，包含 `project_code` 和 `open_mode`

### 第三步：配置资源角色授权

1. **创建或选择资源角色**（如"普通用户"）
2. **关联资源节点**：将文档项目节点分配给该角色
   - API: `POST /api/resources/roles/:roleId/nodes`
   - Body: `{"node_ids": [节点ID]}`
3. **分配用户**：将用户添加到该资源角色
   - API: `POST /api/resources/roles/:roleId/users`
   - Body: `{"user_ids": [用户ID]}`

### 第四步：前台访问

用户登录后，在资源中心门户可见已授权的文档项目节点：

**API 请求：** `GET /api/resources/portal/tree`

**响应示例：**
```json
{
  "data": [
    {
      "id": 5,
      "name": "用户手册",
      "node_type": "doc_project",
      "icon": "BookOpen",
      "project_code": "user-guide",
      "open_mode": "iframe",
      "publish_status": 1,
      "share_token": "a1b2c3d4e5f6...",
      "project_name": "用户手册",
      "children": []
    }
  ]
}
```

前台根据 `publish_status` 判断：
- **已发布**：打开 `/docs-app/d/user-guide?share=<token>`
- **未发布**：提示"该文档项目尚未发布"

## 与 Agent 菜单的区别

| 特性 | Agent 菜单 | 资源管理 |
|------|-----------|---------|
| **用途** | Android Agent 应用内快捷入口 | Web 前台用户门户授权 |
| **授权方式** | 按设备推送菜单配置 | 按用户资源角色授权 |
| **访问入口** | Agent App WebView | Web 浏览器资源中心 |
| **URL 格式** | `/docs-app/d/:code?share=<token>` | 同左（内嵌或新标签页） |
| **权限控制** | 基于设备 + Agent 连接 | 基于用户 + 资源角色 |

## 数据模型

### ResourceNode

```go
type ResourceNode struct {
    ID         uint
    ParentID   *uint
    Name       string
    NodeType   string  // "doc_project"
    Icon       string
    SortOrder  int
    ConfigJSON string  // JSON 序列化的 ResourceNodeConfig
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
```

### ResourceNodeConfig

```go
type ResourceNodeConfig struct {
    // ... 其他字段 ...
    
    // doc_project（文档项目）
    ProjectCode string `json:"project_code,omitempty"`
    
    // 通用：打开方式
    OpenMode string `json:"open_mode,omitempty"` // "iframe" | "blank"
}
```

### DocumentProject

```go
type DocumentProject struct {
    ID            uint
    Code          string  // 唯一标识，用于 URL 路由
    Name          string
    RootNodeID    *uint   // 关联的文档根节点
    PublishStatus int     // 0: 未发布, 1: 已发布
    ShareToken    string  // 免登录分享令牌
    // ... 其他字段 ...
}
```

## API 端点

### 资源节点管理（后台）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resources/nodes` | 获取资源节点树 |
| POST | `/api/resources/nodes` | 创建资源节点 |
| PUT | `/api/resources/nodes/:id` | 更新资源节点 |
| DELETE | `/api/resources/nodes/:id` | 删除资源节点 |

### 资源角色管理（后台）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resources/roles` | 获取资源角色列表 |
| POST | `/api/resources/roles` | 创建资源角色 |
| POST | `/api/resources/roles/:id/nodes` | 设置角色关联节点 |
| POST | `/api/resources/roles/:id/users` | 设置角色关联用户 |

### 资源门户（前台）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resources/portal/tree` | 获取当前用户可见资源树 |
| GET | `/api/resources/portal/stats` | 获取资源概览统计 |

### 文档项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/doc-projects` | 获取所有文档项目 |
| GET | `/api/doc-projects/code/:code` | 按 code 查询项目 |
| POST | `/api/doc-projects/:id/publish` | 发布项目 |
| POST | `/api/doc-projects/:id/unpublish` | 取消发布 |

## 权限验证流程

```
用户登录
  ↓
查询用户资源角色（ResourceRoleUser）
  ↓
查询角色关联节点（ResourceRoleNode）
  ↓
过滤可见节点树
  ↓
解析 doc_project 节点配置
  ↓
查询 DocumentProject（按 project_code）
  ↓
检查 publish_status
  ↓
- 已发布：返回 share_token，前台拼装免登录 URL
- 未发布：返回 publish_status=0，前台提示
```

## 前端集成示例

### Vue 3 资源树渲染

```vue
<template>
  <div v-for="node in resourceTree" :key="node.id">
    <div @click="openNode(node)">
      <Icon :name="node.icon" />
      {{ node.name }}
    </div>
  </div>
</template>

<script setup>
function openNode(node) {
  if (node.node_type === 'doc_project') {
    if (node.publish_status !== 1) {
      alert('该文档项目尚未发布')
      return
    }
    const url = `/docs-app/d/${node.project_code}?share=${node.share_token}`
    if (node.open_mode === 'blank') {
      window.open(url, '_blank')
    } else {
      // 内嵌 iframe
      showIframe(url)
    }
  }
  // ... 处理其他节点类型
}
</script>
```

## 注意事项

1. **必须先发布文档项目**，才能在资源管理中正常访问
2. **ShareToken 安全性**：share_token 仅用于只读访问，不支持编辑操作
3. **角色隔离**：不同资源角色可以访问不同的文档项目，实现细粒度授权
4. **级联删除**：删除资源节点会同步删除相关的角色-节点关联记录
5. **project_code 唯一性**：每个文档项目的 code 必须唯一，用于 URL 路由

## 测试验证

运行单元测试：

```bash
cd server
go test -v ./tests -run TestResourceNodeDocProject
```

## 相关文档

- [文档项目管理](./doc-project-agent-menu.md) — 文档项目与 Agent 菜单集成
- [资源中心架构](./resource-center-architecture.md) — 资源管理整体架构
- [权限系统设计](./permission-system.md) — 资源角色与权限控制

## 更新日志

- 2026-09-17: 新增 `doc_project` 资源节点类型，支持文档项目在资源管理中授权配置
