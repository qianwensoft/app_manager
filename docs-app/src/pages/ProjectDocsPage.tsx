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
  fetchProjectByCode,
} from '../api/documents'
import type { DocumentNode, DocumentProject } from '../api/types'

const EMPTY_NODES: DocumentNode[] = []

export default function ProjectDocsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const params = useParams<{ code: string }>()
  const projectCode = params.code!

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

  // 获取项目信息
  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['doc-project', projectCode],
    queryFn: () => fetchProjectByCode(projectCode),
  })

  // 获取全部节点树
  const { data: nodesRaw } = useQuery({ queryKey: ['doc-nodes'], queryFn: fetchNodes })
  const { data: permsRaw } = useQuery({ queryKey: ['doc-perms'], queryFn: fetchPortalPermissions })
  const nodes = useMemo(() => nodesRaw ?? EMPTY_NODES, [nodesRaw])
  const perms = permsRaw ?? null

  useEffect(() => {
    if (perms) setPerms(perms)
  }, [perms, setPerms])

  const isAdmin = perms?.is_admin ?? false

  // 过滤：只显示该项目关联的 root_node 及其子树
  const projectNodes = useMemo(() => {
    if (!project?.root_node_id || nodes.length === 0) return []
    const rootNode = findNode(nodes, project.root_node_id)
    return rootNode ? [rootNode] : []
  }, [project, nodes])

  const canEditSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'edit')) : false
  const canDeleteSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'delete')) : false
  const canDownloadSelected = selectedNode ? (isAdmin || can(selectedNode.id, 'download')) : false

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
    qc.invalidateQueries({ queryKey: ['doc-nodes'] })
  }

  function handleTreeSelect(n: DocumentNode) {
    setSelectedNode(n)
  }

  async function handleCreateNode(body: Partial<DocumentNode>) {
    const created = await createNode(body)
    setModalMode(null)
    refresh()
    setSelectedNode(created)
  }

  async function handleEditNode(body: Partial<DocumentNode>) {
    if (!selectedNode) return
    const updated = await updateNode(selectedNode.id, body)
    setSelectedNode(updated)
    setModalMode(null)
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
    const fresh = await fetchNodes()
    const found = findNode(fresh, selectedNode.id)
    if (found) setSelectedNode(found)
  }

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
          <button className="btn" onClick={() => navigate('/')}>返回项目首页</button>
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
          </div>
          <button className="btn icon" title="返回项目首页" onClick={() => navigate('/')}>
            <Home size={16} />
          </button>
        </div>
        <div className="docs-tree-body">
          <DocTree nodes={projectNodes} selectedId={selectedNode?.id ?? null} onSelect={handleTreeSelect} />
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
          {selectedNode && selectedNode.node_type === 'doc' && canEditSelected && (
            <button className="btn icon" title="上传/替换文件" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
            </button>
          )}
          {selectedNode && selectedNode.node_type === 'doc' && selectedNode.storage_path && canDownloadSelected && (
            <a className="btn icon" title="下载" href={downloadUrl(selectedNode.id)}>
              <Download size={16} />
            </a>
          )}
          {selectedNode && selectedNode.node_type === 'doc' && (
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

