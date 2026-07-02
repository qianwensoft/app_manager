/**
 * 页面级统一事件系统配置（config_json.events[]）。
 * 每个事件：事件源（扫码/自定义事件/按钮/字段变更）+ 触发条件 + 动作链。
 * 动作支持：设字段 / 调接口 / 打印 / 跳页 / 提示。
 */
import React from 'react'
import { Button, Input, Select, Collapse, Space, Tooltip, AutoComplete } from 'antd'
import type { FieldDef } from '@/runtime/types'
import type { PrinterTemplate } from '@/runtime/printerTypes'
import type {
  PageEvent, EventAction, EventSource, ConditionExpr, ConditionOperator, InterfaceType,
} from '@/runtime/eventTypes'
import ScriptEditor from './ScriptEditor'

let _seq = 0
function genId(prefix: string): string {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }

type IfaceOpt = { value: string; label: string }

/** 从 JSON Schema 递归提取所有点路径，用于 response_field 补全提示 */
function extractSchemaPaths(schema: any, prefix = ''): string[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return prefix ? [prefix] : []
  const paths: string[] = []
  for (const [key, val] of Object.entries<any>(schema.properties)) {
    const path = prefix ? `${prefix}.${key}` : key
    paths.push(path)
    if (val?.type === 'object') paths.push(...extractSchemaPaths(val, path))
    else if (val?.type === 'array' && val.items?.type === 'object') {
      paths.push(...extractSchemaPaths(val.items, `${path}[]`))
    }
  }
  return paths
}

/** 从 JSON Schema 生成 demo 对象（只取标量叶子，用于展示） */
function schemaToDemo(schema: any, depth = 0): any {
  if (!schema || depth > 4) return null
  if (schema.example !== undefined) return schema.example
  switch (schema.type) {
    case 'object': {
      const obj: Record<string, any> = {}
      for (const [k, v] of Object.entries<any>(schema.properties || {})) {
        obj[k] = schemaToDemo(v, depth + 1)
      }
      return obj
    }
    case 'array': return [schemaToDemo(schema.items, depth + 1)]
    case 'string': return schema.enum?.[0] ?? '示例'
    case 'number':
    case 'integer': return 0
    case 'boolean': return false
    default: return null
  }
}

/** 从 param_contract_json 提取参数名列表（JSON 数组格式：[{name, type, required}]） */
function extractParamNames(paramContractJson: string | undefined): string[] {
  if (!paramContractJson) return []
  try {
    const contract = JSON.parse(paramContractJson)
    if (Array.isArray(contract)) {
      return contract.filter(p => p.name).map(p => p.name)
    }
  } catch {
    return []
  }
  return []
}

/** 解析 JSON Schema 字符串，返回点路径列表和 demo JSON 字符串 */
function parseSchema(schemaJson: string | undefined): { paths: string[]; demo: string } {
  if (!schemaJson) return { paths: [], demo: '' }
  try {
    const s = JSON.parse(schemaJson)
    return {
      paths: extractSchemaPaths(s),
      demo: JSON.stringify(schemaToDemo(s), null, 2),
    }
  } catch {
    return { paths: [], demo: '' }
  }
}

