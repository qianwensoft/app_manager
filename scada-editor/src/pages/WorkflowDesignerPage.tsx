/**
 * 工作流设计器（全屏）：路由 /workflow/:id。
 * 布局：左=工作流列表，中=触发源+DAG/动作链，右=节点检查器。
 * 数据源为 editorStore.project.workflows，随 save-canvas 持久化。
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useScadaInfo, useSaveCanvas } from '@/hooks/useScada'
import { useEditorStore } from '@/store/editorStore'
import type { ScadaWorkflow, WorkflowScope, WorkflowSource, WorkflowAction, FlowGraph, ConditionExpr } from '@/types/workflow'
import type { CanvasProject } from '@/types'
import { generateId } from '@/utils/canvas'
import WorkflowListPanel from '@/components/workflow/WorkflowListPanel'
import SourceEditor from '@/components/workflow/SourceEditor'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas'
import NodeInspector from '@/components/workflow/NodeInspector'
import ActionEditor, { ConditionEditor } from '@/components/workflow/ActionEditor'
import LibManagerModal from '@/components/workflow/LibManagerModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToastHost } from '@/components/ToastHost'
import {
  setupWorkflows,
  createElementScope,
  createContextStore,
  getGlobalContext,
  loadLibs,
} from '@/runtime/workflow'
import { makeCallInterface } from '@/runtime/workflow/callInterface'
import { pushHistory } from '@/hooks/useHistory'

const MAIN_CANVAS_ID = 100001

function normalizeProject(raw: unknown): CanvasProject | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.canvases && typeof obj.canvases === 'object') return obj as unknown as CanvasProject
  return null
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }
const panelStyle: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border)' }

export default function WorkflowDesignerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const scadaId = Number(id)
  const { data: info } = useScadaInfo(scadaId)
  const store = useEditorStore()
  const saveCanvas = useSaveCanvas()

  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [mode, setMode] = useState<'dag' | 'actions'>('dag')
  const [showLibs, setShowLibs] = useState(false)
  const [testing, setTesting] = useState(false)
  const { toast, node: toastNode } = useToastHost()

  // 载入项目（若编辑器未载入过）
  useEffect(() => {
    if (store.scadaId === scadaId) return
    if (!info?.canvas_data) return
    try {
      const project = normalizeProject(JSON.parse(info.canvas_data))
      if (project) store.loadProject(scadaId, project)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, scadaId])

  const workflows = store.project.workflows ?? []
  const workflowLibs = store.project.workflowLibs ?? []
  const selected = workflows.find((w) => w.id === selectedId)

  // 元素/画布下拉数据（合并所有画布元素，供选择器）
  const allElements = useMemo(
    () => Object.values(store.project.canvases).flatMap((c) => c?.elements ?? []),
    [store.project.canvases],
  )
  const canvasList = useMemo(
    () => Object.values(store.project.canvases).map((c) => ({ id: c!.id, name: c!.name })),
    [store.project.canvases],
  )

  const addWorkflow = (scope: WorkflowScope) => {
    const wf: ScadaWorkflow = {
      id: generateId(),
      name: scope === 'global' ? '全局工作流' : '画布工作流',
      scope,
      canvasId: scope === 'canvas' ? (store.project.activeCanvasId ?? MAIN_CANVAS_ID) : undefined,
      source: { kind: 'point_change', pointKey: '' },
      actions: [],
      graph: { nodes: [], edges: [] },
      enabled: true,
    }
    store.addWorkflow(wf)
    setSelectedId(wf.id)
    setSelectedNodeId(undefined)
  }

  const patchWf = (u: Partial<ScadaWorkflow>) => { if (selectedId) store.updateWorkflow(selectedId, u) }

  const doSave = () => {
    if (!scadaId) return
    saveCanvas.mutate({ id: scadaId, project: store.project })
  }

  // 编辑器内「试跑」：用当前编辑器元素 + 空点位构造最小依赖，按 id 触发一次。
  // 属性写入走 store.updateElement（可见即时生效），接口走真实 REST。
  const runTest = async () => {
    if (!selected || testing) return
    setTesting(true)
    try {
      if (workflowLibs.length) {
        try { await loadLibs(workflowLibs) } catch { /* 忽略库加载失败 */ }
      }
      pushHistory(store.project)
      const elementScope = createElementScope({
        getElements: () => allElements,
        applyProp: (elementId, updates) => store.updateElement(elementId, updates),
      })
      const runtime = setupWorkflows([selected], {
        getElements: () => allElements,
        getPointData: () => ({}),
        elementScope,
        globalContext: getGlobalContext(),
        makeWorkflowContext: () => createContextStore(),
        callInterface: makeCallInterface(),
        switchCanvas: (cid) => store.switchCanvas(cid),
        openModal: (t) => toast(`打开弹窗：${t}`),
        closeModal: (t) => toast(`关闭弹窗：${t}`),
        toast,
      })
      runtime.runWorkflowById(selected.id, { event: { __test: true } })
      toast(`已试跑「${selected.name || selected.id}」`)
      // 动作链/DAG 内部为异步，稍后清理监听
      setTimeout(() => runtime.cleanup(), 5000)
    } catch (err) {
      toast(`试跑失败：${(err as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--header-h)', flexShrink: 0, ...panelStyle, borderWidth: '0 0 1px 0', padding: '0 12px' }}>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/editor/${scadaId}`)}>← 编辑器</Button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em' }}>工作流设计器</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{info?.scada_name}</span>
        <div style={{ flex: 1 }} />
        {selected && (
          <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
            {testing ? '试跑中…' : '▶ 试跑'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowLibs(true)}>外部库</Button>
        <Button size="sm" variant={store.isDirty ? 'default' : 'outline'} onClick={doSave} disabled={saveCanvas.isPending}>
          {saveCanvas.isPending ? '保存中…' : '保存'}
        </Button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: list */}
        <div style={{ width: 240, flexShrink: 0, ...panelStyle, borderWidth: '0 1px 0 0', overflow: 'hidden' }}>
          <WorkflowListPanel
            workflows={workflows}
            selectedId={selectedId}
            onSelect={(wid) => { setSelectedId(wid); setSelectedNodeId(undefined) }}
            onAdd={addWorkflow}
            onDelete={(wid) => { store.deleteWorkflow(wid); if (wid === selectedId) setSelectedId(undefined) }}
            onDuplicate={(wid) => store.duplicateWorkflow(wid)}
            onToggleEnabled={(wid, en) => store.updateWorkflow(wid, { enabled: en })}
          />
        </div>

        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            选择或新建一个工作流
          </div>
        ) : (
          <WorkflowEditor
            key={selected.id}
            wf={selected}
            patchWf={patchWf}
            mode={mode}
            setMode={setMode}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            elements={allElements}
            canvases={canvasList}
          />
        )}
      </div>

      {showLibs && (
        <LibManagerModal
          libs={workflowLibs}
          onChange={(libs) => store.setWorkflowLibs(libs)}
          onClose={() => setShowLibs(false)}
        />
      )}
      {toastNode}
    </div>
  )
}

