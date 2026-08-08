import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  setRoleNodes,
  setRoleUsers,
  fetchNodes,
  fetchPermCatalog,
  fetchUsers,
  flattenNodes,
  type SimpleUser,
} from '../api/documents'
import type { DocumentRole, DocumentNode } from '../api/types'

export default function RolesPage() {
  const [roles, setRoles] = useState<DocumentRole[]>([])
  const [nodes, setNodes] = useState<DocumentNode[]>([])
  const [perms, setPerms] = useState<string[]>([])
  const [users, setUsers] = useState<SimpleUser[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  // 编辑草稿：节点权限 map(nodeId -> perms[]) 与用户集合。
  const [nodePerms, setNodePerms] = useState<Record<number, string[]>>({})
  const [userIds, setUserIds] = useState<number[]>([])
  const [savedTip, setSavedTip] = useState('')

  async function loadAll() {
    const [r, n, p, u] = await Promise.all([fetchRoles(), fetchNodes(), fetchPermCatalog(), fetchUsers()])
    setRoles(r)
    setNodes(n)
    setPerms(p)
    setUsers(u)
    if (r.length && activeId === null) setActiveId(r[0].id)
  }
  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = useMemo(() => roles.find((r) => r.id === activeId) || null, [roles, activeId])
  const flatNodes = useMemo(() => flattenNodes(nodes), [nodes])

  // 切换角色时装载其草稿。
  useEffect(() => {
    if (!active) {
      setNodePerms({})
      setUserIds([])
      return
    }
    const np: Record<number, string[]> = {}
    for (const n of active.nodes) np[n.node_id] = n.perms
    setNodePerms(np)
    setUserIds(active.user_ids || [])
  }, [active])

  async function handleCreate() {
    if (!newName.trim()) return
    const role = await createRole({ name: newName.trim() })
    setNewName('')
    setCreating(false)
    await loadAll()
    setActiveId(role.id)
  }

  async function handleDelete(role: DocumentRole) {
    if (!confirm(`删除角色「${role.name}」？`)) return
    await deleteRole(role.id)
    if (activeId === role.id) setActiveId(null)
    await loadAll()
  }

  function togglePerm(nodeId: number, perm: string) {
    setNodePerms((prev) => {
      const cur = new Set(prev[nodeId] || [])
      if (cur.has(perm)) cur.delete(perm)
      else cur.add(perm)
      const next = { ...prev }
      if (cur.size === 0) delete next[nodeId]
      else next[nodeId] = Array.from(cur)
      return next
    })
  }

  function toggleUser(uid: number) {
    setUserIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]))
  }

  async function handleSave() {
    if (!active) return
    const nodesPayload = Object.entries(nodePerms).map(([nid, ps]) => ({ node_id: Number(nid), perms: ps }))
    await setRoleNodes(active.id, nodesPayload)
    await setRoleUsers(active.id, userIds)
    setSavedTip('已保存')
    setTimeout(() => setSavedTip(''), 2000)
    await loadAll()
  }

  return (
    <div className="docs-layout">
      <div className="docs-tree-pane">
        <div className="docs-tree-header">
          <span>文档角色</span>
          <button className="btn icon" title="新建角色" onClick={() => setCreating(true)}>
            <Plus size={16} />
          </button>
        </div>
        <div className="docs-tree-body">
          {creating && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={newName}
                placeholder="角色名"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }}
              />
              <button className="btn primary" onClick={handleCreate}>加</button>
            </div>
          )}
          {roles.map((r) => (
            <div
              key={r.id}
              className={'tree-node' + (activeId === r.id ? ' selected' : '')}
              onClick={() => setActiveId(r.id)}
            >
              <span className="label">{r.name}</span>
              <Trash2
                size={14}
                color="var(--danger)"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(r)
                }}
              />
            </div>
          ))}
          {roles.length === 0 && !creating && (
            <div className="empty-hint" style={{ marginTop: 30, fontSize: 13 }}>暂无角色</div>
          )}
        </div>
      </div>

      <div className="docs-main">
        <div className="docs-main-header">
          <Link className="btn icon" to="/" title="返回文档库">
            <ArrowLeft size={16} />
          </Link>
          <span style={{ fontWeight: 600 }}>{active ? `配置：${active.name}` : '请选择角色'}</span>
          <div className="toolbar-spacer" />
          {savedTip && <span style={{ color: 'var(--primary)', fontSize: 13 }}>{savedTip}</span>}
          {active && (
            <button className="btn primary" onClick={handleSave}>保存授权</button>
          )}
        </div>
        <div className="docs-main-body" style={{ padding: 20, overflow: 'auto' }}>
          {!active ? (
            <div className="empty-hint">选择左侧角色以配置节点权限与成员</div>
          ) : (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 480px', minWidth: 360 }}>
                <h4 style={{ marginTop: 0 }}>节点权限</h4>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>
                  勾选某节点的权限键；父节点权限会被子节点继承。
                </p>
                <table className="list-table">
                  <thead>
                    <tr>
                      <th>节点</th>
                      {perms.map((p) => (
                        <th key={p} style={{ textAlign: 'center' }}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flatNodes.map((n) => (
                      <tr key={n.id}>
                        <td style={{ paddingLeft: 12 + n.depth * 16 }}>{n.name}</td>
                        {perms.map((p) => (
                          <td key={p} style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={(nodePerms[n.id] || []).includes(p)}
                              onChange={() => togglePerm(n.id, p)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <h4 style={{ marginTop: 0 }}>成员</h4>
                <div className="perm-grid">
                  {users.map((u) => (
                    <span
                      key={u.id}
                      className={'perm-chip' + (userIds.includes(u.id) ? ' on' : '')}
                      onClick={() => toggleUser(u.id)}
                    >
                      {u.username}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