export default function EventsConfigSection({
  events,
  onChange,
  fields,
  printers,
  buttons = [],
  interfaceOptions,
  thirdPartyEndpointOptions,
  connectorInterfaceOptions,
  interfaceSchemas = {},
  thirdPartySchemas = {},
  connectorSchemas = {},
  interfaceParamSchemas = {},
  thirdPartyParamSchemas = {},
  connectorParamSchemas = {},
}: {
  events: PageEvent[]
  onChange: (next: PageEvent[]) => void
  fields: FieldDef[]
  printers: PrinterTemplate[]
  buttons?: Array<{ buttonId: string; text: string; component: string }>
  interfaceOptions: IfaceOpt[]
  thirdPartyEndpointOptions: IfaceOpt[]
  connectorInterfaceOptions: IfaceOpt[]
  interfaceSchemas?: Record<string, string>
  thirdPartySchemas?: Record<string, string>
  connectorSchemas?: Record<string, string>
  interfaceParamSchemas?: Record<string, string>
  thirdPartyParamSchemas?: Record<string, string>
  connectorParamSchemas?: Record<string, string>
}) {
  const fieldOptions = fields.map(f => ({ value: f.field, label: f.label || f.field }))

  // 本页已定义的自定义事件名（供「触发事件」动作选择），去重
  const customEventNames = Array.from(new Set(
    events
      .filter(e => e.source?.kind === 'custom_event')
      .map(e => (e.source as any).event_name)
      .filter(Boolean),
  ))

  const addEvent = () => {
    onChange([...events, {
      id: genId('ev'),
      name: `事件 ${events.length + 1}`,
      source: { kind: 'scan', scan_type: 'any' },
      actions: [],
    }])
  }
  const updEvent = (idx: number, patch: Partial<PageEvent>) =>
    onChange(events.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  const removeEvent = (idx: number) =>
    onChange(events.filter((_, i) => i !== idx))
  const copyEvent = (idx: number) => {
    const source = events[idx]
    const copied: PageEvent = {
      ...JSON.parse(JSON.stringify(source)), // 深拷贝
      id: genId('ev'),
      name: `${source.name} (副本)`,
    }
    // 在原事件后面插入
    onChange([...events.slice(0, idx + 1), copied, ...events.slice(idx + 1)])
  }

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        统一描述「事件源 → 条件 → 动作链」。扫码模块的简易配置会自动并入，这里可做更复杂的编排。
      </div>
      <Button size="small" type="dashed" onClick={addEvent} style={{ width: '100%', marginBottom: 10 }}>
        + 添加事件
      </Button>

      {events.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>暂无事件</div>
      )}

      {events.length > 0 && (
        <Collapse style={{ background: '#fff' }}>
          {events.map((ev, idx) => (
            <Collapse.Panel
              key={ev.id}
              header={<span style={{ fontSize: 12, color: '#374151' }}>{ev.name || ev.id}（{sourceLabel(ev.source)}）</span>}
              extra={
                <Space size={8} onClick={e => e.stopPropagation()}>
                  <span onClick={() => copyEvent(idx)}
                    style={{ color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}>复制</span>
                  <span onClick={() => removeEvent(idx)}
                    style={{ color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>删除</span>
                </Space>
              }
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div>
                  <label style={labelStyle}>事件名称</label>
                  <Input size="small" value={ev.name} onChange={e => updEvent(idx, { name: e.target.value })} />
                </div>

                <div>
                  <label style={labelStyle}>
                    事件级别
                    <Tooltip title="页面级：随页面挂载/卸载。应用级：在 form-app 加载后常驻、跨页面存活（存于 global_config，需在应用级配置处保存）。">
                      <span style={{ color: '#94a3b8', marginLeft: 4, cursor: 'help' }}>ⓘ</span>
                    </Tooltip>
                  </label>
                  <Select size="small" style={{ width: '100%' }} value={ev.scope || 'page'}
                    onChange={(sc: 'page' | 'app') => updEvent(idx, { scope: sc })}
                    options={[
                      { value: 'page', label: '页面级（随页面）' },
                      { value: 'app', label: '应用级（跨页面常驻）' },
                    ]} />
                </div>

                <SourceEditor source={ev.source} fields={fields} buttons={buttons} onChange={s => updEvent(idx, { source: s })} />

                <ConditionEditor when={ev.when} onChange={w => updEvent(idx, { when: w })} fields={fields} />

                <ActionsEditor
                  actions={ev.actions || []}
                  onChange={a => updEvent(idx, { actions: a })}
                  fieldOptions={fieldOptions}
                  customEventNames={customEventNames}
                  printers={printers}
                  interfaceOptions={interfaceOptions}
                  thirdPartyEndpointOptions={thirdPartyEndpointOptions}
                  connectorInterfaceOptions={connectorInterfaceOptions}
                  interfaceSchemas={interfaceSchemas}
                  thirdPartySchemas={thirdPartySchemas}
                  connectorSchemas={connectorSchemas}
                  interfaceParamSchemas={interfaceParamSchemas}
                  thirdPartyParamSchemas={thirdPartyParamSchemas}
                  connectorParamSchemas={connectorParamSchemas}
                />
              </Space>
            </Collapse.Panel>
          ))}
        </Collapse>
      )}
    </div>
  )
}

function sourceLabel(s: EventSource): string {
  switch (s.kind) {
    case 'scan': return `扫码:${s.scan_type || 'any'}`
    case 'custom_event': return `事件:${s.event_name || '?'}`
    case 'button': return `按钮:${s.button_id || '?'}`
    case 'field_change': return `字段变更:${s.field || '?'}`
    case 'state_change': return `状态变更:${s.scope === 'app' ? '应用' : '页面'}.${s.field || '?'}`
    case 'page_enter': return '进入页面'
    case 'page_exit': return '退出页面'
    case 'timer': return `定时器:${s.delay}ms${s.interval ? ` / ${s.interval}ms` : ''}`
  }
}

// ── 事件源 ──────────────────────────────────────────────────────────
function SourceEditor({ source, fields, buttons = [], onChange }: {
  source: EventSource
  fields: FieldDef[]
  buttons?: Array<{ buttonId: string; text: string; component: string }>
  onChange: (s: EventSource) => void
}) {
  return (
    <div>
      <label style={labelStyle}>事件源</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select size="small" style={{ width: 130 }}
          value={source.kind}
          onChange={kind => {
            const next: EventSource =
              kind === 'scan' ? { kind: 'scan', scan_type: 'any' }
              : kind === 'custom_event' ? { kind: 'custom_event', event_name: '' }
              : kind === 'button' ? { kind: 'button', button_id: '' }
              : kind === 'state_change' ? { kind: 'state_change', scope: 'app', field: '' }
              : kind === 'page_enter' ? { kind: 'page_enter' }
              : kind === 'page_exit' ? { kind: 'page_exit' }
              : kind === 'timer' ? { kind: 'timer', delay: 1000 }
              : { kind: 'field_change', field: '' }
            onChange(next)
          }}
          options={[
            { value: 'scan', label: '扫码' },
            { value: 'custom_event', label: '自定义事件' },
            { value: 'button', label: '按钮' },
            { value: 'field_change', label: '字段变更' },
            { value: 'state_change', label: '状态变更' },
            { value: 'page_enter', label: '进入页面' },
            { value: 'page_exit', label: '退出页面' },
            { value: 'timer', label: '定时器' },
          ]}
        />
        <div style={{ flex: 1 }}>
          {source.kind === 'scan' && (
            <Select size="small" style={{ width: '100%' }} value={source.scan_type || 'any'}
              onChange={v => onChange({ kind: 'scan', scan_type: v })}
              options={[
                { value: 'any', label: '任意（条码/二维码/NFC）' },
                { value: 'barcode', label: '条码' },
                { value: 'qrcode', label: '二维码' },
                { value: 'nfc', label: 'NFC' },
              ]} />
          )}
          {source.kind === 'custom_event' && (
            <Input size="small" placeholder="事件名（eventManager.emit 的名称）"
              value={source.event_name} onChange={e => onChange({ kind: 'custom_event', event_name: e.target.value })} />
          )}
          {source.kind === 'button' && (
            <AutoComplete
              size="small"
              style={{ width: '100%' }}
              placeholder="选择或输入按钮 ID"
              value={source.button_id}
              onChange={v => onChange({ kind: 'button', button_id: v || '' })}
              options={buttons.map(b => ({
                value: b.buttonId,
                label: `${b.buttonId} - ${b.text} (${b.component})`,
              }))}
              filterOption={(input, option) => {
                const val = option?.value?.toString().toLowerCase() || ''
                const lbl = option?.label?.toString().toLowerCase() || ''
                const inp = input.toLowerCase()
                return val.includes(inp) || lbl.includes(inp)
              }}
            />
          )}
          {source.kind === 'field_change' && (
            <Select size="small" style={{ width: '100%' }} placeholder="选择字段"
              value={source.field || undefined} onChange={v => onChange({ kind: 'field_change', field: v })}
              options={fields.map(f => ({ value: f.field, label: f.label || f.field }))} />
          )}
          {source.kind === 'state_change' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Select size="small" style={{ width: 90 }} value={source.scope}
                onChange={(sc: 'page' | 'app') => onChange({ kind: 'state_change', scope: sc, field: source.field })}
                options={[{ value: 'app', label: '应用级' }, { value: 'page', label: '页面级' }]} />
              {source.scope === 'page' ? (
                <Select size="small" style={{ flex: 1 }} placeholder="选择字段" showSearch
                  value={source.field || undefined} onChange={v => onChange({ kind: 'state_change', scope: 'page', field: v })}
                  options={fields.map(f => ({ value: f.field, label: f.label || f.field }))} />
              ) : (
                <Input size="small" style={{ flex: 1 }} placeholder="状态字段名（$app.字段）"
                  value={source.field} onChange={e => onChange({ kind: 'state_change', scope: 'app', field: e.target.value })} />
              )}
            </div>
          )}
          {source.kind === 'timer' && (
            <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 60 }}>初次延迟</span>
                <Input size="small" type="number" style={{ flex: 1 }} placeholder="毫秒"
                  value={source.delay} onChange={e => onChange({ ...source, delay: Number(e.target.value) || 0 })} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>ms</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 60 }}>重复间隔</span>
                <Input size="small" type="number" style={{ flex: 1 }} placeholder="不填=仅执行一次"
                  value={source.interval || ''} onChange={e => onChange({ ...source, interval: e.target.value ? Number(e.target.value) : undefined })} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>ms</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 60 }}>重复次数</span>
                <Input size="small" type="number" style={{ flex: 1 }} placeholder="不填=无限重复"
                  value={source.repeat || ''} onChange={e => onChange({ ...source, repeat: e.target.value ? Number(e.target.value) : undefined })} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>次</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                首次执行：页面挂载后 {source.delay}ms。
                {source.interval ? ` 之后每 ${source.interval}ms 重复` : ' 之后不再执行。'}
                {source.repeat && source.interval ? ` 最多重复 ${source.repeat} 次。` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 触发条件 ────────────────────────────────────────────────────────
function ConditionEditor({ when, onChange, fields, label = '触发条件' }: {
  when?: ConditionExpr; onChange: (w?: ConditionExpr) => void; fields: FieldDef[]; label?: string
}) {
  const enabled = !!when
  return (
    <div>
      <label style={labelStyle}>
        {label}
        <Button size="small" type="link" style={{ padding: '0 6px', height: 'auto' }}
          onClick={() => onChange(enabled ? undefined : { left_src: '$scan', operator: 'not_empty' })}>
          {enabled ? '移除' : '+ 添加条件'}
        </Button>
      </label>
      {enabled && when && (
        <div style={{ display: 'flex', gap: 6 }}>
          <SrcInput style={{ flex: 2 }} value={when.left_src} fields={fields}
            onChange={v => onChange({ ...when, left_src: v })} />
          <Select size="small" style={{ width: 100 }} value={when.operator}
            onChange={(op: ConditionOperator) => onChange({ ...when, operator: op })}
            options={[
              { value: 'eq', label: '等于' }, { value: 'neq', label: '不等于' },
              { value: 'in', label: '属于' }, { value: 'gt', label: '大于' }, { value: 'lt', label: '小于' },
              { value: 'not_empty', label: '非空' }, { value: 'empty', label: '为空' },
            ]} />
          {when.operator !== 'empty' && when.operator !== 'not_empty' && (
            <Input size="small" style={{ flex: 1 }} placeholder="值（in 用逗号分隔）"
              value={when.value} onChange={e => onChange({ ...when, value: e.target.value })} />
          )}
        </div>
      )}
    </div>
  )
}

// ── 降级保护编辑器（超时/重试/失败策略，可选） ──────────────────────
function DegradeEditor({ action, onChange, actionCount }: {
  action: EventAction; onChange: (patch: any) => void; actionCount: number
}) {
  const a = action as any
  const has = a.timeout != null || a.retry != null || (a.onError && a.onError !== 'abort')
  const retry = a.retry as { maxAttempts: number; backoff: string; initialDelay: number } | undefined
  return (
    <Collapse ghost style={{ marginBottom: 6 }}>
      <Collapse.Panel key="d"
        header={<span style={{ fontSize: 11, color: has ? '#0ea5e9' : '#94a3b8' }}>降级保护{has ? '（已配置）' : '（默认关闭）'}</span>}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b', width: 56 }}>超时(ms)</span>
            <Input size="small" type="number" style={{ flex: 1 }} placeholder="不限"
              value={a.timeout ?? ''} onChange={e => onChange({ timeout: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b', width: 56 }}>重试</span>
            <Input size="small" type="number" style={{ width: 70 }} placeholder="次数"
              value={retry?.maxAttempts ?? ''}
              onChange={e => {
                const n = e.target.value ? Number(e.target.value) : 0
                onChange({ retry: n > 1 ? { maxAttempts: n, backoff: retry?.backoff || 'fixed', initialDelay: retry?.initialDelay ?? 0 } : undefined })
              }} />
            {retry && retry.maxAttempts > 1 && (
              <>
                <Select size="small" style={{ width: 90 }} value={retry.backoff}
                  onChange={(v: string) => onChange({ retry: { ...retry, backoff: v } })}
                  options={[{ value: 'fixed', label: '固定' }, { value: 'linear', label: '线性' }, { value: 'exponential', label: '指数' }]} />
                <Input size="small" type="number" style={{ flex: 1 }} placeholder="间隔ms"
                  value={retry.initialDelay} onChange={e => onChange({ retry: { ...retry, initialDelay: Number(e.target.value) || 0 } })} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b', width: 56 }}>失败时</span>
            <Select size="small" style={{ width: 110 }} value={a.onError || 'abort'}
              onChange={(v: string) => onChange({ onError: v === 'abort' ? undefined : v, fallbackActionIndex: v === 'fallback' ? a.fallbackActionIndex : undefined })}
              options={[
                { value: 'abort', label: '中断后续' },
                { value: 'continue', label: '跳过续跑' },
                { value: 'fallback', label: '转回退动作' },
              ]} />
            {a.onError === 'fallback' && (
              <Input size="small" type="number" style={{ flex: 1 }} placeholder="回退动作序号(从0)"
                value={a.fallbackActionIndex ?? ''} max={actionCount - 1}
                onChange={e => onChange({ fallbackActionIndex: e.target.value ? Number(e.target.value) : undefined })} />
            )}
          </div>
        </Space>
      </Collapse.Panel>
    </Collapse>
  )
}

// ── 值来源输入（带常用前缀提示） ────────────────────────────────────
function SrcInput({ value, onChange, fields, style }: {
  value: string; onChange: (v: string) => void; fields: FieldDef[]; style?: React.CSSProperties
}) {
  return (
    <Tooltip title="$scan=触发值，$form.字段=页面值，$app.字段=应用级状态，$event.x=事件载荷，其他=字面量">
      <AutoComplete
        size="small" style={style}
        value={value}
        onChange={v => onChange(v || '')}
        placeholder="$scan / $form.字段 / $app.字段 / 字面量"
        options={[
          { value: '$scan', label: '$scan（触发值）' },
          { value: '$app.', label: '$app.（应用级状态）' },
          ...fields.map(f => ({ value: `$form.${f.field}`, label: `$form.${f.field}` })),
        ]}
        filterOption={(input, opt) => !!opt?.value?.toString().includes(input)}
      />
    </Tooltip>
  )
}

// ── 动作链 ──────────────────────────────────────────────────────────
function ActionsEditor({
  actions, onChange, fieldOptions, customEventNames = [], printers, interfaceOptions, thirdPartyEndpointOptions, connectorInterfaceOptions,
  interfaceSchemas, thirdPartySchemas, connectorSchemas, interfaceParamSchemas, thirdPartyParamSchemas, connectorParamSchemas,
}: {
  actions: EventAction[]
  onChange: (a: EventAction[]) => void
  fieldOptions: IfaceOpt[]
  customEventNames?: string[]
  printers: PrinterTemplate[]
  interfaceOptions: IfaceOpt[]
  thirdPartyEndpointOptions: IfaceOpt[]
  connectorInterfaceOptions: IfaceOpt[]
  interfaceSchemas: Record<string, string>
  thirdPartySchemas: Record<string, string>
  connectorSchemas: Record<string, string>
  interfaceParamSchemas: Record<string, string>
  thirdPartyParamSchemas: Record<string, string>
  connectorParamSchemas: Record<string, string>
}) {
  const [expandedActions, setExpandedActions] = React.useState<Set<number>>(
    new Set(actions.map((_, i) => i))
  )

  const toggleExpand = (i: number) => {
    const next = new Set(expandedActions)
    if (next.has(i)) {
      next.delete(i)
    } else {
      next.add(i)
    }
    setExpandedActions(next)
  }

  const fields = fieldOptions.map(o => ({ field: o.value, label: o.label } as FieldDef))
  const add = (a: EventAction) => {
    const newIndex = actions.length
    onChange([...actions, a])
    // 自动展开新添加的动作
    setExpandedActions(prev => new Set([...prev, newIndex]))
  }
  const upd = (i: number, patch: any) => onChange(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) as EventAction[])
  const remove = (i: number) => {
    onChange(actions.filter((_, idx) => idx !== i))
    // 移除展开状态
    const next = new Set(expandedActions)
    next.delete(i)
    // 重新索引后面的动作
    const reindexed = new Set<number>()
    next.forEach(idx => {
      if (idx > i) reindexed.add(idx - 1)
      else reindexed.add(idx)
    })
    setExpandedActions(reindexed)
  }
  const copy = (i: number) => {
    const source = actions[i]
    const copied = JSON.parse(JSON.stringify(source)) // 深拷贝
    // 在原动作后面插入
    onChange([...actions.slice(0, i + 1), copied, ...actions.slice(i + 1)])
    // 更新展开状态索引
    const next = new Set<number>()
    expandedActions.forEach(idx => {
      if (idx <= i) next.add(idx)
      else next.add(idx + 1)
    })
    next.add(i + 1) // 新复制的动作自动展开
    setExpandedActions(next)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= actions.length) return
    const n = [...actions]
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
    // 更新展开状态
    const next = new Set(expandedActions)
    const iExpanded = expandedActions.has(i)
    const jExpanded = expandedActions.has(j)
    if (iExpanded) { next.delete(i); next.add(j) }
    if (jExpanded) { next.delete(j); next.add(i) }
    setExpandedActions(next)
  }

  return (
    <div>
      <label style={labelStyle}>动作链（按顺序执行）</label>
      {actions.map((a, i) => {
        const isExpanded = expandedActions.has(i)
        const actionLabel = {
          set_field: '设字段',
          set_field_prop: '设属性',
          call_interface: '调接口',
          print: '打印',
          navigate: '跳页',
          speak: '语音播报',
          emit_event: '触发事件',
          run_script: '运行脚本',
          toast: '提示',
        }[a.type] || a.type

        return (
          <div key={i} style={{ background: '#f8fafc', padding: 8, borderRadius: 6, marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: isExpanded ? 6 : 0 }}>
              <Button
                size="small"
                type="text"
                style={{ padding: '0 4px', color: '#64748b' }}
                onClick={() => toggleExpand(i)}
              >
                {isExpanded ? '▼' : '▶'}
              </Button>
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                {i + 1}. {actionLabel}
              </span>
              <span style={{ flex: 1 }} />
              <Button size="small" type="text" style={{ padding: '0 4px' }} onClick={() => move(i, -1)}>↑</Button>
              <Button size="small" type="text" style={{ padding: '0 4px' }} onClick={() => move(i, 1)}>↓</Button>
              <Button size="small" type="text" style={{ padding: '0 4px', color: '#3b82f6' }} onClick={() => copy(i)}>复制</Button>
              <Button size="small" danger type="text" onClick={() => remove(i)}>×</Button>
            </div>

            {isExpanded && (
              <>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 50 }}>类型</span>
                  <Select size="small" style={{ width: 110 }} value={a.type}
                    onChange={(t) => {
                      const def: Record<string, EventAction> = {
                        set_field: { type: 'set_field', field: '', value_src: '$scan' },
                        call_interface: { type: 'call_interface', interface_type: 'internal', param_map: [], result_map: [] },
                        print: { type: 'print', printer_template_id: '' },
                        navigate: { type: 'navigate', to_page_key: '' },
                  toast: { type: 'toast', message_src: '' },
                  set_field_prop: { type: 'set_field_prop', field: '', prop: 'visible', value_src: '' },
                  speak: { type: 'speak', text_src: '' },
                  emit_event: { type: 'emit_event', event_name: '', data_src: '' },
                  run_script: { type: 'run_script', script: '' },
                }
                upd(i, { ...def[t], when: a.when } as any)
              }}
              options={[
                { value: 'set_field', label: '设字段' },
                { value: 'set_field_prop', label: '设属性' },
                { value: 'call_interface', label: '调接口' },
                { value: 'print', label: '打印' },
                { value: 'navigate', label: '跳页' },
                { value: 'speak', label: '语音播报' },
                { value: 'emit_event', label: '触发事件' },
                { value: 'run_script', label: '运行脚本' },
                { value: 'toast', label: '提示' },
              ]} />
            </div>

          {/* 单动作执行条件：不满足则跳过该动作，继续后续动作 */}
          <div style={{ marginBottom: 6 }}>
            <ConditionEditor
              when={a.when}
              onChange={w => upd(i, { when: w })}
              fields={fields}
              label="仅当（动作条件）"
            />
          </div>

          {/* 降级保护：超时 / 重试 / 失败策略（全部可选，默认行为不变） */}
          <DegradeEditor action={a} onChange={patch => upd(i, patch)} actionCount={actions.length} />

          {a.type === 'set_field' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Select size="small" style={{ width: 76 }} value={a.scope || 'page'}
                onChange={(v: any) => upd(i, { scope: v })}
                options={[{ value: 'page', label: '页面' }, { value: 'app', label: '应用' }]} />
              {a.scope === 'app' ? (
                <Input size="small" style={{ flex: 1 }} placeholder="状态字段名" value={a.field}
                  onChange={e => upd(i, { field: e.target.value })} />
              ) : (
                <Select size="small" style={{ flex: 1 }} placeholder="目标字段" value={a.field || undefined}
                  onChange={v => upd(i, { field: v })} options={fieldOptions} />
              )}
              <span style={{ color: '#94a3b8' }}>←</span>
              <SrcInput style={{ flex: 1 }} value={a.value_src} fields={fields} onChange={v => upd(i, { value_src: v })} />
            </div>
          )}

          {a.type === 'set_field_prop' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Select size="small" style={{ width: 120 }} placeholder="目标字段" value={a.field || undefined}
                onChange={v => upd(i, { field: v })} options={fieldOptions} />
              <Select size="small" style={{ width: 100 }} value={a.prop}
                onChange={(v: any) => upd(i, { prop: v })}
                options={[
                  { value: 'visible', label: '显示隐藏' },
                  { value: 'disabled', label: '禁用' },
                  { value: 'readOnly', label: '只读' },
                  { value: 'background', label: '背景色' },
                  { value: 'color', label: '文字色' },
                  { value: 'title', label: '标题' },
                ]} />
              <span style={{ color: '#94a3b8' }}>←</span>
              <SrcInput style={{ flex: 1, minWidth: 120 }} value={a.value_src} fields={fields} onChange={v => upd(i, { value_src: v })} />
              <div style={{ flexBasis: '100%', fontSize: 11, color: '#94a3b8' }}>
                {a.prop === 'visible' || a.prop === 'disabled' || a.prop === 'readOnly'
                  ? '值为真：true/1/是/yes（可用 $form.字段 动态判断）'
                  : a.prop === 'background' || a.prop === 'color'
                  ? '填颜色值，如 #ff4d4f / red / rgb(255,0,0)'
                  : '填字符串，支持 $scan/$form.字段 占位'}
              </div>
            </div>
          )}

          {a.type === 'call_interface' && (
            <CallInterfaceEditor action={a} onChange={patch => upd(i, patch)} fields={fields}
              fieldOptions={fieldOptions} interfaceOptions={interfaceOptions}
              thirdPartyEndpointOptions={thirdPartyEndpointOptions} connectorInterfaceOptions={connectorInterfaceOptions}
              interfaceSchemas={interfaceSchemas} thirdPartySchemas={thirdPartySchemas} connectorSchemas={connectorSchemas}
              interfaceParamSchemas={interfaceParamSchemas} thirdPartyParamSchemas={thirdPartyParamSchemas} connectorParamSchemas={connectorParamSchemas} />
          )}

          {a.type === 'print' && (
            <Select size="small" style={{ width: '100%' }} placeholder="选择打印模板" value={a.printer_template_id || undefined}
              onChange={v => upd(i, { printer_template_id: v })}
              options={printers.map(p => ({ value: p.id, label: `${p.name}（${p.protocol}）` }))} />
          )}

          {a.type === 'navigate' && (
            <Input size="small" placeholder="目标页面 key" value={a.to_page_key} onChange={e => upd(i, { to_page_key: e.target.value })} />
          )}

          {a.type === 'toast' && (
            <SrcInput value={a.message_src} fields={fields} onChange={v => upd(i, { message_src: v })} style={{ width: '100%' }} />
          )}

          {a.type === 'speak' && (
            <div>
              <SrcInput value={a.text_src} fields={fields} onChange={v => upd(i, { text_src: v })} style={{ width: '100%' }} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                播报文本，支持 $scan/$form.字段/字面量。如「{'{{'}…{'}}'}」需直接拼字段值，可用 $form.字段。Agent 内走原生 TTS，浏览器降级 Web 语音。
              </div>
            </div>
          )}

          {a.type === 'emit_event' && (
            <div>
              <div style={{ display: 'flex', gap: 6 }}>
                <AutoComplete
                  size="small" style={{ flex: 1 }}
                  placeholder="自定义事件名"
                  value={a.event_name}
                  onChange={v => upd(i, { event_name: v || '' })}
                  options={customEventNames.map(n => ({ value: n, label: n }))}
                  filterOption={(input, opt) => !!opt?.value?.toString().includes(input)}
                />
                <span style={{ color: '#94a3b8' }}>数据</span>
                <SrcInput style={{ flex: 1 }} value={a.data_src || ''} fields={fields} onChange={v => upd(i, { data_src: v })} />
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                触发以该名为「自定义事件」源的其他事件流。数据可留空，或用 $scan/$form.字段 传递载荷（监听端用 $event.字段 取值）。
              </div>
            </div>
          )}

          {a.type === 'run_script' && (
            <div>
              <ScriptEditor value={a.script} onChange={v => upd(i, { script: v })} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                脚本内用 <code>ctx</code> 访问运行时：ctx.get/set/setProp、ctx.appGet/appSet（应用级状态）、ctx.callInterface(await)、ctx.print、ctx.navigate、ctx.toast、ctx.speak、ctx.emit、ctx.scan/event/values。输入 <code>ctx.</code> 触发补全。
              </div>
            </div>
          )}
              </>
            )}
        </div>
        )
      })}
      <Space wrap size={4}>
        <Button size="small" onClick={() => add({ type: 'set_field', field: '', value_src: '$scan' })}>+设字段</Button>
        <Button size="small" onClick={() => add({ type: 'set_field_prop', field: '', prop: 'visible', value_src: '' })}>+设属性</Button>
        <Button size="small" onClick={() => add({ type: 'call_interface', interface_type: 'internal', param_map: [], result_map: [] })}>+调接口</Button>
        <Button size="small" onClick={() => add({ type: 'print', printer_template_id: '' })}>+打印</Button>
        <Button size="small" onClick={() => add({ type: 'navigate', to_page_key: '' })}>+跳页</Button>
        <Button size="small" onClick={() => add({ type: 'speak', text_src: '' })}>+语音播报</Button>
        <Button size="small" onClick={() => add({ type: 'emit_event', event_name: '', data_src: '' })}>+触发事件</Button>
        <Button size="small" onClick={() => add({ type: 'run_script', script: '' })}>+运行脚本</Button>
        <Button size="small" onClick={() => add({ type: 'toast', message_src: '' })}>+提示</Button>
      </Space>
    </div>
  )
}

