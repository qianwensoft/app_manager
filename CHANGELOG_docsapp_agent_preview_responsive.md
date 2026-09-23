# CHANGELOG — AgentDocPreview 侧栏收起 & 移动端适配

## 改动摘要

为 `docs-app/src/pages/AgentDocPreview.tsx` 增加响应式行为,Agent WebView 在手机/小屏设备上能用,Web 端也不再被侧栏占空间。

## 关键点

### 1. 桌面端 (≥ 768px) — 侧栏可收起

- 顶部栏新增「收起/展开」按钮(`PanelLeftClose` / `PanelLeftOpen` 图标)
- 收起后侧栏缩为 **56px 图标列**:
  - 顶部展示项目图标(静态标识,不触发交互)
  - 下方一个分隔线
  - 底部一个「展开侧栏」按钮(`PanelLeftOpen`)
- 收起状态**持久化**到 `localStorage`(`agent_doc_preview_sidebar_collapsed`),下次打开同一项目自动恢复
- 收起/展开带 200ms `width` 过渡动画

### 2. 移动端 (< 768px) — 抽屉式目录

- 用 `matchMedia` 监听 `(max-width: 767px)` 断点切换布局
- 顶部按钮变成**汉堡菜单**(`Menu`),再点一次切为关闭按钮(`X`)
- 目录以**绝对定位抽屉**形式从左侧滑入,宽度 85% (max 320px),带阴影
- 抽屉打开时背景有半透明遮罩(`rgba(15, 23, 42, 0.4)`),点击遮罩关闭
- **选中节点后自动关闭抽屉**,确保用户能看到正文
- 抽屉关闭后右下角显示 **48px 浮动按钮 (FAB)**,可再次唤起目录

### 3. 移动端其它适配

- Header 隐藏右侧说明文字节省横向空间
- 树节点 `min-height: 40px` 满足触屏点击区推荐尺寸
- 内容区 padding 从 20px 收到 14px
- Markdown 标题缩到 20/17/15px,正文字号 15px,行高 1.65
- 下载按钮在移动端**只显示图标**,省空间
- 滚动容器加 `-webkit-overflow-scrolling: touch`,iOS WebView 滚动更顺滑
- 长文本 `word-break: break-word` 防溢出
- 空状态文案根据视口切换:「在目录中选择文档」 vs 「选择左侧目录中的文档查看内容」

## 变更文件

| 文件 | 变更 |
|------|------|
| `docs-app/src/pages/AgentDocPreview.tsx` | 增加 `useBreakpoint` 钩子、桌面端收起态、移动端抽屉 + FAB |
| `docs-app/dist/*` | 重新构建 (`index-DlqnhMA8.js` 1.1MB) |
| `web/dist/docs-app/*` | 同步到 server 实际读取路径 |

## 验证

- `npm run build` 在 docs-app 目录通过 (TypeScript + Vite build)
- bundle 关键字符串存在:`/preview/doc`、`matchMedia`、`PanelLeftClose`、`drawerHeader`、`sidebarCollapsed`、`railProjectIcon`
- server 读取路径 `web/dist/docs-app/index.html` 已切换到新 bundle
