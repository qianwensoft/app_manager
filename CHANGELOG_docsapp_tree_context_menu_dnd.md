# CHANGELOG — docs-app 文档树右键菜单 + 拖拽排序

## 功能

### 右键菜单
- 在左侧文档树节点上**右键点击**，弹出操作菜单：
  - **重命名**：打开节点编辑弹窗（修改名称 / 编码 / 类型）
  - **新建子节点**：在右键节点下创建子节点（继承该节点为父）
  - **复制**：深拷贝节点（folder 递归克隆子树，doc 同步复制文件字节并生成新版本记录）

### 拖拽排序
- 支持**拖拽节点**调整顺序（原生 HTML5 DnD）：
  - **拖入 folder 节点中间**（鼠标在节点中部）：节点变为该 folder 的子节点（sort_order = max+1）
  - **拖入节点上方**（鼠标在节点上部 30% 区域）：插入到该节点**之前**
  - **拖入节点下方**（鼠标在节点下部 30% 区域）：插入到该节点**之后**
- 拖拽时显示落点视觉指示器（蓝色线或背景高亮）
- 被拖动的节点淡化显示
- 循环引用防护：不能把节点拖到自身或自身后代之下（前端拖放层 + 后端 API 层双重拦截）

## 后端变更

### `server/api/document_mgmt.go`
1. 新增 `CopyDocumentNode` handler（`POST /api/docs/nodes/:id/copy`）：
   - 递归克隆 folder 子树（每层 name 追加 " - 副本 (N)" 后缀，code 自动去重）
   - doc 节点：读取源文件字节，写入新的时间戳路径，创建新的 DocumentVersion
   - 不复制 DocumentRoleNode 授权表（避免越权扩散）
2. `UpdateDocumentNode` 新增循环引用检测：
   - 不能把节点移动到自身之下（400）
   - 不能把节点移动到自身后代之下（400）

### `server/api/router.go`
- 注册 `docs.POST("/nodes/:id/copy", ..., CopyDocumentNode)`

### `server/api/document_mgmt_code_test.go`
- 新增 `TestCopyDocumentNode_BasicFolder`：验证 folder 递归复制 + code 去重 + children 数量
- 新增 `TestUpdateNodeParentCycle`：验证循环引用 400 + 合法移动 200

## 前端变更

### `docs-app/src/api/documents.ts`
- 新增 `copyNode(id)`、`moveNode(id, body)` API 函数

### `docs-app/src/components/DocContextMenu.tsx`（新文件）
- 通用右键菜单组件：定位保护（超出视口自动贴边）、Esc/点击外部关闭、危险操作高亮

### `docs-app/src/components/DocTree.tsx`
- 右侧菜单：`onContextMenu` 回调
- 拖拽：原生 DnD，`onMove(srcId, targetId, zone)` 回调
- 三段式落点检测（before/into/after）
- 拖拽视觉指示器 CSS class（`drop-before` / `drop-into` / `drop-after` / `dragging-self`）
- 新增 `buildDescendantIdSet()` 工具函数

### `docs-app/src/pages/ProjectDocsPage.tsx`
- 新增状态：`modalTarget`（右键目标）、`contextMenu`（右键菜单位置）
- `handleMove`：批量 renumber siblings（解决历史数据 sort_order=0 的视觉排序问题）
- `handleCopyNode`：调用 `copyNode` API，复制完成后刷新树并自动选中新节点
- `buildContextActions`：根据权限动态生成菜单项
- `NodeModal` props 更新为 `modalTarget`

### `docs-app/src/index.css`
- `.doc-context-menu`：右键菜单样式
- `.tree-node.drop-before::before`、`.drop-into`、`.drop-after`：拖拽落点指示线
- `.tree-node.dragging-self`：拖动中淡化

## 构建产物

- `docs-app/dist/assets/index-i7AnFwdo.js` (1.1MB)
- `docs-app/dist/assets/index-DSBCxjCa.css` (19KB)
- 已同步到 `web/dist/docs-app/`