// ── 调接口动作 ──────────────────────────────────────────────────────
function CallInterfaceEditor({
  action, onChange, fields, fieldOptions, interfaceOptions, thirdPartyEndpointOptions, connectorInterfaceOptions,
  interfaceSchemas, thirdPartySchemas, connectorSchemas, interfaceParamSchemas, thirdPartyParamSchemas, connectorParamSchemas,
}: {
  action: Extract<EventAction, { type: 'call_interface' }>
  onChange: (patch: any) => void
  fields: FieldDef[]
  fieldOptions: IfaceOpt[]
  interfaceOptions: IfaceOpt[]
  thirdPartyEndpointOptions: IfaceOpt[]
  connectorInterfaceOptions: IfaceOpt[]
  interfaceSchemas: Record<string, string>
  thirdPartySchemas: Record<string, string>
  connectorSchemas: Record<string, string>
  interfaceParamSchemas: Record<string, string>
  thirdPartyParamSchemas: Record<string, string>
  connectorParamSchemas: Record<string, string>
}) {
  const type: InterfaceType = action.interface_type || 'internal'
  const paramMap = action.param_map || []
  const resultMap = action.result_map || []

  // 当前选中接口的输出 schema
  const currentSchemaJson =
    type === 'connector' ? connectorSchemas[action.connector_interface_code || '']
    : type === 'third_party' ? thirdPartySchemas[String(action.third_party_endpoint_id || '')]
    : interfaceSchemas[action.interface_code || '']
  const { paths: schemaPaths, demo: schemaDemo } = parseSchema(currentSchemaJson)

  // 当前选中接口的输入参数 schema
  const currentParamSchemaJson =
    type === 'connector' ? connectorParamSchemas[action.connector_interface_code || '']
    : type === 'third_party' ? thirdPartyParamSchemas[String(action.third_party_endpoint_id || '')]
    : interfaceParamSchemas[action.interface_code || '']
  const paramNames = extractParamNames(currentParamSchemaJson)

  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Select size="small" style={{ width: '100%' }} value={type}
        onChange={(v: InterfaceType) => onChange({ interface_type: v, interface_code: undefined, third_party_endpoint_id: undefined, connector_interface_code: undefined })}
        options={[
          { value: 'internal', label: '内部数据接口' },
          { value: 'third_party', label: '第三方应用接口' },
          { value: 'connector', label: '连接器接口' },
        ]} />

      {type === 'connector' ? (
        <Select size="small" style={{ width: '100%' }} showSearch placeholder="连接器接口"
          value={action.connector_interface_code} onChange={v => onChange({ connector_interface_code: v })}
          options={connectorInterfaceOptions} filterOption={filterOpt} />
      ) : type === 'third_party' ? (
        <Select size="small" style={{ width: '100%' }} showSearch placeholder="第三方接口端点"
          value={action.third_party_endpoint_id ? String(action.third_party_endpoint_id) : undefined}
          onChange={v => onChange({ third_party_endpoint_id: v ? Number(v) : undefined })}
          options={thirdPartyEndpointOptions} filterOption={filterOpt} />
      ) : (
        <Select size="small" style={{ width: '100%' }} showSearch placeholder="数据接口 code"
          value={action.interface_code} onChange={v => onChange({ interface_code: v })}
          options={interfaceOptions} filterOption={filterOpt} />
      )}

      {/* 入参映射 */}
      <MapEditor
        label="入参映射" leftPlaceholder="参数名" rightIsSrc rows={paramMap.map(p => ({ left: p.key, right: p.src }))}
        fields={fields}
        leftOptions={paramNames.map(p => ({ value: p, label: p }))}
        onChange={rows => onChange({ param_map: rows.map(r => ({ key: r.left, src: r.right })) })}
      />

      {/* 结果回填 */}
      <MapEditor
        label="结果回填" leftPlaceholder="返回字段(点路径)" rightField
        rows={resultMap.map(r => ({ left: r.response_field, right: r.form_field }))}
        fields={fields}
        leftOptions={schemaPaths.map(p => ({ value: p, label: p }))}
        rightOptions={fieldOptions}
        onChange={rows => onChange({ result_map: rows.map(r => ({ response_field: r.left, form_field: r.right })) })}
      />

      {/* 返回结构 demo */}
      {schemaDemo && (
        <div style={{ background: '#f1f5f9', borderRadius: 4, padding: '6px 8px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>返回结构示例</div>
          <pre style={{ margin: 0, fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {schemaDemo}
          </pre>
        </div>
      )}
    </Space>
  )
}

function filterOpt(input: string, opt: any): boolean {
  return !!opt?.value?.toString().includes(input) || !!opt?.label?.toString().includes(input)
}

// 通用键值映射编辑器
function MapEditor({
  label, leftPlaceholder, rightIsSrc, rightField, fieldOptions, rows, fields, onChange, leftOptions, rightOptions,
}: {
  label: string
  leftPlaceholder: string
  rightIsSrc?: boolean
  rightField?: boolean
  fieldOptions?: IfaceOpt[]
  rows: Array<{ left: string; right: string }>
  fields: FieldDef[]
  onChange: (rows: Array<{ left: string; right: string }>) => void
  leftOptions?: IfaceOpt[]
  rightOptions?: IfaceOpt[] // 右侧也支持选择器
}) {
  const add = () => onChange([...rows, { left: '', right: '' }])
  const upd = (i: number, patch: Partial<{ left: string; right: string }>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
        <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={add}>+ 添加</Button>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
          {/* 左侧：支持选择或输入 */}
          {leftOptions ? (
            <AutoComplete
              size="small" style={{ flex: 1 }}
              placeholder={leftPlaceholder}
              value={r.left}
              onChange={v => upd(i, { left: v || '' })}
              options={leftOptions}
              filterOption={(input, opt) => !!opt?.value?.toString().includes(input)}
            />
          ) : (
            <Input size="small" style={{ flex: 1 }} placeholder={leftPlaceholder} value={r.left} onChange={e => upd(i, { left: e.target.value })} />
          )}
          <span style={{ color: '#94a3b8' }}>{rightField ? '→' : '←'}</span>
          {/* 右侧：支持选择或输入 */}
          {rightIsSrc ? (
            <SrcInput style={{ flex: 1 }} value={r.right} fields={fields} onChange={v => upd(i, { right: v })} />
          ) : rightField ? (
            rightOptions ? (
              <AutoComplete
                size="small" style={{ flex: 1 }}
                placeholder="填入字段"
                value={r.right}
                onChange={v => upd(i, { right: v || '' })}
                options={rightOptions}
                filterOption={(input, opt) => !!opt?.value?.toString().includes(input)}
              />
            ) : (
              <Select size="small" style={{ flex: 1 }} placeholder="填入字段" value={r.right || undefined}
                onChange={v => upd(i, { right: v })} options={fieldOptions} allowClear />
            )
          ) : (
            <Input size="small" style={{ flex: 1 }} value={r.right} onChange={e => upd(i, { right: e.target.value })} />
          )}
          <Button size="small" danger type="text" onClick={() => remove(i)}>×</Button>
        </div>
      ))}
    </div>
  )
}
