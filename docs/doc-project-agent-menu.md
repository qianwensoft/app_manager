# 文档项目 Agent 菜单集成

## 功能概述

文档项目现在支持添加到 Agent 移动端菜单，用户可以在 Android 设备上快速访问文档。

## 使用方法

### 1. 在 Web 端添加文档项目到菜单

1. 进入文档项目列表页面
2. 点击文档项目卡片右上角的 **⋮** 菜单按钮
3. 选择 **"添加到 Agent 菜单"**
4. 在弹出的对话框中：
   - 输入菜单项名称（默认使用项目名称）
   - 选择图标（默认：📄）
   - 选择要分配的设备
5. 点击 **"确定"** 完成添加

### 2. 在 Android Agent 端访问

1. 打开 Android Agent 应用
2. 进入菜单目录
3. 点击对应的文档项目菜单项
4. Agent 会打开内置 WebView 加载文档预览页面（`/d/:code`）

## 技术实现

### 后端 (Go)

#### 模型支持

`AgentMenuItem` 模型新增 `doc_project` 目标类型：

```go
type AgentMenuItem struct {
    // ...
    TargetType string `json:"target_type"` // "scada_project" | "form_app_entry" | "agent_native" | "doc_project"
    TargetID   uint   `json:"target_id"`
    // ...
}
```

#### API 路由

- `POST /api/agent-menu/add-doc-project` - 添加文档项目到菜单
  - 请求体：`{ "doc_project_id": uint, "device_ids": []uint, "name": string, "icon": string }`
  - 自动设置 `preview_path` 为 `/d/:code`

### 前端 (React)

#### 文档项目列表

- `ProjectGrid.tsx` - 项目卡片的菜单按钮中新增"添加到 Agent 菜单"选项
- `AddToAgentMenuModal.tsx` - 新组件，处理添加到菜单的交互

#### API 客户端

```typescript
// docs-app/src/api/agentMenu.ts
export async function addDocProjectToAgentMenu(params: {
  doc_project_id: number
  device_ids: number[]
  name?: string
  icon?: string
}): Promise<void>
```

### Android Agent

Agent 端无需修改，`doc_project` 类型会自动使用 `ScadaWebViewActivity` 打开配置的 `preview_path`。

## 数据流

```
Web 端点击 "添加到 Agent 菜单"
  ↓
POST /api/agent-menu/add-doc-project
  ↓
创建 AgentMenuItem (target_type="doc_project", preview_path="/d/:code")
  ↓
创建 AgentMenuAssignment (关联设备)
  ↓
Android Agent 拉取菜单列表
  ↓
用户点击菜单项
  ↓
Agent 打开 ScadaWebViewActivity 加载 /d/:code
  ↓
显示文档项目预览页面
```

## 测试

运行集成测试：

```bash
cd server
go test -v ./tests -run TestDocProjectAgentMenu
```

测试覆盖：
- ✅ 文档项目添加到菜单
- ✅ `preview_path` 正确设置为 `/d/:code`
- ✅ `target_type` 为 `doc_project`
- ✅ 设备关联正确创建

## 相关文件

### 后端
- `server/models/agent_menu.go` - 菜单模型
- `server/api/agent_menu.go` - 菜单 API（新增 `addDocProjectToAgentMenu` 处理器）
- `server/tests/doc_project_agent_menu_test.go` - 集成测试

### 前端
- `docs-app/src/components/ProjectGrid.tsx` - 项目列表
- `docs-app/src/components/AddToAgentMenuModal.tsx` - 添加菜单对话框
- `docs-app/src/api/agentMenu.ts` - API 客户端

### Android
- `agent/app/src/main/java/com/example/agent/ScadaWebViewActivity.kt` - WebView 容器
- `agent/app/src/main/java/com/example/agent/menu/AgentMenuItem.kt` - 菜单项模型

## 注意事项

1. 文档项目必须有 `code` 字段才能生成正确的预览路径
2. 预览路径格式：`/d/:code`（例如：`/d/user-manual`）
3. Agent 端需要网络连接才能加载文档内容
4. 建议为常用文档项目设置简短易记的图标
