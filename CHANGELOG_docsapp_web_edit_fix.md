# CHANGELOG — docs-app web 端编辑失败修复

## 问题

打开 `/d/<code>` 项目页后,虽然 Yjs 协同已连接(状态栏「协同已建立 1/1」),
但 MarkdownEditor 仍是只读——无法键入、无法选中编辑、工具栏按钮全部禁用。

## 根因

`docs-app/src/pages/ProjectDocsPage.tsx` 在引入组件时**只订阅了 `useDocsStore` 中的 `perms`**
(store 字段 `perms: null`),但**整个 docs-app 没有任何地方调用 `fetchPortalPermissions()`**
把权限写回 store。

结果:
- `store.can(nodeId, 'edit')` 内部 `if (!p) return false`,永远返回 false
- `canEditSelected = false` 永远成立
- `MarkdownEditor` → `ProseMirrorEditor` 拿到 `canEdit={false}`
- `EditorView({ editable: () => canEdit })` 创建为只读视图
- 工具栏等 `{canEdit && ...}` 分支全部隐藏

也就是说,「能否编辑」完全由 store 里的权限决定,而权限永远不会被填充 → 永远只读。

附带问题:之前的 `const perms = shareMode ? {...} : useDocsStore((s) => s.perms)` 是
**条件式 Hook 调用**(Rules of Hooks 违规),在 `shareMode` 切换时可能产生不一致状态。

## 修复

### `docs-app/src/pages/ProjectDocsPage.tsx`

1. 新增 `useQuery(['doc-portal-permissions'], fetchPortalPermissions, { enabled: !shareMode })`
   主动拉取当前用户的门户权限(`is_admin` + 节点级权限表)。
2. 用 `useEffect` 把 `fetchedPerms` 同步到 `useDocsStore.setPerms(...)`,让 `store.can()` 拿到真值。
3. 局部新增 `perms` 派生值,优先用 React Query 返回的 `fetchedPerms`,再退化为 `storedPerms`,
   保证首次拿到服务端数据后**立刻**反映在 `canEditSelected` 上,避免「先只读再切可编辑」的闪烁。
4. 修复原条件式 Hook 调用:始终订阅 `storedPerms`,再由派生值覆盖,符合 Rules of Hooks。

### 行为

- 登录用户首次打开 `/d/<code>`:
  - 网络请求 `/api/docs/portal/permissions` 拉权限
  - 收到后 store 更新,`canEditSelected` 计算为 true
  - MarkdownEditor 重新创建 EditorView,`editable: () => true`,可键入
- 分享模式(`?share=`)下不触发该 query,前端固定只读(行为不变)
- 分享 → 普通页切换时(由 App.tsx 中 `location.search` 依赖保证),`shareMode` 立刻归 false,
  再加上本次修复,`can()` 立刻返回真实权限

## 验证

- `cd docs-app && npm run build` 通过(tsc + Vite)
- 产物同步到 `web/dist/docs-app/index.html`,引用 `index-CQCu0s5t.js`
- bundle 内确认存在 `doc-portal-permissions` query key 和 `fetchPortalPermissions` 调用

## 文件变更

| 文件 | 变更 |
|------|------|
| `docs-app/src/pages/ProjectDocsPage.tsx` | 新增权限拉取 + 同步 store,修复 Rules of Hooks |
| `docs-app/dist/`, `web/dist/docs-app/` | 重新构建 (`index-CQCu0s5t.js`) |
