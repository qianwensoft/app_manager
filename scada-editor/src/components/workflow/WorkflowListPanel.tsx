/**
 * 工作流列表面板：增删/复制/启停，区分 canvas / global 作用域。
 */
import type { ScadaWorkflow, WorkflowScope } from '@/types/workflow'
import { Button } from '@/components/ui/button'

interface Props {
  workflows: ScadaWorkflow[]
  selectedId?: string
  onSelect: (id: string) => void
  onAdd: (scope: WorkflowScope) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
}

const SOURCE_LABELS: Record<string, string> = {
  point_change: '点位', condition: '条件', component: '组件', timer: '定时',
  canvas_enter: '进入', canvas_exit: '退出', custom_event: '事件', context_change: '上下文',
}

export default function WorkflowListPanel({ workflows, selectedId, onSelect, onAdd, onDelete, onDuplicate, onToggleEnabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <Button size="sm" variant="outline" onClick={() => onAdd('canvas')} style={{ flex: 1 }}>+ 画布工作流</Button>
        <Button size="sm" variant="outline" onClick={() => onAdd('global')} style={{ flex: 1 }}>+ 全局工作流</Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {workflows.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无工作流</div>
        )}
        {workflows.map((w) => {
          const scope = w.scope ?? 'canvas'
          const active = w.id === selectedId
          const enabled = w.enabled !== false
          return (
            <div
              key={w.id}
              onClick={() => onSelect(w.id)}
              style={{
                padding: '8px 10px', marginBottom: 6, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-muted)' : 'var(--bg-surface)',
                opacity: enabled ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: scope === 'global' ? 'rgba(168,85,247,0.18)' : 'rgba(74,158,255,0.18)',
                  color: scope === 'global' ? '#c084fc' : 'var(--accent)',
                }}>{scope === 'global' ? '全局' : '画布'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.name || '未命名工作流'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {SOURCE_LABELS[w.source.kind] ?? w.source.kind}
                  {w.graph?.nodes?.length ? ` · DAG(${w.graph.nodes.length})` : ` · ${w.actions.length}动作`}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleEnabled(w.id, !enabled) }}
                  title={enabled ? '禁用' : '启用'}
                  style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: enabled ? '#22c55e' : 'var(--text-muted)', cursor: 'pointer' }}
                >{enabled ? '启用' : '禁用'}</button>
                <button onClick={(e) => { e.stopPropagation(); onDuplicate(w.id) }} title="复制" style={iconBtn}>⧉</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(w.id) }} title="删除" style={{ ...iconBtn, color: 'var(--danger, #ef4444)' }}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  fontSize: 12, width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
}
