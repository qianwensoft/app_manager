/**
 * 节点检查器：配置 DAG 选中节点。
 * - label 通用
 * - kind==='tool' → ActionEditor
 * - kind==='run_script' → ScriptEditor
 * - kind==='condition' → 提示（出边条件在边上配置，此处占位说明）
 */
import type { FlowGraph, FlowNode, WorkflowAction } from '@/types/workflow'
import type { CanvasElement } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ActionEditor from './ActionEditor'
import ScriptEditor from './ScriptEditor'

interface Props {
  graph: FlowGraph
  nodeId: string
  onChange: (g: FlowGraph) => void
  onDelete: (id: string) => void
  elements: CanvasElement[]
  canvases: { id: number; name: string }[]
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }

export default function NodeInspector({ graph, nodeId, onChange, onDelete, elements, canvases }: Props) {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>节点不存在</div>

  const patchNode = (u: Partial<FlowNode>) => {
    onChange({ ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...u } : n)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>节点配置 · {node.kind}</span>
        <Button size="sm" variant="ghost" onClick={() => onDelete(nodeId)}>删除节点</Button>
      </div>

      <div>
        <label style={labelStyle}>节点名称</label>
        <Input value={node.label ?? ''} onChange={(e) => patchNode({ label: e.target.value })} placeholder="可选" />
      </div>

      {node.kind === 'tool' && (
        <ActionEditor
          action={node.action ?? { type: 'toast', message_src: '' }}
          onChange={(a: WorkflowAction) => patchNode({ action: a })}
          elements={elements}
          canvases={canvases}
        />
      )}

      {node.kind === 'run_script' && (
        <div>
          <label style={labelStyle}>脚本（async 函数体，ctx 注入）</label>
          <ScriptEditor value={node.script ?? ''} onChange={(v) => patchNode({ script: v })} placeholder="// ctx.setProp(...)" />
        </div>
      )}

      {node.kind === 'start' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          起点节点：工作流图的显式入口，无副作用、无产出，只有出边。
          从此节点向下连线，串起首批要执行的节点。触发源在上方「触发源」中配置。
        </div>
      )}

      {node.kind === 'condition' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          条件节点：为其每条出边设置条件，运行时按条件放行匹配的分支（不匹配的下游被剪枝）。
          出边条件请在下方边列表中配置。
        </div>
      )}

      {(node.kind === 'parallel' || node.kind === 'barrier') && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {node.kind === 'parallel' ? '并行节点：其所有出边下游节点并行执行。' : '汇聚节点：等待所有入边上游完成后继续。'}
        </div>
      )}

      {/* 出边条件（供 condition 分支） */}
      <EdgeConditionList graph={graph} nodeId={nodeId} onChange={onChange} />
    </div>
  )
}

function EdgeConditionList({ graph, nodeId, onChange }: { graph: FlowGraph; nodeId: string; onChange: (g: FlowGraph) => void }) {
  const outEdges = graph.edges.filter((e) => e.source === nodeId)
  if (outEdges.length === 0) return null
  const nodeName = (id: string) => graph.nodes.find((n) => n.id === id)?.label || id.slice(0, 6)
  return (
    <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <label style={labelStyle}>出边条件</label>
      {outEdges.map((e) => (
        <div key={e.id} style={{ marginBottom: 8, padding: 8, border: '1px dashed var(--border)', borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>→ {nodeName(e.target)}</div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={!!e.condition}
              onChange={(ev) => {
                const cond = ev.target.checked ? { left_src: '', operator: 'eq' as const, value: '' } : undefined
                onChange({ ...graph, edges: graph.edges.map((x) => (x.id === e.id ? { ...x, condition: cond } : x)) })
              }}
            />
            启用条件
          </label>
          {e.condition && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <Input value={e.condition.left_src} onChange={(ev) => onChange({ ...graph, edges: graph.edges.map((x) => (x.id === e.id ? { ...x, condition: { ...x.condition!, left_src: ev.target.value } } : x)) })} placeholder="$node.n1.result" style={{ flex: 1 }} />
              <select
                value={e.condition.operator}
                onChange={(ev) => onChange({ ...graph, edges: graph.edges.map((x) => (x.id === e.id ? { ...x, condition: { ...x.condition!, operator: ev.target.value as NonNullable<typeof x.condition>['operator'] } } : x)) })}
                style={{ fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="eq">=</option><option value="neq">≠</option><option value="gt">&gt;</option>
                <option value="lt">&lt;</option><option value="in">包含</option>
                <option value="empty">空</option><option value="not_empty">非空</option>
              </select>
              <Input value={e.condition.value ?? ''} onChange={(ev) => onChange({ ...graph, edges: graph.edges.map((x) => (x.id === e.id ? { ...x, condition: { ...x.condition!, value: ev.target.value } } : x)) })} placeholder="值" style={{ flex: 1 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
