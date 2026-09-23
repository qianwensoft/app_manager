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
import {
  ChevronRight,
  Download,
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
  downloadSharedUrl,
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
    if (node.node_type === 'folder') {
      toggleFolder(node.id)
      if (node.children && node.children.length > 0) {
        // 选中文件夹时默认显示第一个子节点内容
        const firstChild = findFirstLeaf(node)
        if (firstChild) {
          setSelectedNode(firstChild)
          loadContent(firstChild)
        }
      }
    } else {
      loadContent(node)
    }
    // 移动端：点击节点后自动关闭抽屉，让用户看到内容
    if (isMobile) {
      setDrawerOpen(false)
    }
  }

  const findFirstLeaf = (node: TreeNode): TreeNode | null => {
    if (node.node_type !== 'folder' || !node.children?.length) return node
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
              <div style={styles.contentHeader}>
                <span style={styles.contentTitle}>{selectedNode.name}</span>
                {selectedNode.node_type !== 'folder' && selectedNode.storage_path && (
                  <a
                    style={styles.downloadBtn}
                    href={downloadSharedUrl(selectedNode.id, code, shareToken)}
                    download
                  >
                    <Download size={14} />
                    {!isMobile && <span>下载</span>}
                  </a>
                )}
              </div>
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
                    <MarkdownView content={contentState.content} isMobile={isMobile} />
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
          {isFolder && (
            <ChevronRight
              size={14}
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                flexShrink: 0,
              }}
              color="#9ca3af"
            />
          )}
          {!isFolder && <span style={{ width: 14, flexShrink: 0 }} />}
          {icon}
          <span style={styles.nodeName}>{node.name}</span>
        </div>
        {isFolder && isExpanded && node.children && (
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
// Markdown 渲染（简化版，纯文本 + 标题）
// ---------------------------------------------------------------------------

function MarkdownView({ content, isMobile }: { content: string; isMobile: boolean }) {
  const lines = content.split('\n')
  const baseFontSize = isMobile ? 15 : 14
  return (
    <div
      style={{
        ...styles.markdown,
        fontSize: baseFontSize,
        lineHeight: isMobile ? 1.65 : 1.7,
      }}
    >
      {lines.map((line, i) => {
        if (line.startsWith('# '))
          return (
            <h1
              key={i}
              style={{
                ...styles.h1,
                fontSize: isMobile ? 20 : 22,
                margin: isMobile ? '14px 0 6px' : '16px 0 8px',
              }}
            >
              {line.slice(2)}
            </h1>
          )
        if (line.startsWith('## '))
          return (
            <h2
              key={i}
              style={{
                ...styles.h2,
                fontSize: isMobile ? 17 : 18,
                margin: isMobile ? '12px 0 4px' : '14px 0 6px',
              }}
            >
              {line.slice(3)}
            </h2>
          )
        if (line.startsWith('### '))
          return (
            <h3
              key={i}
              style={{ ...styles.h3, fontSize: isMobile ? 15 : 15 }}
            >
              {line.slice(4)}
            </h3>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} style={styles.li}>{line.slice(2)}</li>
        if (line.trim() === '') return <br key={i} />
        return <p key={i} style={styles.p}>{line}</p>
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function ensureTreeStructure(nodes: DocumentNode[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  nodes.forEach((n) => {
    const treeNode = map.get(n.id)!
    if (n.parent_id == null) {
      roots.push(treeNode)
    } else {
      const parent = map.get(n.parent_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(treeNode)
      } else {
        roots.push(treeNode)
      }
    }
  })
  return roots
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
  contentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    flexShrink: 0,
    gap: 8,
  },
  contentTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    fontSize: 12,
    color: '#374151',
    background: '#f3f4f6',
    borderRadius: 4,
    textDecoration: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    minHeight: 32,
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
  h1: { fontWeight: 700, color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 },
  h2: { fontWeight: 600, color: '#1f2937' },
  h3: { fontWeight: 600, color: '#374151' },
  p: { margin: '4px 0', color: '#4b5563' },
  li: { margin: '3px 0 3px 20px', color: '#4b5563' },
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
