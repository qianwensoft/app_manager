/**
 * 单个 WorkflowAction 编辑器：动作类型下拉 + 各类型专属字段 + 共享降级（when/timeout/retry/onError）。
 * 被 NodeInspector（DAG tool 节点）与线性动作链复用。
 */
import { useState } from 'react'
import type {
  WorkflowAction, WorkflowActionType, ElementSelector, ConditionExpr, ConditionOperator, StateScopeKind,
} from '@/types/workflow'
import type { CanvasElement } from '@/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import ScriptEditor from './ScriptEditor'

interface Props {
  action: WorkflowAction
  onChange: (a: WorkflowAction) => void
  elements: CanvasElement[]
  canvases: { id: number; name: string }[]
}

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  set_element_prop: '设置元素属性',
  set_element_binding: '注入元素绑定值',
  set_context: '写上下文',
  call_interface: '调用数据接口',
  switch_canvas: '切换画布',
  open_modal: '打开模态',
  close_modal: '关闭模态',
  toast: '顶部提示',
  emit_event: '触发自定义事件',
  run_script: '运行脚本',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }
const rowStyle: React.CSSProperties = { marginBottom: 10 }

function defaultAction(type: WorkflowActionType): WorkflowAction {
  const sel: ElementSelector = { by: 'id', ref: '' }
  switch (type) {
    case 'set_element_prop': return { type, targetSel: sel, prop: '', value_src: '' }
    case 'set_element_binding': return { type, targetSel: sel, value_src: '' }
    case 'set_context': return { type, scope: 'workflow', key: '', value_src: '' }
    case 'call_interface': return { type, param_map: [], result_map: [], result_scope: 'workflow' }
    case 'switch_canvas': return { type, canvasId: 0 }
    case 'open_modal': return { type, target: '' }
    case 'close_modal': return { type, target: '' }
    case 'toast': return { type, message_src: '' }
    case 'emit_event': return { type, eventName: '' }
    case 'run_script': return { type, script: '' }
  }
}

/** 元素选择器编辑器 */
function SelectorEditor({ sel, onChange, elements }: { sel: ElementSelector; onChange: (s: ElementSelector) => void; elements: CanvasElement[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px dashed var(--border)', borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select value={sel.by} onChange={(e) => onChange({ ...sel, by: e.target.value as 'id' | 'name' })} style={{ width: 80 }}>
          <option value="id">按 ID</option>
          <option value="name">按名称</option>
        </Select>
        {sel.by === 'id' ? (
          <Select value={sel.ref} onChange={(e) => onChange({ ...sel, ref: e.target.value })} style={{ flex: 1 }}>
            <option value="">（选择元素）</option>
            {elements.map((el) => <option key={el.id} value={el.id}>{el.name || el.type}（{el.id.slice(0, 6)}）</option>)}
          </Select>
        ) : (
          <Input value={sel.ref} onChange={(e) => onChange({ ...sel, ref: e.target.value })} placeholder="名称或 组合名.子元素名" style={{ flex: 1 }} />
        )}
      </div>
      <Input value={sel.instanceKey ?? ''} onChange={(e) => onChange({ ...sel, instanceKey: e.target.value === '' ? undefined : e.target.value })} placeholder="模板实例 key/索引（可选）" />
    </div>
  )
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' }, { value: 'lt', label: '<' },
  { value: 'in', label: '包含于(逗号分隔)' },
  { value: 'empty', label: '为空' }, { value: 'not_empty', label: '非空' },
]

/** 条件表达式编辑器（when） */
export function ConditionEditor({ cond, onChange }: { cond?: ConditionExpr; onChange: (c: ConditionExpr | undefined) => void }) {
  const enabled = !!cond
  return (
    <div>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? { left_src: '', operator: 'eq', value: '' } : undefined)} />
        执行条件 (when)
      </label>
      {cond && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Input value={cond.left_src} onChange={(e) => onChange({ ...cond, left_src: e.target.value })} placeholder="$point.x" style={{ flex: 1 }} />
          <Select value={cond.operator} onChange={(e) => onChange({ ...cond, operator: e.target.value as ConditionOperator })} style={{ width: 130 }}>
            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {cond.operator !== 'empty' && cond.operator !== 'not_empty' && (
            <Input value={cond.value ?? ''} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder="值" style={{ flex: 1 }} />
          )}
        </div>
      )}
    </div>
  )
}

