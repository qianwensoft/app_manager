/**
 * AgentDocPreview.tsx
 *
 * Agent 端专用文档项目只读预览页面。
 * 路由：/preview/doc/:code?share=<token>
 *
 * 与 ProjectDocsPage 的区别：
 * - 无协同编辑功能（不加载 Yjs WebSocket，避免 JWT 认证问题）
 * - 无 AI 助手面板
 * - 无写操作按钮（上传/新建/删除等）
 * - 无权限检查，直接以只读分享模式运行
 * - 专门适配 Agent WebView 的简洁布局
 *
 * 响应式行为：
 * - 桌面端（>= 768px）：左侧目录可收起/展开，收起后只显示图标列
 * - 移动端（<  768px）：左侧目录作为抽屉式浮层，默认关闭；点击树节点后自动关闭
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UrlTransform as ReactMarkdownUrlTransform } from 'react-markdown'
import { openImageLightbox } from '../components/ImageLightbox'
import {
  ChevronRight,
  BookOpen,
  FileText,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react'
import {
  fetchSharedProjectByCode,
  fetchSharedNodes,
  fetchSharedContent,
  getShareToken,
} from '../api/documents'
import type { DocumentNode, DocumentProject } from '../api/types'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface TreeNode extends DocumentNode {
  children?: TreeNode[]
}

interface ContentState {
  loading: boolean
  content: string
  error: string | null
}

type Breakpoint = 'mobile' | 'desktop'

const MOBILE_BREAKPOINT_PX = 768
const COLLAPSE_STORAGE_KEY = 'agent_doc_preview_sidebar_collapsed'

// ---------------------------------------------------------------------------
// 响应式工具：使用 matchMedia 监听视口变化，避免在 resize 中重渲染整个组件
// ---------------------------------------------------------------------------

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop'
    return window.innerWidth < MOBILE_BREAKPOINT_PX ? 'mobile' : 'desktop'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setBp(e.matches ? 'mobile' : 'desktop')
    }
    // 兼容旧 API（<= Safari 13.1）
    if (mql.addEventListener) mql.addEventListener('change', handler)
    else mql.addListener(handler)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler)
      else mql.removeListener(handler)
    }
  }, [])
  return bp
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export default function AgentDocPreview() {
  const params = useParams<{ code: string }>()
  const code = params.code!
  const shareToken = getShareToken()

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'

  const [project, setProject] = useState<DocumentProject | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<DocumentNode | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [contentState, setContentState] = useState<ContentState>({ loading: false, content: '', error: null })

  // 桌面端：sidebar 是否「收起」到只显示图标列
  // 移动端：用 drawer 模式，drawerOpen 控制浮层是否展开
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 切到桌面端时关闭 drawer；切到移动端时强制展开（确保首次显示目录）
  useEffect(() => {
    if (isMobile) {
      setDrawerOpen(false)
    }
  }, [isMobile])

  // 持久化 collapsed 状态
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [collapsed])

  // 加载项目信息
  useEffect(() => {
    setProjectLoading(true)
    setProjectError(null)
    fetchSharedProjectByCode(code, shareToken)
      .then((p) => {
        setProject(p)
        if (!p) {
          setProjectError('未找到该项目')
        }
        setProjectLoading(false)
      })
      .catch((err) => {
        setProjectError(err?.message || '加载项目失败')
        setProjectLoading(false)
      })
  }, [code, shareToken])

  // 加载节点树
  useEffect(() => {
    if (!projectLoading) {
      setNodesLoading(true)
      fetchSharedNodes(code, shareToken)
        .then((data) => {
          setNodes(ensureTreeStructure(data))
          setNodesLoading(false)
        })
        .catch(() => {
          setNodes([])
          setNodesLoading(false)
        })
    }
  }, [code, shareToken, projectLoading])

  // 过滤出属于该项目的根节点及其子树
  const projectNodes = useMemo(() => {
    if (!project?.root_node_id) return nodes
    const filtered = nodes.filter((n) => n.id === project.root_node_id)
    return filtered
  }, [project, nodes])

  // 初始化：自动选中项目根节点
  useEffect(() => {
    if (projectNodes.length > 0 && !selectedNode) {
      const root = projectNodes[0]
      setSelectedNode(root)
      setExpandedFolders(new Set([root.id]))
      if (root.node_type !== 'folder') {
        loadContent(root)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectNodes])

  // 加载文档内容
  const loadContent = (node: DocumentNode) => {
    if (node.node_type === 'folder') return
    setContentState({ loading: true, content: '', error: null })
    fetchSharedContent(node.id, code, shareToken)
      .then((content) => {
        setContentState({ loading: false, content, error: null })
      })
      .catch((err) => {
        setContentState({ loading: false, content: '', error: err?.message || '加载内容失败' })
      })
  }

  const handleNodeClick = (node: TreeNode) => {
    setSelectedNode(node)
    const hasChildren = !!node.children && node.children.length > 0
    if (hasChildren) {
      toggleFolder(node.id)
      // 选中父节点时默认显示第一个子节点内容，让右侧有内容可看
      const firstChild = findFirstLeaf(node)
      if (firstChild && firstChild.id !== node.id) {
        setSelectedNode(firstChild)
        loadContent(firstChild)
      } else if (node.node_type !== 'folder') {
        // 根节点本身就是 doc 但挂着子节点（非典型结构），先选中自身再让用户继续展开
        loadContent(node)
      }
    } else {
      loadContent(node)
    }
    // 抽屉（移动端侧栏）保持打开，方便用户连续浏览多个文档。
    // 关闭入口：
    //  - 顶部汉堡按钮（drawerOpen 时显示为 X 图标）
    //  - 点击抽屉外的半透明遮罩
    // 之前会自动 setDrawerOpen(false)，但实际使用中用户经常需要切换多篇文档，
    // 自动收起会强制重新点开抽屉，UX 不顺。
  }

  const findFirstLeaf = (node: TreeNode): TreeNode | null => {
    if (!node.children?.length) return node
    return findFirstLeaf(node.children[0])
  }

  const toggleFolder = (id: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  if (projectLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <BookOpen size={32} color="#6b7280" />
          <span>加载项目中...</span>
        </div>
      </div>
    )
  }

  if (projectError || !project) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <span>{projectError || '未找到项目'}</span>
          <button style={styles.btn} onClick={() => history.back()}>
            返回
          </button>
        </div>
      </div>
    )
  }

  // 侧边栏可见性：根据视口模式采用收起 / 抽屉两种交互
  // - 桌面端收起：sidebar 缩成 56px 图标列（仍可见入口图标和当前路径提示）
  // - 移动端抽屉：sidebar 默认关闭，drawerOpen 时浮层显示
  const sidebarVisibleMobile = drawerOpen
  const showSidebarDesktopRail = !collapsed

  return (
    <div style={styles.container}>
      {/* 顶部栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {isMobile ? (
            // 移动端：用汉堡按钮打开抽屉
            <button
              aria-label={drawerOpen ? '关闭目录' : '打开目录'}
              style={{ ...styles.iconBtn, ...styles.iconBtnMobile }}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              {drawerOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          ) : (
            // 桌面端：收起 / 展开侧栏
            <button
              aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              style={styles.iconBtn}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
          {project.icon && <span style={{ fontSize: 20 }}>{project.icon}</span>}
          <span style={styles.projectName}>{project.name}</span>
          <span style={styles.badge}>只读预览</span>
        </div>
        {/* 桌面端：右侧给一个锚点，避免 headerLeft 独占时过于靠左；移动端隐藏以节省空间 */}
        {!isMobile && (
          <div style={styles.headerRight}>
            <span style={styles.headerHint}>
              {collapsed ? '已收起目录' : '点击文件名查看内容'}
            </span>
          </div>
        )}
      </div>

      {/* 主体内容 */}
      <div style={styles.body}>
        {/* 桌面端：收起时显示图标列；展开时显示完整目录 */}
        {!isMobile && (
          <aside
            style={{
              ...styles.sidebar,
              ...(collapsed ? styles.sidebarCollapsed : styles.sidebarExpanded),
            }}
            aria-hidden={collapsed}
          >
            {collapsed ? (
              <SidebarRail
                projectIcon={project.icon}
                projectName={project.name}
                onExpand={() => setCollapsed(false)}
              />
            ) : (
              <>
                <div style={styles.sidebarTitle}>
                  <Folder size={14} />
                  <span>文档目录</span>
                </div>
                <div style={styles.treeContainer}>
                  {nodesLoading ? (
                    <div style={styles.loadingSmall}>加载中...</div>
                  ) : projectNodes.length === 0 ? (
                    <div style={styles.emptySmall}>暂无文档</div>
                  ) : (
                    projectNodes.map((node) => renderTreeNode(node, 0))
                  )}
                </div>
              </>
            )}
          </aside>
        )}

        {/* 移动端：抽屉式侧栏 */}
        {isMobile && (
          <>
            <div
              style={{
                ...styles.backdrop,
                opacity: sidebarVisibleMobile ? 1 : 0,
                pointerEvents: sidebarVisibleMobile ? 'auto' : 'none',
              }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside
              style={{
                ...styles.sidebar,
                ...styles.sidebarDrawer,
                transform: sidebarVisibleMobile ? 'translateX(0)' : 'translateX(-100%)',
              }}
              aria-hidden={!sidebarVisibleMobile}
            >
              <div style={styles.drawerHeader}>
                <span style={styles.drawerTitle}>
                  {project.icon && <span style={{ marginRight: 6 }}>{project.icon}</span>}
                  {project.name}
                </span>
                <button
                  aria-label="关闭目录"
                  style={styles.iconBtn}
                  onClick={() => setDrawerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={styles.sidebarTitle}>
                <Folder size={14} />
                <span>文档目录</span>
              </div>
              <div style={styles.treeContainer}>
                {nodesLoading ? (
                  <div style={styles.loadingSmall}>加载中...</div>
                ) : projectNodes.length === 0 ? (
                  <div style={styles.emptySmall}>暂无文档</div>
                ) : (
                  projectNodes.map((node) => renderTreeNode(node, 0))
                )}
              </div>
            </aside>
          </>
        )}

        {/* 右侧内容区 */}
        <main style={styles.content}>
          {selectedNode ? (
            <>
              <div
                style={{
                  ...styles.contentBody,
                  padding: isMobile ? 14 : 20,
                }}
              >
                {contentState.loading ? (
                  <div style={styles.loadingCenter}>加载内容中...</div>
                ) : contentState.error ? (
                  <div style={styles.errorInline}>{contentState.error}</div>
                ) : selectedNode.node_type === 'folder' ? (
                  <div style={styles.folderContent}>
                    <FileText size={isMobile ? 36 : 48} color="#9ca3af" />
                    <span>
                      {isMobile
                        ? '在目录中选择文档'
                        : '选择左侧目录中的文档查看内容'}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      ...styles.markdownContent,
                      maxWidth: isMobile ? '100%' : 720,
                    }}
                  >
                    <MarkdownView content={contentState.content} isMobile={isMobile} code={code} shareToken={shareToken} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.loadingCenter}>
              {isMobile ? '请选择文档' : '选择左侧文档查看内容'}
            </div>
          )}
        </main>
      </div>

      {/* 移动端浮动按钮：仅在 drawer 关闭时显示，便于唤起目录 */}
      {isMobile && !drawerOpen && (
        <button
          aria-label="打开目录"
          style={styles.fab}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>
      )}
    </div>
  )

  // ---------------------------------------------------------------------------
  // 树节点渲染
  // ---------------------------------------------------------------------------

  function renderTreeNode(node: TreeNode, depth: number): React.ReactNode {
    const isFolder = node.node_type === 'folder'
    // 只要有 children（不论 node_type）都允许展开 —— 项目根节点可能是 doc 类型但仍挂着子节点。
    const hasChildren = !!node.children && node.children.length > 0
    const isExpanded = expandedFolders.has(node.id)
    const isSelected = selectedNode?.id === node.id

    const icon = isFolder ? (
      <Folder size={16} color="#f59e0b" />
    ) : (
      <FileText size={16} color="#6b7280" />
    )

    return (
      <div key={node.id}>
        <div
          style={{
            ...styles.treeNode,
            paddingLeft: isMobile ? 10 + depth * 16 : 12 + depth * 16,
            paddingRight: isMobile ? 10 : 8,
            paddingTop: isMobile ? 8 : 6,
            paddingBottom: isMobile ? 8 : 6,
            minHeight: isMobile ? 40 : undefined,
            background: isSelected ? '#e0f2fe' : 'transparent',
            color: isSelected ? '#0369a1' : '#374151',
          }}
          onClick={() => handleNodeClick(node)}
        >
          {hasChildren ? (
            <ChevronRight
              size={14}
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                flexShrink: 0,
              }}
              color="#9ca3af"
            />
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          {icon}
          <span style={styles.nodeName}>{node.name}</span>
        </div>
        {hasChildren && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }
}

// ---------------------------------------------------------------------------
// 桌面端收起态侧栏：只显示项目图标 + 展开按钮，节省空间
// ---------------------------------------------------------------------------

function SidebarRail({
  projectIcon,
  projectName,
  onExpand,
}: {
  projectIcon?: string
  projectName: string
  onExpand: () => void
}) {
  return (
    <div style={styles.rail}>
      {/* 静态项目标识：仅展示当前项目图标，不触发任何交互 */}
      <div
        title={projectName}
        aria-label={projectName}
        style={styles.railProjectIcon}
      >
        <span style={{ fontSize: 18 }}>{projectIcon || '📄'}</span>
      </div>
      <span style={styles.railDivider} />
      {/* 唯一的展开入口：避免两个按钮都能触发造成用户认知歧义 */}
      <button
        aria-label="展开侧栏"
        title="展开目录"
        style={{ ...styles.iconBtn, ...styles.railIconBtn }}
        onClick={onExpand}
      >
        <PanelLeftOpen size={18} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown 渲染：使用 react-markdown + remark-gfm，与编辑器端的 SharedMarkdownContent
// 保持一致，确保 Agent WebView 上能看到表格、任务列表、代码块、Callout、折叠块、
// Doc Embed 等所有插件扩展。
// ---------------------------------------------------------------------------

function MarkdownView({ content, isMobile, code, shareToken }: { content: string; isMobile: boolean; code: string; shareToken: string }) {
  const baseFontSize = isMobile ? 15 : 14
  const lineHeight = isMobile ? 1.65 : 1.7

  // 文档上下文：Agent 端无登录态，但 embed iframe 仍需要 pageContext.documentId 才能
  // 让内嵌 form-app 拿到正确的运行参数。这里从内容里抓不出配置，只能给个空对象兜底。
  const documentContext = useMemo(
    () => ({ globalContext: {} as Record<string, any>, pageContext: {} as Record<string, any> }),
    [],
  )

  return (
    <div
      className="agent-md-body"
      style={{
        ...styles.markdown,
        fontSize: baseFontSize,
        lineHeight,
      }}
    >
      <SharedMarkdownContent markdown={content} documentContext={documentContext} code={code} shareToken={shareToken} />
    </div>
  )
}

/**
 * 与 MarkdownEditor.tsx::SharedMarkdownContent 等价的实现：
 * - 用 `<ReactMarkdown remarkPlugins={[remarkGfm]}>` 渲染 GFM（表格、任务列表、
 *   删除线、自动链接等）以及标准 markdown
 * - 编辑器扩展（callout `:::info ... :::`、toggle `<details>...</details>`、
 *   doc-embed `<div class="doc-embed">`）在 markdown 解析前先切片为独立块，
 *   用专用 React 组件渲染。这些语法不在 CommonMark / GFM 标准里，
 *   `react-markdown` 默认会按普通段落渲染甚至转义 HTML，因此必须预处理。
 */
function SharedMarkdownContent({
  markdown,
  documentContext,
  code,
  shareToken,
}: {
  markdown: string
  documentContext: { globalContext?: Record<string, any>; pageContext?: Record<string, any> }
  code: string
  shareToken: string
}) {
  // 三类扩展块：callout / toggle / doc-embed。用同一套 sliceParts 把它们从 markdown 里
  // 切出来，剩下的纯 markdown 段落统一交给 ReactMarkdown。
  const parts = useMemo(() => sliceNotionBlocks(markdown), [markdown])
  // 工厂依赖 code/shareToken，仅在它们变化时重新构造组件映射（图片 URL 改写需要它们）。
  const components = useMemo(() => createMarkdownComponents(code, shareToken), [code, shareToken])

  // react-markdown v9 内置 `defaultUrlTransform` 仅放行 http(s)/irc(s)/mailto/xmpp 协议，
  // 会把 `data:image/png;base64,...` 整段截成空串 —— 表现就是「内嵌 base64 图片在 Agent 端
  // 不显示」。这里自定义 urlTransform 原样放行所有协议（含 data:、blob:），具体协议净化留给
  // components.img 的字符串替换处理（登录态下载链接 → 分享态免登录链接）。这样比把所有
  // URL 处理都堆在 urlTransform 里更清晰，职责单一。
  const urlTransform = useMemo<ReactMarkdownUrlTransform>(
    () => (value) => value,
    [],
  )

  return (
    <>
      {parts.map((part, index) => {
        switch (part.type) {
          case 'callout': {
            return (
              <div
                key={index}
                className={`agent-md-callout callout-${part.kind}`}
                data-type={part.kind}
              >
                <div className="agent-md-callout-icon" aria-hidden="true">
                  {CALLOUT_ICON[part.kind] || CALLOUT_ICON.info}
                </div>
                <div className="agent-md-callout-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
                    {part.body}
                  </ReactMarkdown>
                </div>
              </div>
            )
          }
          case 'toggle': {
            return (
              <details
                key={index}
                className="agent-md-toggle"
                {...(part.open ? { open: true } : {})}
              >
                <summary className="agent-md-toggle-summary">{part.summary}</summary>
                <div className="agent-md-toggle-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
                    {part.body}
                  </ReactMarkdown>
                </div>
              </details>
            )
          }
          case 'embed': {
            return (
              <DocEmbedFrame
                key={index}
                kind={part.kind}
                config={part.config}
                documentContext={documentContext}
              />
            )
          }
          case 'markdown':
          default:
            return (
              <ReactMarkdown
                key={index}
                remarkPlugins={[remarkGfm]}
                components={components}
                urlTransform={urlTransform}
              >
                {part.value}
              </ReactMarkdown>
            )
        }
      })}
    </>
  )
}

type SlicePart =
  | { type: 'markdown'; value: string }
  | { type: 'callout'; kind: string; body: string }
  | { type: 'toggle'; open: boolean; summary: string; body: string }
  | { type: 'embed'; kind: string; config: Record<string, any> }

/**
 * 把 markdown 文本里的编辑器扩展块（callout / toggle / doc-embed）切片出来，
 * 剩余的普通 markdown 段落保留在 markdown 类型的 part 中。
 *
 * 顺序很重要：先匹配多行的 `<details>...</details>` 和 `:::type ... :::`，再匹配
 * 单行的 `<div class="doc-embed" ...>`。所有正则都要求块首尾独占一行，避免误匹配嵌入
 * 在段落里的代码片段。
 */
function sliceNotionBlocks(md: string): SlicePart[] {
  const parts: SlicePart[] = []
  // 用一个游标顺序扫描，遇到首个匹配就切片并前进游标
  const blockPatterns: Array<{
    test: (s: string, start: number) => { match: RegExpExecArray; length: number } | null
  }> = [
    // 1) :::type\n...\n::: — callout
    {
      test(s, start) {
        const rest = s.slice(start)
        // 必须从行首开始；info/warning/error/success 是已知类型
        const m = /^:::([a-z]+)\n([\s\S]*?)\n:::(?=\n|$)/m.exec(rest)
        if (!m) return null
        return { match: m, length: m[0].length }
      },
    },
    // 2) <details ...>\n...\n</details> — toggle
    {
      test(s, start) {
        const rest = s.slice(start)
        // 匹配 <details> 或 <details open> 开头的多行块
        const m = /^<details(\s[^>]*)?>\n([\s\S]*?)\n<\/details>(?=\n|$)/m.exec(rest)
        if (!m) return null
        return { match: m, length: m[0].length }
      },
    },
    // 3) <div class="doc-embed" data-kind=... data-config=...></div>
    {
      test(s, start) {
        const rest = s.slice(start)
        const m = /^<div class="doc-embed" data-kind="([^"]+)" data-config="([^"]*)"><\/div>(?=\n|$)/m.exec(
          rest,
        )
        if (!m) return null
        return { match: m, length: m[0].length }
      },
    },
  ]

  let cursor = 0
  while (cursor < md.length) {
    let earliest: { absIndex: number; match: RegExpExecArray; length: number; patternIdx: number } | null = null
    for (let i = 0; i < blockPatterns.length; i++) {
      const sub = md.slice(cursor)
      const r = blockPatterns[i].test(sub, 0)
      if (!r) continue
      // `r.match.index` 是相对于 sub 的位置（即绝对位置 = cursor + m.index）。
      const absIndex = cursor + r.match.index
      if (!earliest || absIndex < earliest.absIndex) {
        earliest = { absIndex, match: r.match, length: r.length, patternIdx: i }
      }
    }
    if (!earliest) break
    // 把 match 之前的 markdown 累积到一个 markdown 段
    if (earliest.absIndex > cursor) {
      const between = md.slice(cursor, earliest.absIndex)
      pushMarkdown(parts, between)
    }
    const m = earliest.match
    switch (earliest.patternIdx) {
      case 0: {
        parts.push({ type: 'callout', kind: m[1] || 'info', body: (m[2] || '').trim() })
        break
      }
      case 1: {
        const attrs = (m[1] || '').trim()
        const open = /\bopen\b/.test(attrs)
        const inner = (m[2] || '').trim()
        const { summary, body } = splitToggle(inner)
        parts.push({ type: 'toggle', open, summary, body })
        break
      }
      case 2: {
        let config: Record<string, any> = {}
        try {
          config = JSON.parse(decodeURIComponent(m[2] || ''))
        } catch {
          /* ignore invalid embed */
        }
        parts.push({ type: 'embed', kind: m[1] || 'form-app', config })
        break
      }
    }
    cursor = earliest.absIndex + earliest.length
  }
  if (cursor < md.length) {
    pushMarkdown(parts, md.slice(cursor))
  }
  if (parts.length === 0) parts.push({ type: 'markdown', value: md })
  return parts
}

function pushMarkdown(parts: SlicePart[], chunk: string) {
  const value = chunk.trim()
  if (!value) return
  parts.push({ type: 'markdown', value })
}

/**
 * toggle 序列化格式：`<summary>title</summary>\ncontent\n`
 * 把 summary 单独抽出来，剩下的作为内容体。
 */
function splitToggle(inner: string): { summary: string; body: string } {
  const summaryRe = /^<summary>([\s\S]*?)<\/summary>\s*(?:\n|$)/
  const m = summaryRe.exec(inner)
  if (!m) return { summary: inner, body: '' }
  return { summary: m[1], body: inner.slice(m[0].length).trim() }
}

const CALLOUT_ICON: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '⛔',
  success: '✅',
}

/**
 * react-markdown 的 components 映射：把常见 markdown 元素映射到带 className 的标签，
 * 由 `index.css` 中的 `.agent-md-body` 选择器统一样式（与编辑端的 `.pm-host .ProseMirror`
 * 风格一致，但作用域隔离，避免污染 docs-app 其它页面）。
 *
 * 工厂函数：传入项目 code 与分享 token，让 img 渲染器把编辑态写入的登录态下载链接
 * `/api/docs/nodes/:id/download?token=...` 改写为分享态免登录链接
 * `/api/docs/share/projects/code/:code/nodes/:id/download?share=<token>`，
 * 否则 Agent WebView 在无 JWT 场景下图片无法加载。
 */
function createMarkdownComponents(code: string, shareToken: string) {
  // 匹配 `/api/docs/nodes/<id>/download?...`，捕获节点 id；其余形态（http(s)/data/绝对路径）原样保留。
  const AUTH_DOWNLOAD_RE = /^\/api\/docs\/nodes\/(\d+)\/download(\?.*)?$/
  return {
    a: ({ node: _node, ...props }: any) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    table: ({ node: _node, ...props }: any) => <table className="agent-md-table" {...props} />,
    th: ({ node: _node, ...props }: any) => <th {...props} />,
    td: ({ node: _node, ...props }: any) => <td {...props} />,
    // 让 GitHub 风格任务列表（- [ ] / - [x]）渲染为带 className 的 ul/li，便于 CSS 美化。
    ul: ({ node: _node, className, ...props }: any) => {
      const isTask = /task-list/.test(className || '')
      return <ul className={isTask ? 'agent-md-task-list' : undefined} {...props} />
    },
    li: ({ node: _node, className, children, ...props }: any) => {
      const isTaskItem = /task-item/.test(className || '')
      if (isTaskItem) {
        const checked = /checked/.test(className || '')
        return (
          <li className={checked ? 'agent-md-task-item checked' : 'agent-md-task-item'} {...props}>
            <input type="checkbox" checked={checked} readOnly className="agent-md-task-checkbox" />
            <span className="agent-md-task-content">{children}</span>
          </li>
        )
      }
      return <li {...props}>{children}</li>
    },
    // 折叠块：react-markdown 直接吐出 <details>/<summary>，加 className 让 CSS 接管样式。
    details: ({ node: _node, ...props }: any) => <details className="agent-md-toggle" {...props} />,
    summary: ({ node: _node, ...props }: any) => <summary className="agent-md-toggle-summary" {...props} />,
    // 代码：让 ```` ``` ```` 围栏渲染为带 className 的 pre。
    pre: ({ node: _node, ...props }: any) => <pre className="agent-md-pre" {...props} />,
    code: ({ node: _node, className, ...props }: any) => {
      const isBlock = /language-/.test(className || '')
      return isBlock ? <code className={className} {...props} /> : <code className="agent-md-code-inline" {...props} />
    },
    // 引用、分割线、标题交给 CSS。
    blockquote: ({ node: _node, ...props }: any) => <blockquote className="agent-md-quote" {...props} />,
    hr: ({ node: _node, ...props }: any) => <hr className="agent-md-hr" {...props} />,
    h1: ({ node: _node, ...props }: any) => <h1 className="agent-md-h1" {...props} />,
    h2: ({ node: _node, ...props }: any) => <h2 className="agent-md-h2" {...props} />,
    h3: ({ node: _node, ...props }: any) => <h3 className="agent-md-h3" {...props} />,
    h4: ({ node: _node, ...props }: any) => <h4 className="agent-md-h4" {...props} />,
    h5: ({ node: _node, ...props }: any) => <h5 className="agent-md-h5" {...props} />,
    h6: ({ node: _node, ...props }: any) => <h6 className="agent-md-h6" {...props} />,
    p: ({ node: _node, ...props }: any) => <p className="agent-md-p" {...props} />,
    img: ({ node: _node, src, alt, ...props }: any) => {
      const rewritten = typeof src === 'string'
        ? src.replace(AUTH_DOWNLOAD_RE, (_match, id: string, qs: string | undefined) => {
            const extra = qs && qs.length > 0 ? `&${qs.slice(1)}` : ''
            return `/api/docs/share/projects/code/${encodeURIComponent(code)}/nodes/${id}/download?share=${encodeURIComponent(shareToken)}${extra}`
          })
        : src
      const altText = typeof alt === 'string' ? alt : ''
      return (
        <img
          className="agent-md-img"
          src={rewritten}
          alt={altText}
          loading="lazy"
          // 点击触发全局 ImageLightbox：黑底全屏 + 旋转/缩放/拖动/双指捏合。
          // stopPropagation 防止冒泡到外层容器；空 src（被 urlTransform 吞掉的）不响应。
          onClick={(e) => {
            if (typeof rewritten === 'string' && rewritten.length > 0) {
              e.stopPropagation()
              openImageLightbox(rewritten, altText)
            }
          }}
          {...props}
        />
      )
    },
  }
}

function DocEmbedFrame({
  kind,
  config,
  documentContext,
}: {
  kind: string
  config: Record<string, any>
  documentContext: { globalContext?: Record<string, any>; pageContext?: Record<string, any> }
}) {
  const values = {
    ...(documentContext.globalContext || {}),
    ...(documentContext.pageContext || {}),
    ...(config.params || {}),
    ...(config.globalContext || {}),
    ...(config.pageContext || {}),
  }
  const query = new URLSearchParams({ embed: '1' })
  if (config.pageKey) query.set('page', String(config.pageKey))
  Object.entries(values).forEach(([key, value]) => {
    if (value != null) query.set(`p_${key}`, String(value))
  })
  const src =
    kind === 'scada'
      ? `/scada-editor/share/${encodeURIComponent(config.shareToken || '')}?${query.toString()}`
      : `/form-app/runtime/${encodeURIComponent(config.formCode || '')}?${query.toString()}`
  return (
    <div className="doc-embed-node">
      <iframe
        className="doc-embed-frame"
        src={src}
        title={kind === 'scada' ? '已发布组态' : 'form-app'}
        loading="lazy"
        allow="fullscreen"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function ensureTreeStructure(nodes: DocumentNode[]): TreeNode[] {
  // 后端返回的是嵌套结构：每个节点的 children 已经塞好了子树。
  // 直接递归深拷贝即可，**不要**重置 children 或基于 parent_id 重组 —— 共享项目接口
  // 只返回项目根节点这一项，平铺重组会让所有后代丢失。
  function copy(n: DocumentNode): TreeNode {
    return {
      ...n,
      children: n.children?.map(copy) || [],
    }
  }
  return nodes.map(copy)
}

// ---------------------------------------------------------------------------
// 样式（内联）
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f9fafb',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    position: 'relative',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: '100%',
    color: '#6b7280',
    fontSize: 14,
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    height: '100%',
    color: '#ef4444',
    fontSize: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
    gap: 8,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#9ca3af',
    fontSize: 12,
    flexShrink: 0,
  },
  headerHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  projectName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 11,
    padding: '2px 6px',
    background: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: 4,
    fontWeight: 500,
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    transition: 'width 0.2s ease',
  },
  sidebarExpanded: {
    width: 240,
    minWidth: 240,
  },
  sidebarCollapsed: {
    width: 56,
    minWidth: 56,
    borderRight: '1px solid #f3f4f6',
    background: '#fafafa',
  },
  sidebarDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '85%',
    maxWidth: 320,
    minWidth: 240,
    zIndex: 20,
    boxShadow: '4px 0 16px rgba(0,0,0,0.08)',
    transition: 'transform 0.22s ease',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #f3f4f6',
    background: '#fff',
    flexShrink: 0,
  },
  drawerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    zIndex: 15,
    transition: 'opacity 0.2s ease',
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    gap: 8,
    height: '100%',
  },
  railProjectIcon: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    background: '#fff',
    border: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  railIconBtn: {
    width: 40,
    height: 40,
  },
  railDivider: {
    width: 24,
    height: 1,
    background: '#e5e7eb',
    margin: '4px 0',
  },
  sidebarTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    borderBottom: '1px solid #f3f4f6',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '6px 0',
    WebkitOverflowScrolling: 'touch',
  },
  loadingSmall: {
    padding: '16px 12px',
    fontSize: 13,
    color: '#9ca3af',
  },
  emptySmall: {
    padding: '16px 12px',
    fontSize: 13,
    color: '#9ca3af',
  },
  treeNode: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: 13,
    borderRadius: 4,
    margin: '1px 6px',
    transition: 'background 0.1s',
    userSelect: 'none',
  },
  nodeName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  contentBody: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
    WebkitOverflowScrolling: 'touch',
  },
  loadingCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
    fontSize: 14,
  },
  errorInline: {
    padding: 20,
    color: '#ef4444',
    fontSize: 13,
  },
  folderContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: '100%',
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    padding: '0 16px',
  },
  markdownContent: {
    maxWidth: 720,
    margin: '0 auto',
  },
  markdown: {
    color: '#374151',
    lineHeight: 1.7,
    wordBreak: 'break-word',
  },
  btn: {
    padding: '6px 16px',
    fontSize: 13,
    color: '#fff',
    background: '#3b82f6',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  iconBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#4b5563',
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  iconBtnMobile: {
    width: 40,
    height: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10,
  },
}
