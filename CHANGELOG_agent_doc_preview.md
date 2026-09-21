# 变更日志：Agent 端 doc-project 预览页面

**日期：** 2026-09-21  
**类型：** Bug Fix / Feature

## 问题

用户反馈：在 Android Agent 端点击「文档项目」菜单项时，打开后跳转到了「资源中心首页」（docs-app 的 ProjectsPage），而不是直接显示该文档项目的内容。

### 根本原因

1. **路由设计问题**：`/docs-app/d/:code?share=token` 同时被两套语义使用：
   - 编辑端（登录用户）：完整的项目管理、节点树编辑、AI 助手等
   - Agent 端（免登录分享）：只读预览

   两者混用导致：
   - 协同编辑 hook `useYjsCollab` 调用需要 JWT 的 `/api/me` 接口，无 JWT 时静默失败（虽然不影响渲染，但产生了不必要的网络请求）
   - `ProjectDocsPage` 在 share 模式下需要从 store 读取权限信息，逻辑复杂
   - 出现 401 时 axios interceptor 重定向到 `/`，看起来像「跳转到首页」

2. **用户体验问题**：Agent 端打开完整版 docs-app 会暴露大量与移动端无关的功能按钮（分类管理、新建项目、AI 助手等），占用屏幕且与只读场景冲突。

## 解决方案

新增 Agent 端专用的只读预览页面 `/docs-app/preview/doc/:code?share=token`，专门适配 Agent WebView：

### 1. 新增页面：`docs-app/src/pages/AgentDocPreview.tsx`

- **路由**：`/preview/doc/:code`
- **特性**：
  - 纯只读，无任何编辑/上传/AI 按钮
  - 不加载 Yjs 协同（避免 JWT 认证问题）
  - 简洁两栏布局：左侧目录树 + 右侧内容
  - 仅调用免登录 share API：`/api/docs/share/projects/code/:code*`
  - 移动端友好的字号与间距

### 2. 注册路由：`docs-app/src/App.tsx`

```tsx
<Route path="/preview/doc/:code" element={<AgentDocPreview />} />
```

### 3. 后端菜单路径调整：`server/api/agent_menu.go`

```diff
- previewPath = "/docs-app/d/" + docProject.Code + "?share=" + docProject.ShareToken
+ previewPath = "/docs-app/preview/doc/" + docProject.Code + "?share=" + docProject.ShareToken
```

Agent 菜单下发的 `preview_path` 改为新的预览路径。

## 兼容性

- **旧路径 `/d/:code?share=` 仍然可用**：保留原 `ProjectDocsPage` 路由，编辑端用户仍可使用
- **新增路径 `/preview/doc/:code?share=`**：Agent 端专用，干净无副作用
- **API 无变更**：继续使用现有的 `GetSharedDocumentProject` 等免登录接口

## 验证

- ✅ Go 编译通过
- ✅ docs-app 构建通过
- ✅ 新路径 `GET /docs-app/preview/doc/test-code?share=abc` 返回 200 + `text/html`
- ✅ 旧路径仍可用（向后兼容）