export default function ActionEditor({ action, onChange, elements, canvases }: Props) {
  const [showDegrade, setShowDegrade] = useState(false)
  const patch = (u: Partial<WorkflowAction>) => onChange({ ...action, ...u } as WorkflowAction)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={rowStyle}>
        <label style={labelStyle}>动作类型</label>
        <Select value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as WorkflowActionType))}>
          {(Object.keys(ACTION_LABELS) as WorkflowActionType[]).map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
        </Select>
      </div>

      {action.type === 'set_element_prop' && (
        <>
          <div style={rowStyle}><label style={labelStyle}>目标元素</label><SelectorEditor sel={action.targetSel} onChange={(s) => patch({ targetSel: s })} elements={elements} /></div>
          <div style={rowStyle}><label style={labelStyle}>属性名（支持点路径）</label><Input value={action.prop} onChange={(e) => patch({ prop: e.target.value })} placeholder="fill / text / properties.chartConfig.title" /></div>
          <div style={rowStyle}><label style={labelStyle}>值来源</label><Input value={action.value_src} onChange={(e) => patch({ value_src: e.target.value })} placeholder="$point.x / 字面量" /></div>
        </>
      )}

      {action.type === 'set_element_binding' && (
        <>
          <div style={rowStyle}><label style={labelStyle}>目标元素</label><SelectorEditor sel={action.targetSel} onChange={(s) => patch({ targetSel: s })} elements={elements} /></div>
          <div style={rowStyle}><label style={labelStyle}>值来源</label><Input value={action.value_src} onChange={(e) => patch({ value_src: e.target.value })} placeholder="$point.x / 字面量" /></div>
        </>
      )}

      {action.type === 'set_context' && (
        <>
          <div style={rowStyle}><label style={labelStyle}>作用域</label>
            <Select value={action.scope} onChange={(e) => patch({ scope: e.target.value as Exclude<StateScopeKind, 'element'> })}>
              <option value="global">global</option><option value="workflow">workflow</option>
            </Select>
          </div>
          <div style={rowStyle}><label style={labelStyle}>key（支持点路径）</label><Input value={action.key} onChange={(e) => patch({ key: e.target.value })} /></div>
          <div style={rowStyle}><label style={labelStyle}>值来源</label><Input value={action.value_src} onChange={(e) => patch({ value_src: e.target.value })} placeholder="$point.x / 字面量" /></div>
        </>
      )}

      {action.type === 'call_interface' && <CallInterfaceFields action={action} patch={patch} />}

      {action.type === 'switch_canvas' && (
        <div style={rowStyle}><label style={labelStyle}>目标画布</label>
          <Select value={action.canvasId} onChange={(e) => patch({ canvasId: Number(e.target.value) })}>
            <option value={0}>（选择画布）</option>
            {canvases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}

      {(action.type === 'open_modal' || action.type === 'close_modal') && (
        <div style={rowStyle}><label style={labelStyle}>模态元素 id</label>
          <Select value={action.target} onChange={(e) => patch({ target: e.target.value })}>
            <option value="">（选择元素）</option>
            {elements.filter((el) => el.type === 'layout-modal').map((el) => <option key={el.id} value={el.id}>{el.name || el.id.slice(0, 6)}</option>)}
          </Select>
        </div>
      )}

      {action.type === 'toast' && (
        <div style={rowStyle}><label style={labelStyle}>消息来源</label><Input value={action.message_src} onChange={(e) => patch({ message_src: e.target.value })} placeholder="$workflow.msg / 字面量" /></div>
      )}

      {action.type === 'emit_event' && (
        <>
          <div style={rowStyle}><label style={labelStyle}>事件名</label><Input value={action.eventName} onChange={(e) => patch({ eventName: e.target.value })} /></div>
          <div style={rowStyle}><label style={labelStyle}>数据来源（可选）</label><Input value={action.data_src ?? ''} onChange={(e) => patch({ data_src: e.target.value || undefined })} placeholder="$workflow.payload" /></div>
        </>
      )}

      {action.type === 'run_script' && (
        <div style={rowStyle}><label style={labelStyle}>脚本（async 函数体，ctx 注入）</label>
          <ScriptEditor value={action.script} onChange={(v) => patch({ script: v })} placeholder="// 例：ctx.setProp({by:'id',ref:'e1'}, 'fill', '#f00')" />
        </div>
      )}

      {/* 共享降级 */}
      <div style={{ marginTop: 4 }}>
        <button onClick={() => setShowDegrade((v) => !v)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {showDegrade ? '▾' : '▸'} 条件 / 超时 / 重试 / 失败策略
        </button>
        {showDegrade && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={rowStyle}><ConditionEditor cond={action.when} onChange={(c) => patch({ when: c })} /></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>超时 (ms)</label><Input type="number" value={action.timeout ?? ''} onChange={(e) => patch({ timeout: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>失败策略</label>
                <Select value={action.onError ?? 'abort'} onChange={(e) => patch({ onError: e.target.value as 'abort' | 'continue' | 'fallback' })}>
                  <option value="abort">中断</option><option value="continue">继续</option><option value="fallback">回退</option>
                </Select>
              </div>
            </div>
            {action.retry ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>最大次数</label><Input type="number" value={action.retry.maxAttempts} onChange={(e) => patch({ retry: { ...action.retry!, maxAttempts: Number(e.target.value) } })} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>退避</label>
                  <Select value={action.retry.backoff} onChange={(e) => patch({ retry: { ...action.retry!, backoff: e.target.value as 'fixed' | 'linear' | 'exponential' } })}>
                    <option value="fixed">固定</option><option value="linear">线性</option><option value="exponential">指数</option>
                  </Select>
                </div>
                <div style={{ flex: 1 }}><label style={labelStyle}>初始延迟</label><Input type="number" value={action.retry.initialDelay} onChange={(e) => patch({ retry: { ...action.retry!, initialDelay: Number(e.target.value) } })} /></div>
                <Button size="sm" variant="ghost" onClick={() => patch({ retry: undefined })}>移除</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => patch({ retry: { maxAttempts: 3, backoff: 'exponential', initialDelay: 500 } })}>启用重试</Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** call_interface 专属字段：入参映射 + 结果回填 */
function CallInterfaceFields({ action, patch }: { action: Extract<WorkflowAction, { type: 'call_interface' }>; patch: (u: Partial<WorkflowAction>) => void }) {
  const paramMap = action.param_map ?? []
  const resultMap = action.result_map ?? []
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>接口 ID</label><Input type="number" value={action.ifaceId ?? ''} onChange={(e) => patch({ ifaceId: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>接口 Code</label><Input value={action.ifaceCode ?? ''} onChange={(e) => patch({ ifaceCode: e.target.value || undefined })} /></div>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>入参映射</label>
        {paramMap.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <Input value={p.key} onChange={(e) => { const n = [...paramMap]; n[i] = { ...p, key: e.target.value }; patch({ param_map: n }) }} placeholder="参数名" style={{ flex: 1 }} />
            <Input value={p.src} onChange={(e) => { const n = [...paramMap]; n[i] = { ...p, src: e.target.value }; patch({ param_map: n }) }} placeholder="$point.x" style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" onClick={() => patch({ param_map: paramMap.filter((_, j) => j !== i) })}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => patch({ param_map: [...paramMap, { key: '', src: '' }] })}>+ 入参</Button>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>结果回填（作用域）</label>
        <Select value={action.result_scope ?? 'workflow'} onChange={(e) => patch({ result_scope: e.target.value as Exclude<StateScopeKind, 'element'> })}>
          <option value="workflow">workflow</option><option value="global">global</option>
        </Select>
        {resultMap.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, marginTop: 4 }}>
            <Input value={r.response_field} onChange={(e) => { const n = [...resultMap]; n[i] = { ...r, response_field: e.target.value }; patch({ result_map: n }) }} placeholder="返回字段(点路径)" style={{ flex: 1 }} />
            <Input value={r.context_key} onChange={(e) => { const n = [...resultMap]; n[i] = { ...r, context_key: e.target.value }; patch({ result_map: n }) }} placeholder="上下文 key" style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" onClick={() => patch({ result_map: resultMap.filter((_, j) => j !== i) })}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => patch({ result_map: [...resultMap, { response_field: '', context_key: '' }] })}>+ 回填</Button>
      </div>
    </>
  )
}
