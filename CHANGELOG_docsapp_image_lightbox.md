# 变更日志：docs-app 内嵌图片点击放大查看（旋转/缩放/拖动）

**日期：** 2026-09-29
**类型：** Feature

## 背景

docs-app 文档里内嵌的图片（在 `Markdown` 文档节点、Agent 端只读预览两端）目前是「静态显示」：Web 端只能看到缩略图，Agent WebView 上受限于小屏更难看清细节。用户希望在点图后能弹出全屏查看器，并支持旋转（横/竖向图片方向不对时）、缩放（看细节）、双指捏合 / 滚轮（PC 端）等手势。

## 实现

新建一个全局「图片放大查看器」（`ImageLightbox`），由 `<App>` 单例挂载，渲染在路由之外（fixed 全屏覆盖）。任何 `components.img` 通过 `openImageLightbox(src, alt)` 触发，无需逐层透传 React state。

### 1. 新增 `docs-app/src/components/ImageLightbox.tsx`

- 模块级事件总线 + host 组件订阅：`_open` 函数在 host 挂载时注册，卸载时注销，避免多 host 竞态。
- 视图层：
  - 全屏黑底（rgba 0,0,0,0.92）+ 顶栏工具条
  - 工具条按钮：放大 / 缩小 / 旋转 90° / 重置 / 关闭
  - 实时显示当前缩放百分比（tabular-nums，不会跳动）
- 手势（全部原生 PointerEvents，无第三方依赖）：
  - **滚轮缩放**（PC）：以鼠标位置为不动点缩放（保持视觉锚点）
  - **单指拖动 / 鼠标拖动**：平移图片
  - **双指捏合**：以两指中点为不动点缩放
  - **双击 / 双点**：缩放在 1x 与 2.5x 间切换；2.5x 时把点击处移到屏幕中心
- 缩放范围：`0.2x ~ 10x`，按钮 +/- 步进 `1.25x`
- 快捷键：`Esc` 关闭、`+/-` 缩放、`R` 旋转
- 打开时锁定 body 滚动；淡入 160ms

### 2. `docs-app/src/App.tsx`

在 `<Routes>` 之外挂载 `<ImageLightbox />`。全局只渲染一次，所有路由下点图都生效。

### 3. `docs-app/src/pages/AgentDocPreview.tsx`

- `components.img`：解构出 `alt`，加 `onClick` 调 `openImageLightbox(rewritten, altText)`
- 加 `loading="lazy"` 顺手优化大文档首屏
- 复用之前的 `rewritten` 逻辑（登录态 `/api/docs/nodes/<id>/download` → 分享态 URL 重写）

### 4. `docs-app/src/components/viewers/MarkdownEditor.tsx`

- `SharedMarkdownContent`：与 Agent 端同步修复 —— 加 `remarkPlugins={[remarkGfm]}` 与 `urlTransform={(v) => v}`（之前编辑器侧的分享预览也有 `data:` URL 被默认 transform 吞掉的同类问题）
- `components.img` 加 `onClick` → `openImageLightbox`

### 5. `docs-app/src/index.css`

- `.agent-md-body .agent-md-img`：加 `cursor: zoom-in` 与 hover 时浅阴影，给用户「可点击」的视觉提示
- 新增 `.image-lightbox*` 全套样式（fixed 全屏、工具条玻璃质感、淡入动画）
- 同步给 `.pm-host .ProseMirror img` 加 `cursor: zoom-in`（编辑器内的内嵌图片，编辑态也能放大查看）

## 验证

- `npx tsc --noEmit` 通过（exit 0）
- `npm run build` 成功：`docs-app/dist/assets/index-CPy7SklL.js` (1.12 MB) + `index-DlY5HFcD.css` (26.47 KB)
- bundle 字符串检查：`image-lightbox`、`image-lightbox-toolbar`、`image-lightbox-close`、`image-lightbox-stage`、`image-lightbox-img`、`image-lightbox-scale` 全部命中
- CSS 选择器检查：同名 className 在 css bundle 内存在
- 已 `cp -R docs-app/dist → web/dist/docs-app/`，`index.html` 切换到新 bundle hash
- 同步给 Android Agent WebView：Agent 端走 `/docs-app/preview/doc/:code?share=...` 路径由 server `web/dist/docs-app` 提供静态资源，下发菜单后下一次 WebView 加载即生效，无需重新编译 APK

## 已知边界

- 旋转后宽度计算保持原图比例，旋转 90° / 270° 时图片看起来更「瘦」，但 CSS transform 会按 `transform-origin: center` 居中 —— 大图旋转后会被裁切（这是 fixed 全屏 stage 容器的天然行为，不引入自动 resize 容器以保持手势响应灵敏）。旋转不超过 360°，循环回正。
- 双击缩放切换阈值：300ms 内 + 距离 < 24px 的两次 pointerdown 算双击；超过这个范围则视为两次独立单击/拖动开始。
- data URL 图片的 base64 解码开销较大，嵌入极大的图片（>2 MB base64）建议在 Markdown 编辑时压缩；超出 WebView 内存限制时可能 OOM，与本组件无关。
- `ImageViewer`（`SimpleViewers.tsx`）独立节点的图片查看器本次未改，仍是 `viewer-center` 居中显示 —— 它本身已经是全屏，单击查看没有缩放必要。