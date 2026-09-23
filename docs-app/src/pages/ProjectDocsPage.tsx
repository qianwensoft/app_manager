import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus,
  Upload,
  Download,
  History,
  Trash2,
  Sparkles,
  Pencil,
  Home,
} from 'lucide-react'
import DocTree, { buildDescendantIdSet, type DropZone } from '../components/DocTree'
import DocViewer from '../components/DocViewer'
import NodeModal from '../components/NodeModal'
import VersionModal from '../components/VersionModal'
import AIPanel from '../components/AIPanel'
import DocContextMenu, { type DocContextMenuAction, MenuIcons } from '../components/DocContextMenu'
import { useDocsStore } from '../store'
import {
  fetchNodes,
  fetchPortalPermissions,
  createNode,
  updateNode,
  deleteNode,
  copyNode,
  uploadFile,
  downloadUrl,
  fetchNodeByCode,
  fetchProjectByCode,
  fetchSharedProjectByCode,
  fetchSharedNodes,
  fetchSharedContent,
  downloadSharedUrl,
} from '../api/documents'
import type { DocumentNode, DocumentProject, PortalPermissions } from '../api/types'

const EMPTY_NODES: DocumentNode[] = []

export default function ProjectDocsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const params = useParams<{ code: string }>()
  const projectCode = params.code!

  // 分享模式（由 App.tsx 从 URL ?share= 解析后写入 store）
  const shareMode = useDocsStore((s) => s.shareMode)
  const shareToken = useDocsStore((s) => s.shareToken)

  const selectedNode = useDocsStore((s) => s.selectedNode)
  const setSelectedNode = useDocsStore((s) => s.setSelectedNode)
  const setPerms = useDocsStore((s) => s.setPerms)
  // 订阅 store 中的权限作为兜底：fetchedPerms 还没返回前，先用旧值渲染，避免空白。
  const storedPerms = useDocsStore((s) => s.perms)
  const aiOpen = useDocsStore((s) => s.aiOpen)
  const toggleAI = useDocsStore((s) => s.toggleAI)
  const can = useDocsStore((s) => s.can)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  // 当前 modal 操作的目标节点：右键触发时 = 右键节点；工具栏触发时 = selectedNode。
  // 让「在节点 X 上右键 → 新建子节点/重命名」能准确作用于 X，而不是当前选中节点。
  const [modalTarget, setModalTarget] = useState<DocumentNode | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [selection, setSelection] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    node: DocumentNode
    x: number
    y: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 获取项目信息（分享模式用免登录接口）
  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['doc-project', projectCode, shareToken],
    queryFn: () =>
      shareMode
        ? fetchSharedProjectByCode(projectCode, shareToken)
        : fetchProjectByCode(projectCode),
  })

  // 获取节点树（分享模式用免登录接口；不拉取权限，恒为只读）
  const { data: nodesRaw } = useQuery({
    queryKey: ['doc-nodes', projectCode, shareToken],
    queryFn: () =>
      shareMode
        ? fetchSharedNodes(projectCode, shareToken)
        : fetchNodes(),
    enabled: !projectLoading,
  })

  // 拉取当前用户在文档门户的权限（admin 标识 + 各节点授权）。
  // 必须显式触发：旧实现只从 store 取，但 store 永远不会被任何组件填充，
  // 导致 can() 永远返回 false、canEditSelected 永远为 false、编辑器始终只读。
  // 分享模式下不拉取（前端固定只读）。
  const { data: fetchedPerms } = useQuery({
    queryKey: ['doc-portal-permissions'],
    queryFn: fetchPortalPermissions,
    enabled: !shareMode,
    staleTime: 30_000,
  })

  // 同步 store：让 DocViewer / MarkdownEditor 通过 store.can() 拿到最新权限。
  useEffect(() => {
    if (!shareMode && fetchedPerms) setPerms(fetchedPerms)
  }, [fetchedPerms, shareMode, setPerms])

  // 实际生效的权限：
  // - 分享模式：强制只读
  // - 否则优先用 React Query 拿到的最新数据；store 由上面的 effect 同步，最坏情况退化为 store 缓存值
  // 这样首次拿到 server 数据后立刻就能切到可编辑态，避免「先只读再切可编辑」的闪烁。
  const perms: PortalPermissions = shareMode
    ? { is_admin: false, perms: {} }
    : (fetchedPerms ?? storedPerms ?? { is_admin: false, perms: {} })

  const isAdmin = shareMode ? false : (perms?.is_admin ?? false)

  // 过滤：只显示该项目关联的 root_node 及其子树
  const projectNodes = useMemo(() => {
    if (!project?.root_node_id || nodesRaw?.length === 0) return []
    const rootNode = findNode(nodesRaw ?? [], project.root_node_id)
    return rootNode ? [rootNode] : []
  }, [project, nodesRaw])

  const canEditSelected = selectedNode ? can(selectedNode.id, 'edit') : false
  const canDeleteSelected = selectedNode ? can(selectedNode.id, 'delete') : false
  const canDownloadSelected = selectedNode ? can(selectedNode.id, 'download') : false

  const selectedIdRef = useRef<number | null>(selectedNode?.id ?? null)

  // 初始化：自动选中项目根节点
  useEffect(() => {
    if (!project?.root_node_id || projectNodes.length === 0) return
    const rootNode = projectNodes[0]
    if (selectedIdRef.current !== rootNode.id) {
      selectedIdRef.current = rootNode.id
      setSelectedNode(rootNode)
    }
  }, [project, projectNodes, setSelectedNode])

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id ?? null
  }, [selectedNode])

  function refresh() {
    qc.invalidateQueries({ queryKey: ['doc-nodes', projectCode, shareToken] })
  }

  function handleTreeSelect(n: DocumentNode) {
    setSelectedNode(n)
  }

  async function handleCreateNode(body: Partial<DocumentNode>) {
    const created = await createNode(body)
    setModalMode(null)
    setModalTarget(null)
    refresh()
    setSelectedNode(created)
  }

  async function handleEditNode(body: Partial<DocumentNode>) {
    const target = modalTarget ?? selectedNode
    if (!target) return
    const updated = await updateNode(target.id, body)
    if (selectedNode?.id === target.id) setSelectedNode(updated)
    setModalMode(null)
    setModalTarget(null)
    refresh()
  }

  async function handleDelete() {
    if (!selectedNode) return
    if (!confirm(`确定删除「${selectedNode.name}」及其所有子节点？`)) return
    await deleteNode(selectedNode.id)
    setSelectedNode(null)
    refresh()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedNode) return
    await uploadFile(selectedNode.id, file)
    e.target.value = ''
    refresh()
    const fresh = shareMode
      ? await fetchSharedNodes(projectCode, shareToken)
      : await fetchNodes()
    const found = findNode(fresh, selectedNode.id)
    if (found) setSelectedNode(found)
  }

  // 右键打开菜单：在 ProjectDocsPage 中只负责收集菜单 actions，具体实现写在组件末尾。
  function openContextMenu(node: DocumentNode, x: number, y: number) {
    setContextMenu({ node, x, y })
  }

  // 复制节点：后端递归克隆整棵子树。复制完成后刷新树，并自动选中新节点。
  async function handleCopyNode(node: DocumentNode) {
    try {
      const cloned = await copyNode(node.id)
      refresh()
      // 等查询失效后再尝试选中新节点（必要时 await invalidate 之后再 fetch）
      const fresh = shareMode
        ? await fetchSharedNodes(projectCode, shareToken)
        : await fetchNodes()
      const found = findNode(fresh, cloned.id)
      if (found) setSelectedNode(found)
    } catch (err: any) {
      alert(`复制失败：${err?.response?.data?.error || err?.message || '未知错误'}`)
    }
  }

  // 拖拽落点：根据 zone 计算新 parent_id 和 sort_order，并把受影响兄弟节点批量 renumber。
  //   - 'into'：src 变为 target 的子节点，追加到末尾
  //   - 'before' / 'after'：src 与 target 同级，插入到 target 之前/之后
  // 因为当前数据 sort_order 几乎全是 0（默认值），所以移动后必须对受影响 parent 下所有子节点
  // 重新编号 0/10/20/...，否则 ORDER BY sort_order, id 的视觉顺序不变。
  async function handleMove(srcId: number, targetId: number, zone: DropZone) {
    if (!nodesRaw) return
    if (srcId === targetId) return
    const src = findNode(nodesRaw, srcId)
    const target = findNode(nodesRaw, targetId)
    if (!src || !target) return
    // 防环：src 不能拖到自身或自身的后代之下（canDropHere 已前端过滤，这里服务端兜底）
    if (buildDescendantIdSet(nodesRaw, srcId).has(targetId)) return

    let newParentId: number | null
    let insertIndex: number
    if (zone === 'into') {
      newParentId = target.id
      const targetChildren = target.children || []
      insertIndex = targetChildren.length
    } else {
      newParentId = target.parent_id
      const siblings = getSiblingsInOrder(nodesRaw, target.parent_id)
      const targetIdx = siblings.findIndex((s) => s.id === targetId)
      insertIndex = zone === 'before' ? targetIdx : targetIdx + 1
      // 如果 src 原本就在 newParentId 下，需要从 siblings 移除再插入，否则 index 会错位。
      const srcInSameParent = src.parent_id === newParentId
      if (srcInSameParent) {
        const siblingsNoSrc = siblings.filter((s) => s.id !== srcId)
        const newTargetIdx = siblingsNoSrc.findIndex((s) => s.id === targetId)
        insertIndex = zone === 'before' ? newTargetIdx : newTargetIdx + 1
      }
    }

    try {
      // 1) 更新 src 的 parent_id 和 sort_order。
      const newSortOrder = insertIndex * 10
      await updateNode(srcId, { parent_id: newParentId, sort_order: newSortOrder })

      // 2) 把 newParentId 下的所有子节点重排序：src 已在正确位置，其它兄弟按其位置赋值 0/10/20/...
      //    注意：旧数据 sort_order 多为 0；如果只更新 src 而不修兄弟，UI 顺序依然按 id 排。
      const refreshed = shareMode
        ? await fetchSharedNodes(projectCode, shareToken)
        : await fetchNodes()
      const siblingsAfter = getSiblingsInOrder(refreshed, newParentId)
      for (let i = 0; i < siblingsAfter.length; i++) {
        const expected = i * 10
        if (siblingsAfter[i].sort_order !== expected) {
          await updateNode(siblingsAfter[i].id, { sort_order: expected })
        }
      }
      refresh()
    } catch (err: any) {
      alert(`移动失败：${err?.response?.data?.error || err?.message || '未知错误'}`)
    }
  }

  // 拖放合法性：目标节点不能是 src 自身或其后代。
  // srcId 在 dragover 时未知（仅 drop 时可从 dataTransfer 读取），这里给一个宽松的实现：
  // dragover 一律允许（视觉提示由 DocTree 自行计算落点档位），真正的父子/后代互斥校验
  // 在 handleMove 中执行；后端 UpdateDocumentNode 也会二次拦截（返回 400）。
  const isDraggable = !shareMode && isAdmin
  function canDropHere(_srcId: number | null, _target: DocumentNode): boolean {
    return isDraggable
  }

  // 右键菜单 actions：根据当前用户权限和目标节点类型动态生成。
  function buildContextActions(node: DocumentNode): DocContextMenuAction[] {
    const canEdit = node.id ? (perms.is_admin || ((perms.perms?.[String(node.id)] || []).includes('edit'))) : false
    return [
      {
        id: 'rename',
        label: '重命名',
        icon: MenuIcons.Pencil,
        disabled: !canEdit,
        onClick: () => {
          setModalTarget(node)
          setModalMode('edit')
        },
      },
      {
        id: 'new-child',
        label: '新建子节点',
        icon: MenuIcons.Plus,
        disabled: !canEdit,
        onClick: () => {
          setModalTarget(node)
          setModalMode('create')
        },
      },
      {
        id: 'copy',
        label: '复制',
        icon: MenuIcons.Copy,
        disabled: !canEdit,
        onClick: () => handleCopyNode(node),
      },
    ]
  }

  // 分享模式下内容通过 DocViewer 内部按需读取，不走全局 loading 态
  if (projectLoading) {
    return (
      <div className="docs-layout">
        <div className="empty-hint">加载项目中...</div>
      </div>
    )
  }

  if (projectError || !project) {
    return (
      <div className="docs-layout">
        <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span>未找到项目「{projectCode}」</span>
          {!shareMode && (
            <button className="btn" onClick={() => navigate('/')}>返回项目首页</button>
          )}
        </div>
      </div>
    )
  }

  if (!project.root_node_id) {
    return (
      <div className="docs-layout">
        <div className="empty-hint">该项目未关联文档节点</div>
      </div>
    )
  }

  return (
    <div className="docs-layout">
      <div className="docs-tree-pane">
        <div className="docs-tree-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {project.icon && <span style={{ fontSize: 18 }}>{project.icon}</span>}
            <span>{project.name}</span>
            {shareMode && (
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>只读分享</span>
            )}
          </div>
          {!shareMode && (
            <button className="btn icon" title="返回项目首页" onClick={() => navigate('/')}>
              <Home size={16} />
            </button>
          )}
        </div>
        <div className="docs-tree-body">
          <DocTree
            nodes={projectNodes}
            selectedId={selectedNode?.id ?? null}
            onSelect={handleTreeSelect}
            onContextMenu={openContextMenu}
            draggable={isDraggable}
            canDropHere={canDropHere}
            onMove={handleMove}
          />
        </div>
      </div>

      <div className="docs-main">
        <div className="docs-main-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{selectedNode?.name || '请选择文档'}</span>
            {selectedNode?.code && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                /d/{selectedNode.code}
              </span>
            )}
          </div>
          <div className="toolbar-spacer" />
          {/* 分享模式下隐藏所有写操作按钮 */}
          {!shareMode && selectedNode && isAdmin && selectedNode.node_type !== 'form_app' && (
            <button className="btn icon" title="在此新建子节点" onClick={() => { setModalTarget(selectedNode); setModalMode('create') }}>
              <Plus size={16} />
            </button>
          )}
          {!shareMode && selectedNode && isAdmin && (
            <button className="btn icon" title="编辑节点" onClick={() => { setModalTarget(selectedNode); setModalMode('edit') }}>
              <Pencil size={16} />
            </button>
          )}
          {!shareMode && selectedNode && selectedNode.node_type === 'doc' && canEditSelected && (
            <button className="btn icon" title="上传/替换文件" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
            </button>
          )}
          {selectedNode && selectedNode.node_type === 'doc' && (
            <a
              className="btn icon"
              title="下载"
              href={
                shareMode && selectedNode
                  ? downloadSharedUrl(selectedNode.id, projectCode, shareToken)
                  : downloadUrl(selectedNode.id)
              }
              download
            >
              <Download size={16} />
            </a>
          )}
          {!shareMode && selectedNode && selectedNode.node_type === 'doc' && (
            <button className="btn icon" title="版本历史" onClick={() => setShowVersions(true)}>
              <History size={16} />
            </button>
          )}
          {!shareMode && selectedNode && canDeleteSelected && (
            <button className="btn icon danger" title="删除" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          )}
          {/* AI 助手在分享模式下隐藏 */}
          {!shareMode && (
            <button className={'btn icon' + (aiOpen ? ' primary' : '')} title="AI 助手" onClick={toggleAI}>
              <Sparkles size={16} />
            </button>
          )}
        </div>

        <div className="docs-main-body" style={{ display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {selectedNode ? (
              <DocViewer
                node={selectedNode}
                canEdit={canEditSelected}
                onSelectionChange={setSelection}
                shareMode={shareMode}
                shareToken={shareToken}
                projectCode={projectCode}
              />
            ) : (
              <div className="empty-hint">从左侧选择一个文档开始查看</div>
            )}
          </div>
          {aiOpen && !shareMode && (
            <AIPanel
              docTitle={selectedNode?.name}
              selection={selection}
              onClose={toggleAI}
            />
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />

      {modalMode && (
        <NodeModal
          parent={modalMode === 'create' ? (modalTarget ?? selectedNode) : null}
          node={modalMode === 'edit' ? (modalTarget ?? selectedNode) : null}
          onSubmit={modalMode === 'edit' ? handleEditNode : handleCreateNode}
          onClose={() => { setModalMode(null); setModalTarget(null) }}
        />
      )}

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <DocContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextActions(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showVersions && selectedNode && (
        <VersionModal
          nodeId={selectedNode.id}
          canEdit={canEditSelected}
          onClose={() => setShowVersions(false)}
          onReverted={refresh}
        />
      )}
    </div>
  )
}

function findNode(nodes: DocumentNode[], id: number): DocumentNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const f = findNode(n.children, id)
      if (f) return f
    }
  }
  return null
}

// flattenTree: 深度优先遍历树，返回所有节点列表（不含 children 嵌套结构，仅展平）。
function flattenTree(nodes: DocumentNode[]): DocumentNode[] {
  const out: DocumentNode[] = []
  function walk(list: DocumentNode[]) {
    for (const n of list) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

// getSiblingsInOrder: 获取 parent_id 下的所有直接子节点，按 (sort_order ASC, id ASC) 排序。
// 用于拖拽排序时确定插入位置。
function getSiblingsInOrder(all: DocumentNode[], parentId: number | null): DocumentNode[] {
  const flat = flattenTree(all)
  return flat
    .filter((n) => n.parent_id === parentId)
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
}

