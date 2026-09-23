# 变更日志：docs-app 分享模式状态残留

**日期：** 2026-09-23
**类型：** Bug Fix
**影响范围：** `docs-app`（独立部署及主应用 `/docs-app/*` 代理）

## 问题

用户反馈：在 web 端打开 docs-app，原本可正常编辑的项目页面变成了「只读模式」：
- 新建节点、编辑节点、上传文件、版本历史、删除、AI 助手 等按钮全部消失
- 管理员账号也只看到「只读分享」标记，无法进行任何写操作

## 根本原因

`docs-app/src/App.tsx` 中初始化分享模式的 `useEffect` 依赖数组为空：

```tsx
// 修复前
useEffect(() => {
  const token = getShareToken()
  setShareMode(token)
}, [])   // ← 仅在 App 首次挂载时执行一次
```

`App` 组件在 SPA 路由切换（React Router 内部跳转）时不会卸载，因此这个 `useEffect`
只在整个应用首次加载时运行一次。

### 触发链路

1. 用户访问了带 `?share=<token>` 的链接（典型场景）：
   - Agent 菜单下发的预览路径 `/preview/doc/<code>?share=<token>`
   - 项目发布后生成的分享链接 `/d/<code>?share=<token>`
2. `App` 挂载 → `useEffect` 读取 `?share=` → `setShareMode(token)` → `shareMode=true`
3. 用户在同一 SPA 内通过 React Router `<Link>` 或浏览器返回跳转到不带 share 的页面
   （如 `/d/<another-code>`、`/`、`/roles` 等）
4. `App` 不会重新挂载，`useEffect` 不会再触发，`shareMode` 仍为 `true`
5. `ProjectDocsPage` 看到 `shareMode=true`，把所有 admin/编辑按钮隐藏 → UI 显示「只读」

只有硬刷新整个页面才能恢复，与期望的「按 URL 决定只读/可写」语义不符。

## 解决方案

让 `shareMode` 与当前 URL 的 `?share=` 参数保持同步：

```tsx
// 修复后（docs-app/src/App.tsx）
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

const location = useLocation()
useEffect(() => {
  const token = getShareToken()
  setShareMode(token)
}, [location.search, setShareMode])
```

把 `location.search` 加入依赖后，SPA 内部任何 query 字符串的增删都会重新读取
`?share=`，从而正确切换「只读分享模式」与「登录用户编辑模式」。

## 验证

- `npx tsc --noEmit` 通过，无新增类型错误
- 场景复现：
  1. 登录用户先打开 `/preview/doc/foo?share=xxx` → 进入 Agent 预览页（只读）
  2. 在该 tab 中点击返回或项目主页，跳转到 `/d/bar`（不带 share）
  3. 修复前：仍显示「只读分享」；修复后：自动恢复为登录用户编辑态
- 反向同样适用：从普通页面跳到带 share 的预览页，`shareMode` 也会被正确开启
