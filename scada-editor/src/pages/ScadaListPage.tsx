import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScadaGroups, useScadaInfos, useCreateInfo, useDeleteInfo, useCopyInfo, usePublish, useUnpublish, useUpdateInfo } from '@/hooks/useScada'
import { useStompScadaEvents } from '@/hooks/useStompScadaEvents'
import { scadaApi } from '@/api/scada'
import type { ScadaGroup } from '@/types'

/* ── Shared button styles ── */
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 'var(--radius-md)',
  background: 'var(--accent)', color: '#fff',
  border: 'none', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background var(--duration-fast)',
}
const btnOutline: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background var(--duration-fast)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
  fontSize: 12, outline: 'none',
}

/* ── SVG icons ─────────────────────────────────────── */
const Svg = ({ d, size = 14 }: { d: string | string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

const Icons = {
  folder:   ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z'],
  list:     ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  plus:     ['M12 5v14M5 12h14'],
  edit:     ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z'],
  eye:      ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  trash:    ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6M14 11v6', 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
  monitor:  ['M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z', 'M8 21h8M12 17v4'],
  search:   ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35'],
  chevron:  ['M9 18l6-6-6-6'],
  scada:    ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  link:     ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  copy:     ['M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  check:    ['M20 6L9 17l-5-5'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload:   ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
}

/** 构建已发布组态的免登录正式访问地址 */
function buildShareUrl(token: string): string {
  return `${window.location.origin}/scada-editor/share/${token}`
}

/* ── Group tree ─────────────────────────────────────── */
function buildTree(groups: ScadaGroup[]): ScadaGroup[] {
  const map = new Map<number, ScadaGroup>()
  groups.forEach((g) => map.set(g.id, { ...g, children: [] }))
  const roots: ScadaGroup[] = []
  map.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) map.get(g.parent_id)!.children!.push(g)
    else roots.push(g)
  })
  return roots
}

/** 将分组树展平为带层级缩进的下拉选项 */
function flattenGroups(nodes: ScadaGroup[], depth = 0, acc: { id: number; label: string }[] = []): { id: number; label: string }[] {
  nodes.forEach((g) => {
    acc.push({ id: g.id, label: `${'\u00A0\u00A0'.repeat(depth)}${g.name}` })
    if (g.children?.length) flattenGroups(g.children, depth + 1, acc)
  })
  return acc
}

/* ── Empty state ────────────────────────────────────── */
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 16, color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent)',
      }}>
        <Svg d={Icons.monitor} size={28} />
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.7 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>暂无组态</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>点击「新建」创建第一个可视化大屏</div>
      </div>
      <button style={btnPrimary} onClick={onNew}>
        <Svg d={Icons.plus} size={12} />
        新建组态
      </button>
    </div>
  )
}

/* ── SCADA card ─────────────────────────────────────── */
interface CardInfo {
  id: number
  scada_name: string
  scada_code: string
  publish_status?: number
  preview_image?: string
  share_token?: string
}

