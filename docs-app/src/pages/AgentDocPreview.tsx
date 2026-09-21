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
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronRight, Download, Home, BookOpen, FileText, Folder, File } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export default function AgentDocPreview() {
  const params = useParams<{ code: string }>()
  const code = params.code!
  const shareToken = getShareToken()

  const [project, setProject] = useState<DocumentProject | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<DocumentNode | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [contentState, setContentState] = useState<ContentState>({ loading: false, content: '', error: null })

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

  return (
    <div style={styles.container}>
      {/* 顶部栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {project.icon && <span style={{ fontSize: 20 }}>{project.icon}</span>}
          <span style={styles.projectName}>{project.name}</span>
          <span style={styles.badge}>只读预览</span>
        </div>
      </div>

      {/* 主体内容 */}
      <div style={styles.body}>
        {/* 左侧目录树 */}
        <div style={styles.sidebar}>
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
        </div>

        {/* 右侧内容区 */}
        <div style={styles.content}>
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
                    下载
                  </a>
                )}
              </div>
              <div style={styles.contentBody}>
                {contentState.loading ? (
                  <div style={styles.loadingCenter}>加载内容中...</div>
                ) : contentState.error ? (
                  <div style={styles.errorInline}>{contentState.error}</div>
                ) : selectedNode.node_type === 'folder' ? (
                  <div style={styles.folderContent}>
                    <FileText size={48} color="#9ca3af" />
                    <span>选择左侧目录中的文档查看内容</span>
                  </div>
                ) : (
                  <div style={styles.markdownContent}>
                    <MarkdownView content={contentState.content} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.loadingCenter}>选择左侧文档查看内容</div>
          )}
        </div>
      </div>
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
      isExpanded ? <Folder size={16} color="#f59e0b" /> : <Folder size={16} color="#f59e0b" />
    ) : (
      <FileText size={16} color="#6b7280" />
    )

    return (
      <div key={node.id}>
        <div
          style={{
            ...styles.treeNode,
            paddingLeft: 12 + depth * 16,
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
// Markdown 渲染（简化版，纯文本 + 标题）
// ---------------------------------------------------------------------------

function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div style={styles.markdown}>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} style={styles.h1}>{line.slice(2)}</h1>
        if (line.startsWith('## ')) return <h2 key={i} style={styles.h2}>{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} style={styles.h3}>{line.slice(4)}</h3>
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
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  projectName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
  },
  badge: {
    fontSize: 11,
    padding: '2px 6px',
    background: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: 4,
    fontWeight: 500,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 240,
    background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
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
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '6px 0',
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
  },
  contentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    flexShrink: 0,
  },
  contentTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 12,
    color: '#374151',
    background: '#f3f4f6',
    borderRadius: 4,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  contentBody: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
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
  },
  markdownContent: {
    maxWidth: 720,
    margin: '0 auto',
  },
  markdown: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 1.7,
  },
  h1: { fontSize: 22, fontWeight: 700, color: '#111827', margin: '16px 0 8px', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 },
  h2: { fontSize: 18, fontWeight: 600, color: '#1f2937', margin: '14px 0 6px' },
  h3: { fontSize: 15, fontWeight: 600, color: '#374151', margin: '12px 0 4px' },
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
}