interface EditorProps {
  wf: ScadaWorkflow
  patchWf: (u: Partial<ScadaWorkflow>) => void
  mode: 'dag' | 'actions'
  setMode: (m: 'dag' | 'actions') => void
  selectedNodeId?: string
  setSelectedNodeId: (id: string | undefined) => void
  elements: import('@/types').CanvasElement[]
  canvases: { id: number; name: string }[]
}

function WorkflowEditor({ wf, patchWf, mode, setMode, selectedNodeId, setSelectedNodeId, elements, canvases }: EditorProps) {
  const graph: FlowGraph = wf.graph ?? { nodes: [], edges: [] }

  const setGraph = (g: FlowGraph) => patchWf({ graph: g })
  const deleteNode = (nid: string) => {
    setGraph({ nodes: graph.nodes.filter((n) => n.id !== nid), edges: graph.edges.filter((e) => e.source !== nid && e.target !== nid) })
    setSelectedNodeId(undefined)
  }

  const setActions = (actions: WorkflowAction[]) => patchWf({ actions })
  const addAction = () => setActions([...wf.actions, { type: 'toast', message_src: '' }])

  return (
    <>
      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* meta bar */}
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>工作流名称</label>
              <Input value={wf.name ?? ''} onChange={(e) => patchWf({ name: e.target.value })} placeholder="未命名" />
            </div>
            <div style={{ width: 120 }}>
              <label style={labelStyle}>作用域</label>
              <Select value={wf.scope ?? 'canvas'} onChange={(e) => patchWf({ scope: e.target.value as WorkflowScope })}>
                <option value="canvas">画布</option><option value="global">全局</option>
              </Select>
            </div>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
              {(['dag', 'actions'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)',
                }}>{m === 'dag' ? 'DAG 编排' : '动作链'}</button>
              ))}
            </div>
          </div>
          <SourceEditor source={wf.source} onChange={(s: WorkflowSource) => patchWf({ source: s })} elements={elements} />
          <ConditionEditor cond={wf.when} onChange={(c: ConditionExpr | undefined) => patchWf({ when: c })} />
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {mode === 'dag' ? (
            <WorkflowCanvas graph={graph} onChange={setGraph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          ) : (
            <div style={{ padding: 12, overflow: 'auto', height: '100%' }}>
              {wf.actions.map((a, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>动作 {i + 1}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const n = [...wf.actions]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setActions(n) }}>↑</Button>
                      <Button size="sm" variant="ghost" disabled={i === wf.actions.length - 1} onClick={() => { const n = [...wf.actions]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setActions(n) }}>↓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setActions(wf.actions.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  </div>
                  <ActionEditor action={a} onChange={(na) => { const n = [...wf.actions]; n[i] = na; setActions(n) }} elements={elements} canvases={canvases} />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addAction}>+ 添加动作</Button>
            </div>
          )}
        </div>
      </div>

      {/* Right: node inspector (dag mode) */}
      {mode === 'dag' && (
        <div style={{ width: 320, flexShrink: 0, ...panelStyle, borderWidth: '0 0 0 1px', overflow: 'auto', padding: 12 }}>
          {selectedNodeId ? (
            <NodeInspector graph={graph} nodeId={selectedNodeId} onChange={setGraph} onDelete={deleteNode} elements={elements} canvases={canvases} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 20 }}>选择一个节点进行配置</div>
          )}
        </div>
      )}
    </>
  )
}

