# 变更日志：Agent 端 doc-project 预览 — 完整 Markdown 渲染

**日期：** 2026-09-28
**类型：** Bug Fix

## 问题

Agent 端通过菜单打开已发布的文档项目时，文档正文只能看到：

- `# / ## / ###` 三级标题
- `- / *` 开头的列表项
- 段落和空行（被渲染为 `<br>`）

而编辑器支持的全部 Notion 风格扩展（表格、任务列表、代码块、Callout、折叠块、Doc Embed）以及 GFM 特性（删除线、自动链接）全部丢失 —— Agent WebView 上看到的文档只是「提纲 + 列表」，完全没有富文本体感。

### 根因

`docs-app/src/pages/AgentDocPreview.tsx` 的 `MarkdownView` 组件（约第 566 行）实现了一个完全自写的「按行 split + 字符串前缀匹配」渲染器（见 2026-09-21 的 `CHANGELOG_agent_doc_preview.md`）：

```ts
function MarkdownView({ content, isMobile }) {
  const lines = content.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('# ')) return <h1>{line.slice(2)}</h1>
    if (line.startsWith('## ')) ...
    if (line.startsWith('### ')) ...
    if (line.startsWith('- ') || line.startsWith('* ')) return <li>{line.slice(2)}</li>
    if (line.trim() === '') return <br />
    return <p>{line}</p>
  })
}
```

它根本没有调用 `react-markdown`，因此对 GFM 表格、任务列表、代码块、引用、链接、图片、加粗/斜体、删除线以及 Notion 自定义扩展语法（`:::info ... :::`、`<details>...</details>`、`<div class="doc-embed">`）一无所知，全部按普通段落输出。

## 修复

把 `MarkdownView` 替换为「`ReactMarkdown` + `remark-gfm` + 扩展块预切片」的实现，与编辑器侧的 `SharedMarkdownContent`（`MarkdownEditor.tsx`）保持一致。

### 1. `docs-app/src/pages/AgentDocPreview.tsx`

- 引入 `react-markdown` + `remark-gfm`，处理标准 markdown + GFM（表格、任务列表、删除线、自动链接）。
- 新增 `SharedMarkdownContent`：把 markdown 文本预扫描为分段数组
  - `markdown`（剩余 markdown 段落）— 走 `ReactMarkdown`
  - `callout`（`:::info / warning / error / success ... :::`）— 渲染为带图标的彩色提示框
  - `toggle`（`<details [open]>...<summary>title</summary>...content...</details>`）— 渲染为原生折叠块
  - `embed`（`<div class="doc-embed" data-kind=... data-config=...></div>`）— 渲染为 iframe 嵌入（form-app / scada）
- `sliceNotionBlocks` 是核心切片器：按行首正则 `^:::.../m` 与 `^<details.../m` 顺序匹配；不依赖新依赖，纯前端处理。
- `markdownComponents` 把 react-markdown 输出的元素映射到带 className 的标签，与 `index.css` 中的样式对应。

### 2. `docs-app/src/index.css`

新增 `.agent-md-body` 作用域下约 200 行 CSS，覆盖：

- 标题（h1-h6）、段落、加粗/斜体/删除线、链接、图片
- 引用 (`blockquote`)、水平线 (`hr`)
- 行内代码、代码块（深色背景、等宽字体）
- 表格（带斑马头、横向滚动）
- GFM 任务列表（`- [ ] / - [x]`）— 渲染为带 checkbox 的 list
- Notion Callout（info/warning/error/success 四种配色）
- Notion Toggle（`<details>` 折叠块，自定义 ▶ 旋转图标）
- Doc Embed（复用编辑器 `.doc-embed-node` 样式）

所有样式用 `.agent-md-body` 选择器作用域化，与编辑端的 `.pm-host .ProseMirror` 风格一致但互不污染。

### 3. 删除无用内联样式

旧的 `h1 / h2 / h3 / p / li` 内联样式不再使用，从 `styles` 对象中清理。

### 4. 构建产物同步

`docs-app/dist/*` 重新构建，并通过 `cp -r docs-app/dist/* web/dist/docs-app/` 同步到 server 实际读取的目录。`web/dist/docs-app/index.html` 中的 bundle hash 自动更新为 `index-BV2a76Vl.js` / `index-CvACRtv4.css`，旧 bundle 已删除。

## 验证

- `npx tsc --noEmit` 通过（exit 0）
- `npm run build` 通过：dist 1.1MB（含 react-markdown / remark-gfm）
- `sliceNotionBlocks` 用 7 个测试用例（含嵌套、表格、多 callout 等）全部通过
- Bundle 内字符串检查：`agent-md-callout`、`agent-md-task-list`、`agent-md-toggle`、`callout-info`、`doc-embed` 均存在
- CSS bundle 内字符串检查：`.agent-md-body`、`.callout-info`、`.callout-warning`、`.callout-error`、`.callout-success` 均存在
- 响应式行为保留：`isMobile` 仍控制字号 / 行高 / padding；侧栏收起 / 抽屉不受影响

## 不在范围内（已知遗留）

- 编辑端的 `MarkdownEditor.tsx::SharedMarkdownContent` 同样有 callout / toggle 渲染问题（直接走 `ReactMarkdown` 没有切片预处理）。本次只修复 Agent 预览路径；编辑器 share 模式另起修复。
- 当前实现不处理 doc_embed 的 `${global|page|doc.x}` 模板变量替换（Agent 端无登录态，documentContext 为空对象）。

---

# 后续：2026-09-28 移除移动端抽屉自动关闭

## 改动

`docs-app/src/pages/AgentDocPreview.tsx` 的 `handleNodeClick` 不再在点击节点后调用 `setDrawerOpen(false)`。

## 原因

用户反馈：Agent 端 WebView 下，连续翻看多个文档时每次都要重新点开抽屉才能选下一篇，操作很冗余。

## 当前关闭抽屉的入口

- 顶部汉堡按钮（drawer 打开时变成 X 图标）
- 点击抽屉外的半透明遮罩（`.backdrop`）

抽屉保持打开，浏览路径只受这两个入口控制，避免重复点开。

## 不影响

- 桌面端侧栏（`collapsed` 状态、`SidebarRail`）行为未变
- 选中节点的高亮、文件夹展开/收起、Markdown 内容加载均不变
- FAB 仍然在 drawer 关闭时显示，用于重新唤起目录