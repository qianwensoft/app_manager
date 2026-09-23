# 变更日志：docs-app 块拖拽把手 hover 消失问题

**日期：** 2026-09-24
**类型：** Bug Fix

## 问题

`docs-app` 富文本编辑器中，当鼠标移到某个块上时，块左侧的拖拽把手（`⋮⋮` 图标）会立即出现，但只要鼠标朝把手方向继续移动，**把手会立刻消失**，根本无法被点击或拖动。

红色框标注的就是试图点击的把手。

## 根本原因

`docs-app/src/components/collab/DragHandle.tsx`：

1. 把手通过 `createPortal(..., document.body)` 渲染到 `<body>` 下，**不在编辑器 DOM 树内**。
2. 把手坐标是 `editorRect.left - 32`（编辑器左侧 **外面** 32px）。
3. 事件监听只挂在 `view.dom`（编辑器元素）上：`mousemove` + `mouseleave`。
4. 鼠标从编辑器内 → 跨过编辑器左边界 → 到达把手的 8px 缝隙时，会触发 `view.dom` 的 `mouseleave` → 立即 `setShow(false)` → 把手消失。
5. 鼠标进入把手时：把手本身没接管 hover 状态，已经被隐藏了。

## 修复

采用 Notion / Tiptap 标准的延迟隐藏 + 把手接管 hover 方案：

### `docs-app/src/components/collab/DragHandle.tsx`

- 把 `mouseleave` 改为 **延迟 150ms 隐藏**，给鼠标留出跨过缝隙的时间。
- 在把手元素上挂 `onMouseEnter` / `onMouseLeave`：
  - `mouseenter` 取消隐藏。
  - `mouseleave` 立即隐藏。
- 在编辑器元素上挂 `mouseenter` 取消隐藏。
- 用 `useRef` 保存定时器 id，组件卸载时清理。

### 行为对照

| 操作 | 修复前 | 修复后 |
| --- | --- | --- |
| 鼠标进入块 | 把手出现 | 把手出现 |
| 鼠标从编辑器跨向把手 | 把手立刻消失 | 150ms 内鼠标进入把手 → 取消隐藏 → 把手保留 |
| 鼠标停在把手 | 不可达 | 正常高亮 / 拖拽 |
| 鼠标离开把手往其他方向走 | 不可达 | 150ms 后自然隐藏 |
| 鼠标离开编辑器但**不**经过把手 | 立即消失 | 150ms 后隐藏（避免闪烁视觉跳跃） |
| 卸载组件 | 未清理 timer | 清理 timer，避免内存泄漏 |

## 兼容性

- 仅修改前端 `docs-app`，未触及 ProseMirror schema、Yjs 协议、后端 API。
- 拖拽放置逻辑（`dragHandlePlugin.ts`）保持不变。
- 协同 awareness 显示用户名相关的 `/api/me` 修复见 `CHANGELOG_docsapp_web_edit_fix.md`。
