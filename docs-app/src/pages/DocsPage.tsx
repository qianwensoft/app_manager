import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Plus,
  Upload,
  Download,
  History,
  Trash2,
  Sparkles,
  Pencil,
  Shield,
  FolderPlus,
} from 'lucide-react'
import DocTree from '../components/DocTree'
import DocViewer from '../components/DocViewer'
import NodeModal from '../components/NodeModal'
import VersionModal from '../components/VersionModal'
import AIPanel from '../components/AIPanel'
import { useDocsStore } from '../store'
import {
  fetchNodes,
  fetchPortalPermissions,
  createNode,
  updateNode,
  deleteNode,
  uploadFile,
  downloadUrl,
  fetchNodeByCode,
} from '../api/documents'
import type { DocumentNode } from '../api/types'

// 模块级稳定空数组：当 useQuery.data 仍为 undefined 时复用同一引用，
  // 避免依赖该值的 useEffect 在加载过程中被新数组触发而进入无限循环。
  const EMPTY_NODES: DocumentNode[] = []

export default function DocsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const params = useParams<{ code?: string }>()
  // 用 useStore 的 selector 形式订阅各个 slice，避免整个 store 更新（如 toggleAI）触发 DocsPage 重渲。
  const selectedNode = useDocsStore((s) => s.selectedNode)
  const setSelectedNode = useDocsStore((s) => s.setSelectedNode)
  const setPerms = useDocsStore((s) => s.setPerms)
  const aiOpen = useDocsStore((s) => s.aiOpen)
  const toggleAI = useDocsStore((s) => s.toggleAI)
  const can = useDocsStore((s) => s.can)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [selection, setSelection] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 用模块级稳定空数组作为默认值，避免 useQuery 在 data 仍为 undefined 时每次渲染都返回新引用，
  // 否则会引发 useEffect 无限循环（详见 commit：「修复 React error #185」）。
  const { data: nodesRaw } = useQuery({ queryKey: ['doc-nodes'], queryFn: fetchNodes })
  const { data: permsRaw } = useQuery({ queryKey: ['doc-perms'], queryFn: fetchPortalPermissions })
  const nodes = useMemo(() => nodesRaw ?? EMPTY_NODES, [nodesRaw])
  const perms = permsRaw ?? null

  useEffect(() => {
    if (perms) setPerms(perms)
  }, [perms, setPerms])

  const isAdmin = perms?.is_admin ?? false
  // 编辑权限：admin 恒真；否则看该节点 edit 权限。
  const canEditSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'edit')) : false
  const canDeleteSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'delete')) : false
  const canDownloadSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'download')) : false

  // 同步 URL → 选择：当 params.code 变化时，按 code 解析节点并设为当前选中。
  // 注意：先在已加载的树里查；树未准备好时通过 API 反查（深链接 / 刷新场景）。
  // 关键：用 ref 跟踪当前 selectedNode 的 id，避免异步回调在闭包里捕获过期的 selectedNode
  // 导致 setState 死循环。
  const selectedIdRef = useRef<number | null>(selectedNode?.id ?? null)

  useEffect(() => {
    const urlCode = params.code
    if (!urlCode) {
      // 仅在当前确实有选中时才清空，避免无意义 store 更新触发的循环。
      if (selectedIdRef.current !== null) {
        selectedIdRef.current = null
        setSelectedNode(null)
      }
      return
    }
    // 已在树中 → 直接选中。
    const found = findNodeByCode(nodes, urlCode)
    if (found) {
      if (selectedIdRef.current !== found.id) {
        selectedIdRef.current = found.id
        setSelectedNode(found)
      }
      return
    }
    // 树里没找到且 trees 还没加载完 → 等下一轮；否则尝试 API 反查（深链接）。
    if (nodes.length === 0) return
    let cancelled = false
    ;(async () => {
      const node = await fetchNodeByCode(urlCode)
      if (cancelled) return
      if (!node) return
      // 用 ref 比较，避免闭包陈旧；id 相等说明已经是同一节点（无需更新）。
      if (selectedIdRef.current === node.id) return
      // 还需确认 URL 仍指向同一 code（防止用户已经导航到别的文档）。
      // params 是闭包捕获，但只要我们仅在 params.code 与本次 urlCode 相同时 setState，
      // 就保证不会把别处的选中节点覆盖回来。
      selectedIdRef.current = node.id
      setSelectedNode(node)
    })()
    return () => {
      cancelled = true
    }
  }, [params.code, nodes])

  // 监听 zustand 的 selectedNode 变化：当外部（refresh/upload 后）拿到新对象时同步 ref，
  // 避免后续 URL 效应因 ref 陈旧而重复 setState。
  useEffect(() => {
    selectedIdRef.current = selectedNode?.id ?? null
  }, [selectedNode])

  function refresh() {
    qc.invalidateQueries({ queryKey: ['doc-nodes'] })
  }

  // 树点击 → 同步 selectedNode 与 URL（用 code 深链接；code 不存在时退回根）。
  function handleTreeSelect(n: DocumentNode) {
    setSelectedNode(n)
    if (n.code) {
      navigate(n.code ? `/d/${encodeURIComponent(n.code)}` : '/', { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  async function handleCreateNode(body: Partial<DocumentNode>) {
    const created = await createNode(body)
    setModalMode(null)
    refresh()
    // 自动选中新节点并跳转 code 直链。
    setSelectedNode(created)
    if (created?.code) navigate(`/d/${encodeURIComponent(created.code)}`)
  }
  async function handleEditNode(body: Partial<DocumentNode>) {
    if (!selectedNode) return
    const updated = await updateNode(selectedNode.id, body)
    setSelectedNode(updated)
    setModalMode(null)
    refresh()
    // 如果用户改了 code（body.code 已被后端规整回写），同步跳转新链。
    if (body.code != null && updated?.code) {
      navigate(`/d/${encodeURIComponent(updated.code)}`, { replace: true })
    }
  }
  async function handleDelete() {
    if (!selectedNode) return
    if (!confirm(`确定删除「${selectedNode.name}」及其所有子节点？`)) return
    await deleteNode(selectedNode.id)
    setSelectedNode(null)
    refresh()
    // 删除后退到根。
    navigate('/', { replace: true })
  }
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedNode) return
    await uploadFile(selectedNode.id, file)
    e.target.value = ''
    refresh()
    // 重新拉取后同步当前选中节点信息。
    const fresh = await fetchNodes()
    const found = findNode(fresh, selectedNode.id)
    if (found) setSelectedNode(found)
  }

  return (
    <div className="docs-layout">
      <div className="docs-tree-pane">
        <div className="docs-tree-header">
          <span>文档库</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {isAdmin && (
              <>
                <button className="btn icon" title="新建根节点" onClick={() => { setSelectedNode(null); setModalMode('create'); navigate('/', { replace: true }) }}>
                  <FolderPlus size={16} />
                </button>
                <Link className="btn icon" title="角色权限" to="/roles">
                  <Shield size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="docs-tree-body">
          <DocTree nodes={nodes} selectedId={selectedNode?.id ?? null} onSelect={handleTreeSelect} />
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
          {selectedNode && isAdmin && selectedNode.node_type !== 'form_app' && (
            <button className="btn icon" title="在此新建子节点" onClick={() => setModalMode('create')}>
              <Plus size={16} />
            </button>
          )}
          {selectedNode && isAdmin && (
            <button className="btn icon" title="编辑节点" onClick={() => setModalMode('edit')}>
              <Pencil size={16} />
            </button>
          )}
          {selectedNode && selectedNode.node_type !== 'form_app' && canEditSelected && (
            <button className="btn icon" title="上传/替换文件" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
            </button>
          )}
          {selectedNode && selectedNode.node_type !== 'form_app' && selectedNode.storage_path && canDownloadSelected && (
            <a className="btn icon" title="下载" href={downloadUrl(selectedNode.id)}>
              <Download size={16} />
            </a>
          )}
          {selectedNode && selectedNode.node_type !== 'form_app' && (
            <button className="btn icon" title="版本历史" onClick={() => setShowVersions(true)}>
              <History size={16} />
            </button>
          )}
          {selectedNode && canDeleteSelected && (
            <button className="btn icon danger" title="删除" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          )}
          <button className={'btn icon' + (aiOpen ? ' primary' : '')} title="AI 助手" onClick={toggleAI}>
            <Sparkles size={16} />
          </button>
        </div>

        <div className="docs-main-body" style={{ display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {selectedNode ? (
              <DocViewer node={selectedNode} canEdit={canEditSelected} onSelectionChange={setSelection} />
            ) : (
              <div className="empty-hint">从左侧选择一个文档开始查看或编辑</div>
            )}
          </div>
          {aiOpen && (
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
          parent={modalMode === 'create' ? selectedNode : null}
          node={modalMode === 'edit' ? selectedNode : null}
          onSubmit={modalMode === 'edit' ? handleEditNode : handleCreateNode}
          onClose={() => setModalMode(null)}
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

// findNode 在树中按 id 查找节点。
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

// findNodeByCode 在树中按 code 查找节点（深链接解析的快速路径）。
function findNodeByCode(nodes: DocumentNode[], code: string): DocumentNode | null {
  for (const n of nodes) {
    if (n.code === code) return n
    if (n.children) {
      const f = findNodeByCode(n.children, code)
      if (f) return f
    }
  }
  return null
}
