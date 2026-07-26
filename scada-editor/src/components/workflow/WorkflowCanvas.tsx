/**
 * DAG 画布：@xyflow/react 节点/连线编辑。
 * 节点类型 tool / run_script / parallel / barrier / condition。
 * 与 FlowGraph（nodes/edges）双向同步；节点位置存 node.position。
 *
 * 状态策略：由 React Flow 自身持有 nodes/edges（useNodesState/useEdgesState），
 * 通过 effect 从外部 graph 结构同步进来；仅在「有意义的变更」（拖拽落点、
 * 删除、连线）时写回 store —— 绝不把 React Flow 的自动尺寸测量变更写回，
 * 否则会形成 测量→写回→重建→再测量 的死循环，导致节点无法渲染。
 */
import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
  Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowGraph, FlowNode, FlowNodeKind, WorkflowAction } from '@/types/workflow'
import { generateId } from '@/utils/canvas'

interface Props {
  graph: FlowGraph
  onChange: (g: FlowGraph) => void
  selectedNodeId?: string
  onSelectNode: (id: string | undefined) => void
}

const KIND_COLORS: Record<FlowNodeKind, string> = {
  start: '#10b981',
  tool: '#4a9eff',
  run_script: '#a855f7',
  parallel: '#22c55e',
  barrier: '#f59e0b',
  condition: '#ec4899',
}

const KIND_LABELS: Record<FlowNodeKind, string> = {
  start: '起点', tool: '动作', run_script: '脚本', parallel: '并行', barrier: '汇聚', condition: '条件',
}

interface FlowNodeData extends Record<string, unknown> {
  kind: FlowNodeKind
  label?: string
  action?: WorkflowAction
}

type RFNode = Node<FlowNodeData>

function DagNode({ data, selected }: NodeProps<RFNode>) {
  const color = KIND_COLORS[data.kind]
  const isStart = data.kind === 'start'
  return (
    <div style={{
      minWidth: 120, padding: '8px 12px', borderRadius: isStart ? 20 : 8,
      background: isStart ? `${color}22` : 'var(--bg-elevated)',
      border: `2px solid ${selected ? color : isStart ? color : 'var(--border-strong)'}`,
      boxShadow: selected ? `0 0 0 2px ${color}44` : 'none',
      fontSize: 12, color: 'var(--text-primary)',
    }}>
      {!isStart && <Handle type="target" position={Position.Top} style={{ background: color }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{KIND_LABELS[data.kind]}</span>
      </div>
      <div style={{ marginTop: 2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
        {data.label || data.action?.type || data.kind}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  )
}

const nodeTypes = { dag: DagNode }

function toRFNode(n: FlowNode, selectedNodeId?: string): RFNode {
  return {
    id: n.id,
    type: 'dag',
    position: n.position ?? { x: 0, y: 0 },
    data: { kind: n.kind, label: n.label, action: n.action },
    selected: n.id === selectedNodeId,
  }
}

function toRFEdge(e: FlowGraph['edges'][number]): Edge {
  return {
    id: e.id, source: e.source, target: e.target,
    label: e.condition ? '条件' : undefined,
    animated: !!e.condition,
    style: { stroke: 'var(--border-strong)' },
  }
}

export default function WorkflowCanvas({ graph, onChange, selectedNodeId, onSelectNode }: Props) {
  const [rfNodes, setRfNodes, onNodesChangeBase] = useNodesState<RFNode>([])
  const [rfEdges, setRfEdges, onEdgesChangeBase] = useEdgesState<Edge>([])

  // 用 ref 保存最新 graph/onChange，供事件回调读取，避免闭包过期
  const graphRef = useRef(graph)
  graphRef.current = graph
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 从外部 graph 结构同步进来（新增/删除节点、label/action 变化、选中态）。
  // 保留 React Flow 已测量的尺寸，避免闪烁与重复测量。
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((p) => [p.id, p]))
      return graph.nodes.map((n) => {
        const base = toRFNode(n, selectedNodeId)
        const old = prevById.get(n.id)
        if (old) {
          return { ...base, position: old.position, width: old.width, height: old.height, measured: old.measured }
        }
        return base
      })
    })
  }, [graph.nodes, selectedNodeId, setRfNodes])

  useEffect(() => {
    setRfEdges(graph.edges.map(toRFEdge))
  }, [graph.edges, setRfEdges])

  // 节点变更：先交给 React Flow 内部状态，仅在删除或拖拽结束时写回 store。
  const onNodesChange = useCallback((changes: NodeChange<RFNode>[]) => {
    onNodesChangeBase(changes)
    const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id)
    const draggedEnd = changes.some((c) => c.type === 'position' && (c as { dragging?: boolean }).dragging === false)
    if (removed.length) {
      const g = graphRef.current
      onChangeRef.current({
        nodes: g.nodes.filter((n) => !removed.includes(n.id)),
        edges: g.edges.filter((e) => !removed.includes(e.source) && !removed.includes(e.target)),
      })
    } else if (draggedEnd) {
      // 用最新的内部节点位置写回
      setRfNodes((cur) => {
        const posById = new Map(cur.map((c) => [c.id, c.position]))
        const g = graphRef.current
        onChangeRef.current({
          ...g,
          nodes: g.nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
        })
        return cur
      })
    }
  }, [onNodesChangeBase, setRfNodes])

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    onEdgesChangeBase(changes)
    const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id)
    if (removed.length) {
      const g = graphRef.current
      onChangeRef.current({ ...g, edges: g.edges.filter((e) => !removed.includes(e.id)) })
    }
  }, [onEdgesChangeBase])

  const onConnect = useCallback((conn: Connection) => {
    const id = generateId()
    setRfEdges((eds) => addEdge({ ...conn, id }, eds))
    const g = graphRef.current
    onChangeRef.current({
      ...g,
      edges: [...g.edges, { id, source: conn.source, target: conn.target }],
    })
  }, [setRfEdges])

  const addNode = (kind: FlowNodeKind) => {
    // 起点唯一：已存在则选中现有起点，不重复创建
    if (kind === 'start') {
      const existing = graphRef.current.nodes.find((n) => n.kind === 'start')
      if (existing) { onSelectNode(existing.id); return }
    }
    const node: FlowNode = {
      id: generateId(),
      kind,
      label: KIND_LABELS[kind],
      position: kind === 'start' ? { x: 60, y: 40 } : { x: 120 + Math.random() * 200, y: 120 + Math.random() * 200 },
      ...(kind === 'tool' ? { action: { type: 'toast', message_src: '' } } : {}),
      ...(kind === 'run_script' ? { script: '' } : {}),
    }
    onChangeRef.current({ ...graphRef.current, nodes: [...graphRef.current.nodes, node] })
    onSelectNode(node.id)
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(KIND_LABELS) as FlowNodeKind[]).map((k) => (
          <button key={k} onClick={() => addNode(k)} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            borderRadius: 6, border: `1px solid ${KIND_COLORS[k]}`,
            background: 'var(--bg-panel)', color: KIND_COLORS[k],
          }}>+ {KIND_LABELS[k]}</button>
        ))}
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => onSelectNode(n.id)}
        onPaneClick={() => onSelectNode(undefined)}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable style={{ background: 'var(--bg-surface)' }} />
      </ReactFlow>
    </div>
  )
}