function ScadaCard({
  info,
  onEdit,
  onEditMeta,
  onPreview,
  onDelete,
  onCopy,
  onExport,
  onTogglePublish,
  publishBusy,
  copyBusy,
}: {
  info: CardInfo
  onEdit: () => void
  onEditMeta: () => void
  onPreview: () => void
  onDelete: () => void
  onCopy: () => void
  onExport: () => void
  onTogglePublish: () => void
  publishBusy: boolean
  copyBusy: boolean
}) {
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)
  const published = info.publish_status === 1

  const shareUrl = info.publish_status === 1 && info.share_token
    ? buildShareUrl(info.share_token)
    : ''

  const copyShareUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // 剪贴板不可用时退回到手动选择
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${hover ? 'var(--border-accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'border-color var(--duration-base), box-shadow var(--duration-base)',
        boxShadow: hover ? 'var(--shadow-accent)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'default',
      }}
    >
      {/* Preview thumbnail */}
      <div
        onClick={onEdit}
        style={{
          height: 128,
          background: 'var(--bg-base)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {info.preview_image ? (
          <img
            src={info.preview_image}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            color: 'var(--text-muted)',
          }}>
            <Svg d={Icons.monitor} size={32} />
            <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>无预览图</span>
          </div>
        )}

        {/* Hover overlay */}
        {hover && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(74,158,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'opacity var(--duration-fast)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            }}>
              <Svg d={Icons.edit} size={12} />
              打开编辑器
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          }}>
            {info.scada_name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); if (!publishBusy) onTogglePublish() }}
            disabled={publishBusy}
            title={info.publish_status === 1 ? '点击取消发布' : '点击发布'}
            style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              background: info.publish_status === 1 ? 'rgba(74,222,128,0.15)' : 'var(--bg-elevated)',
              color: info.publish_status === 1 ? '#4ade80' : 'var(--text-muted)',
              border: `1px solid ${info.publish_status === 1 ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
              cursor: publishBusy ? 'default' : 'pointer',
              opacity: publishBusy ? 0.6 : 1,
            }}
          >
            {info.publish_status === 1 ? '已发布' : '草稿'}
          </button>
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-muted)', marginBottom: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {info.scada_code}
        </div>

        {/* 正式地址（已发布免登录访问链接） */}
        {shareUrl && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 10, padding: '6px 8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
            title={shareUrl}
          >
            <span style={{ color: '#4ade80', display: 'flex', flexShrink: 0 }}>
              <Svg d={Icons.link} size={12} />
            </span>
            <span style={{
              flex: 1, minWidth: 0,
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {shareUrl}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); copyShareUrl() }}
              title="复制正式地址（免登录）"
              className="focus-accent"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: copied ? '#4ade80' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color var(--duration-fast), border-color var(--duration-fast)',
              }}
            >
              <Svg d={copied ? Icons.check : Icons.copy} size={12} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={published ? onEditMeta : onEdit}
            className="icon-btn focus-accent"
            title={published ? '已发布：仅可修改名称与分组' : '打开编辑器'}
            style={{
              flex: 1, height: 30, borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-muted)', border: '1px solid var(--border-accent)',
              color: 'var(--accent)', fontSize: 12, gap: 5, display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Svg d={Icons.edit} size={12} /> 编辑
          </button>
          <button
            onClick={onPreview}
            className="icon-btn focus-accent"
            style={{
              flex: 1, height: 30, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12, gap: 5, display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Svg d={Icons.eye} size={12} /> 预览
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (!copyBusy) onCopy() }}
            disabled={copyBusy}
            className="icon-btn focus-accent"
            style={{
              width: 30, height: 30, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: copyBusy ? 'default' : 'pointer', opacity: copyBusy ? 0.5 : 1,
            }}
            title="复制组态"
          >
            <Svg d={Icons.copy} size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onExport() }}
            className="icon-btn focus-accent"
            style={{
              width: 30, height: 30, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            title="导出组态"
          >
            <Svg d={Icons.download} size={12} />
          </button>
          {!published && (
            <button
              onClick={onDelete}
              className="icon-btn focus-accent"
              style={{
                width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-muted)', border: '1px solid rgba(239,68,68,0.2)',
                color: 'var(--danger)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
              title="删除"
            >
              <Svg d={Icons.trash} size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sidebar group item ──────────────────────────────── */
function GroupItem({
  label,
  icon,
  active,
  depth = 0,
  onClick,
}: {
  label: string
  icon: string[]
  active: boolean
  depth?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 7,
        paddingLeft: 12 + depth * 14, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
        background: active ? 'var(--accent-muted)' : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 13, cursor: 'pointer', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        transition: 'all var(--duration-fast)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      <Svg d={icon} size={13} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

/* ── Main page ──────────────────────────────────────── */
export default function ScadaListPage() {
  const navigate = useNavigate()
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>()
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  // 编辑元信息（名称 / 分组）弹窗：已发布组态仅允许修改这两项
  const [editMeta, setEditMeta] = useState<{ id: number; name: string; groupId?: number } | null>(null)

  const { data: groups = [] } = useScadaGroups()
  const { data: infos = [], isLoading, refetch } = useScadaInfos(selectedGroupId)
  const createInfo = useCreateInfo()
  const updateInfo = useUpdateInfo()
  const deleteInfo = useDeleteInfo()
  const copyInfo = useCopyInfo()
  const publish = usePublish()
  const unpublish = useUnpublish()
  const publishBusy = publish.isPending || unpublish.isPending

  // 实时事件订阅
  useStompScadaEvents({
    onEvent: (event) => {
      // 显示浏览器通知
      const eventName =
        event.event === 'scada.created' ? '新建组态' :
        event.event === 'scada.deleted' ? '组态已删除' :
        event.event === 'scada.published' ? '组态已发布' :
        event.event === 'scada.unpublished' ? '组态已取消发布' : '组态更新'

      if (Notification.permission === 'granted') {
        new Notification(eventName, {
          body: `${event.scada_name} (${event.scada_code})`,
          icon: event.preview_image || undefined,
        })
      }

      // 刷新列表
      refetch()
    },
    enabled: true,
  })

  const tree = buildTree(groups)

  const filtered = infos.filter(
    (i) =>
      !search ||
      i.scada_name.toLowerCase().includes(search.toLowerCase()) ||
      i.scada_code.toLowerCase().includes(search.toLowerCase()),
  )

  const handleCreate = () => {
    if (!newName.trim() || !newCode.trim()) return
    createInfo.mutate(
      { scada_name: newName, scada_code: newCode, group_id: selectedGroupId },
      {
        onSuccess: (data) => {
          setShowCreate(false); setNewName(''); setNewCode('')
          navigate(`/editor/${data.id}`)
        },
      },
    )
  }

  const handleUpdateMeta = async () => {
    if (!editMeta || !editMeta.name.trim()) return
    // 后端 UpdateScadaInfo 用 map Updates 全量覆盖，未带的字段会被清零
    //（含 publish_status / share_token / scada_code 等）。先拉完整记录再合并，
    // 仅改动名称与分组，避免误清空发布态与分享 token。
    const full = await scadaApi.getInfo(editMeta.id).then((r) => r.data)
    updateInfo.mutate(
      {
        id: editMeta.id,
        body: {
          ...full,
          canvas_data: undefined, // 不回传画布，避免大 payload 覆盖
          scada_name: editMeta.name.trim(),
          group_id: editMeta.groupId,
        },
      },
      { onSuccess: () => setEditMeta(null) },
    )
  }

  const handleExport = async (id: number, name: string) => {
    try {
      const blob = await scadaApi.exportScada(id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
      alert('导出失败，请重试')
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      await scadaApi.importScada(file)
      alert('导入成功')
      refetch()
    } catch (err: any) {
      console.error('导入失败:', err)
      alert(err?.response?.data?.error || '导入失败，请检查文件格式')
    }
  }

  const renderGroup = (g: ScadaGroup, depth = 0): React.ReactNode => (
    <div key={g.id}>
      <GroupItem
        label={g.name}
        icon={Icons.folder}
        active={selectedGroupId === g.id}
        depth={depth}
        onClick={() => setSelectedGroupId(g.id)}
      />
      {g.children?.map((c) => renderGroup(c, depth + 1))}
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Brand */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 14px', height: 'var(--header-h)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--accent-muted)', border: '1px solid var(--border-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <Svg d={Icons.scada} size={14} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
            SCADA
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Editor
          </span>
        </div>

        {/* Nav */}
        <div className="scada-scroll" style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
          <div style={{ padding: '0 10px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            组态分组
          </div>
          <GroupItem
            label="全部组态"
            icon={Icons.list}
            active={selectedGroupId === undefined}
            onClick={() => setSelectedGroupId(undefined)}
          />
          {tree.map((g) => renderGroup(g))}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <header style={{
          height: 'var(--header-h)', flexShrink: 0,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            组态列表
          </span>
          {infos.length > 0 && (
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              padding: '1px 7px', borderRadius: 'var(--radius-full)',
            }}>
              {infos.length}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative', width: 200 }}>
            <span style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none',
            }}>
              <Svg d={Icons.search} size={13} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索组态…"
              style={{
                width: '100%', paddingLeft: 28, paddingRight: 10, height: 32,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                fontSize: 12, outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
            />
          </div>

          <button
            style={btnOutline}
            onClick={() => navigate('/sim-points')}
          >
            <Svg d={['M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5']} size={13} />
            模拟点位
          </button>

          <button
            style={btnOutline}
            onClick={() => navigate('/customize')}
          >
            <Svg d={['M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16', 'M14 14l1.586-1.586a2 2 0 0 1 2.828 0L20 14', 'M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z']} size={13} />
            自定义组件
          </button>

          <button
            style={btnOutline}
            onClick={() => document.getElementById('import-file-input')?.click()}
            title="导入组态 JSON 文件"
          >
            <Svg d={Icons.upload} size={13} />
            导入
          </button>
          <input
            id="import-file-input"
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />

          <button
            style={btnPrimary}
            onClick={() => setShowCreate(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-dim)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <Svg d={Icons.plus} size={13} />
            新建
          </button>
        </header>

        {/* Grid */}
        <main className="scada-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {isLoading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-muted)', gap: 10,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2}
                style={{ animation: 'spin 1s linear infinite' }}>
                <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              加载中…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onNew={() => setShowCreate(true)} />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
              alignContent: 'start',
            }}>
              {filtered.map((info) => (
                <ScadaCard
                  key={info.id}
                  info={info}
                  publishBusy={publishBusy}
                  copyBusy={copyInfo.isPending}
                  onEdit={() => navigate(`/editor/${info.id}`)}
                  onEditMeta={() => setEditMeta({ id: info.id, name: info.scada_name, groupId: info.group_id })}
                  onPreview={() => navigate(`/preview/${info.id}`)}
                  onTogglePublish={() => {
                    if (info.publish_status === 1) {
                      if (confirm('确认取消发布？取消后免登录访问链接将失效')) unpublish.mutate(info.id)
                    } else {
                      publish.mutate(info.id)
                    }
                  }}
                  onCopy={() => copyInfo.mutate(info)}
                  onExport={() => handleExport(info.id, info.scada_name)}
                  onDelete={() => { if (confirm('确认删除？此操作不可恢复')) deleteInfo.mutate(info.id) }}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Edit metadata dialog (name + group) ── */}
      {editMeta && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditMeta(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 400, background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>编辑组态信息</span>
              <button
                onClick={() => setEditMeta(null)}
                className="icon-btn"
                style={{ width: 26, height: 26, color: 'var(--text-muted)' }}
              >
                <Svg d="M18 6 6 18M6 6l12 12" size={14} />
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>名称</label>
                <input
                  value={editMeta.name}
                  onChange={(e) => setEditMeta({ ...editMeta, name: e.target.value })}
                  placeholder="组态显示名称"
                  onKeyDown={(e) => { if (e.key === 'Enter' && editMeta.name.trim()) handleUpdateMeta() }}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>分组</label>
                <select
                  value={editMeta.groupId ?? ''}
                  onChange={(e) => setEditMeta({ ...editMeta, groupId: e.target.value ? Number(e.target.value) : undefined })}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                >
                  <option value="">未分组</option>
                  {flattenGroups(tree).map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{
              padding: '12px 16px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                style={btnOutline}
                onClick={() => setEditMeta(null)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                取消
              </button>
              <button
                style={{
                  ...btnPrimary,
                  opacity: (updateInfo.isPending || !editMeta.name.trim()) ? 0.4 : 1,
                  pointerEvents: (updateInfo.isPending || !editMeta.name.trim()) ? 'none' : 'auto',
                }}
                onClick={handleUpdateMeta}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
              >
                {updateInfo.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create dialog ── */}
      {showCreate && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 400, background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>新建组态</span>
              <button
                onClick={() => setShowCreate(false)}
                className="icon-btn"
                style={{ width: 26, height: 26, color: 'var(--text-muted)' }}
              >
                <Svg d="M18 6 6 18M6 6l12 12" size={14} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>名称</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="组态显示名称"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>编码</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="唯一英文编码，如 main_panel"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
                  编码用于 API 访问，创建后不可更改
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 16px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                style={btnOutline}
                onClick={() => setShowCreate(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                取消
              </button>
              <button
                style={{
                  ...btnPrimary,
                  opacity: (createInfo.isPending || !newName.trim() || !newCode.trim()) ? 0.4 : 1,
                  pointerEvents: (createInfo.isPending || !newName.trim() || !newCode.trim()) ? 'none' : 'auto',
                }}
                onClick={handleCreate}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
              >
                {createInfo.isPending ? '创建中…' : '创建并打开'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
