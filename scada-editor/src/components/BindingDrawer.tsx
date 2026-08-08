import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { PointBinding, DataBindingMode, InterfaceFieldMapping, InterfaceSourceType, InterfaceParamSourceType, ValueFormatter, ElementType, ParamSpec, CanvasElement, ChartKeySource } from '@/types'
import { getChartSchema, type BindingFieldDef } from '@/schema/chartSchema'
import { dataBindingApi, type DataInterfaceItem, type OutboundAppItem, type OutboundWebhookItem, type OutboundEndpointItem, type ScadaSimPointItem } from '@/api/dataBinding'
import type { PointDataMap } from '@/hooks/useStompPointData'
import SimPointsModal from './SimPointsModal'
import ExpressionInput, { type ExprScopeInfo } from './ExpressionInput'
import GlobalParamsModal from './GlobalParamsModal'

interface Props {
  elementId: string
  scadaCode?: string
  pointData?: PointDataMap
  onClose: () => void
}

// ── Shared primitives ──────────────────────────────────────────────────────────

/**
 * 阻止抽屉内的键盘事件冒泡到 window 级画布快捷键处理器
 * （useKeyboardShortcuts）。否则在参数输入框 / 表达式编辑器里
 * 按退格、复制粘贴、方向键等会被画布拦截（删除元件、切换工具…），
 * 导致输入框内无法正常编辑。仅拦截冒泡，不 preventDefault，
 * 输入框 / CodeMirror 自身的原生按键行为完全保留。
 */
const stopKeyboardBubble = (e: React.KeyboardEvent) => { e.stopPropagation() }

const Inp = ({ val, onChange, placeholder = '', type = 'text' }: {
  val: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) => (
  <input
    value={val}
    type={type}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%', height: 28, background: 'var(--bg-base)',
      border: '1px solid var(--border)', color: 'var(--text-primary)',
      padding: '0 8px', borderRadius: 'var(--radius-sm)', fontSize: 12,
      outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
    }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
  />
)

const Sel = ({ val, onChange, children }: {
  val: string; onChange: (v: string) => void; children: React.ReactNode
}) => (
  <select
    value={val}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%', height: 28, background: 'var(--bg-base)',
      border: '1px solid var(--border)', color: 'var(--text-primary)',
      padding: '0 6px', borderRadius: 'var(--radius-sm)', fontSize: 12,
      outline: 'none', cursor: 'pointer',
    }}
  >
    {children}
  </select>
)

// 组合输入：既可从建议项下拉选择，也可自由录入
let comboSeq = 0
const Combo = ({ val, onChange, options, placeholder = '', type = 'text', onBlur }: {
  val: string; onChange: (v: string) => void; options: string[]; placeholder?: string; type?: string; onBlur?: () => void
}) => {
  const listId = useRef(`combo-${++comboSeq}`).current
  const uniq = Array.from(new Set(options.filter((o) => o !== '')))
  return (
    <>
      <input
        value={val}
        type={type}
        list={uniq.length > 0 ? listId : undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', height: 28, background: 'var(--bg-base)',
          border: '1px solid var(--border)', color: 'var(--text-primary)',
          padding: '0 8px', borderRadius: 'var(--radius-sm)', fontSize: 12,
          outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; onBlur?.() }}
      />
      {uniq.length > 0 && (
        <datalist id={listId}>
          {uniq.map((o, i) => <option key={i} value={o} />)}
        </datalist>
      )}
    </>
  )
}

// 自由参数名输入：本地暂存，失焦时再提交重命名，避免每次按键都改动对象 key 造成整行重挂载而丢失焦点
const FreeParamNameInput = ({ name, options, onCommit }: {
  name: string; options: string[]; onCommit: (newName: string) => void
}) => {
  const [local, setLocal] = useState(name)
  useEffect(() => { setLocal(name) }, [name])
  return (
    <Combo
      val={local}
      onChange={setLocal}
      onBlur={() => { if (local !== name) onCommit(local) }}
      options={options}
      placeholder="选择或录入参数名"
    />
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{children}</div>
)

const Field = ({ label, optional, children }: {
  label: string; optional?: boolean; children: React.ReactNode
}) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <Label>{label}</Label>
      {optional && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-overlay)',
          padding: '1px 4px', borderRadius: 2, border: '1px solid var(--border)' }}>可选</span>
      )}
    </div>
    {children}
  </div>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '5px 8px', marginTop: 4,
    fontFamily: 'var(--font-mono)',
  }}>
    {children}
  </div>
)

// ── JSON Tree viewer with path selector ───────────────────────────────────────

function JsonTree({ data, onSelectPath }: { data: unknown; onSelectPath: (path: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderValue = (val: unknown, path: string, key: string, depth: number): React.ReactNode => {
    const indent = depth * 16

    if (val === null || val === undefined) {
      return (
        <div key={path} style={{ paddingLeft: indent, display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{key}:</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' }}>{String(val)}</span>
          <button
            onClick={() => onSelectPath(path)}
            style={{
              fontSize: 9, padding: '1px 6px', cursor: 'pointer',
              background: 'var(--accent-muted)', color: 'var(--accent)',
              border: '1px solid var(--border-accent)', borderRadius: 3,
            }}
          >映射</button>
        </div>
      )
    }

    if (typeof val !== 'object') {
      return (
        <div key={path} style={{ paddingLeft: indent, display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{key}:</span>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: typeof val === 'number' ? '#4ade80' : typeof val === 'boolean' ? '#a78bfa' : 'var(--text-primary)',
          }}>
            {typeof val === 'string' ? `"${val}"` : String(val)}
          </span>
          <button
            onClick={() => onSelectPath(path)}
            style={{
              fontSize: 9, padding: '1px 6px', cursor: 'pointer',
              background: 'var(--accent-muted)', color: 'var(--accent)',
              border: '1px solid var(--border-accent)', borderRadius: 3,
            }}
          >映射</button>
        </div>
      )
    }

    const isArray = Array.isArray(val)
    const isExpanded = expanded.has(path)
    const entries = isArray ? val.map((v, i) => [String(i), v] as const) : Object.entries(val as Record<string, unknown>)

    return (
      <div key={path}>
        <div
          style={{
            paddingLeft: indent, display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 0', cursor: 'pointer',
          }}
          onClick={() => toggleExpand(path)}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.5}
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{key}:</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {isArray ? `Array(${entries.length})` : `Object {${entries.length}}`}
          </span>
        </div>
        {isExpanded && (
          <div>
            {entries.map(([k, v]) => {
              const childPath = path ? `${path}.${k}` : k
              return renderValue(v, childPath, k, depth + 1)
            })}
          </div>
        )}
      </div>
    )
  }

  return <div>{renderValue(data, '', 'response', 0)}</div>
}

// ── Mode tab bar ───────────────────────────────────────────────────────────────

const MODES: { id: DataBindingMode; label: string }[] = [
  { id: 'point', label: '点位数据' },
  { id: 'static', label: '静态数据' },
  { id: 'simulation', label: '模拟数据' },
  { id: 'interface', label: '接口数据' },
  { id: 'trend', label: '趋势图' },
]

const TREND_TYPES = new Set(['echarts-trend', 'echarts-line'])

function ModeTabs({ mode, onChange, elType }: { mode: DataBindingMode; onChange: (m: DataBindingMode) => void; elType: ElementType }) {
  const visibleModes = MODES.filter((m) => m.id !== 'trend' || TREND_TYPES.has(elType))
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '0 20px 12px',
      borderBottom: '1px solid var(--border)',
    }}>
      {visibleModes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          style={{
            padding: '4px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            border: mode === m.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: mode === m.id ? 'var(--accent-muted)' : 'var(--bg-surface)',
            color: mode === m.id ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: mode === m.id ? 600 : 400,
          }}
        >{m.label}</button>
      ))}
    </div>
  )
}

// ── Chart binding fields (point mode) ─────────────────────────────────────────

type ChartKeySourceType = 'key' | 'component' | 'global'

interface ChartBindingState {
  seriesInputs: string[]
  categoryInput: string
  // 与 seriesInputs 平行：每个系列的数据来源；分类单独存
  seriesSources: ChartKeySourceType[]
  categorySource: ChartKeySourceType
  // 与 seriesInputs 平行：每个系列的名称（动态系列图表用；空串=用默认「系列N」）
  seriesNames: string[]
  // 与 seriesInputs 平行：每个系列的颜色（空串=按样式面板 seriesColors 回退）
  seriesColors: string[]
}

function initChartState(pb: PointBinding, fieldCount: number, dynamic = false): ChartBindingState {
  const seriesInputs: string[] = []
  const seriesSources: ChartKeySourceType[] = []
  const seriesNames: string[] = []
  const seriesColors: string[] = []
  // 动态系列：以已保存的系列数为准（最少 1 个）；固定系列：以 schema 字段数为准
  const count = dynamic
    ? Math.max(1, pb.chartSeriesKeys?.length ?? pb.chartSeriesSources?.length ?? 0)
    : fieldCount
  for (let i = 0; i < count; i++) {
    const src = pb.chartSeriesSources?.[i]
    if (src && src.type !== 'key') {
      seriesInputs.push(src.ref ?? '')
      seriesSources.push(src.type)
    } else {
      seriesInputs.push((pb.chartSeriesKeys?.[i] ?? []).join(', '))
      seriesSources.push('key')
    }
    seriesNames.push(pb.chartSeriesNames?.[i] ?? '')
    seriesColors.push(pb.chartSeriesColors?.[i] ?? '')
  }
  const catSrc = pb.chartCategorySource
  const categoryFromSrc = catSrc && catSrc.type !== 'key'
  return {
    seriesInputs,
    seriesSources,
    seriesNames,
    seriesColors,
    categoryInput: categoryFromSrc ? (catSrc!.ref ?? '') : (pb.chartCategoryKey ?? ''),
    categorySource: categoryFromSrc ? catSrc!.type : 'key',
  }
}

const SOURCE_OPTIONS: { id: ChartKeySourceType; label: string }[] = [
  { id: 'key', label: '数据键' },
  { id: 'component', label: '组件属性' },
  { id: 'global', label: '全局上下文' },
]

function sourcePlaceholder(type: ChartKeySourceType, fallback?: string): string {
  if (type === 'component') return '组件名.ext.flow 或 .value / .params.max'
  if (type === 'global') return 'line1.temp 或任意点分路径'
  return fallback ?? ''
}

function sourceHint(type: ChartKeySourceType): string | undefined {
  if (type === 'component') return '从其他组件快照取值：<组件名或id>.ext.键 / .value / .params.键 / .chart.键；数组作为整段系列'
  if (type === 'global') return '从全局上下文取值（点分路径）；数组作为整段系列'
  return undefined
}

function SourceSelect({ value, onChange }: { value: ChartKeySourceType; onChange: (v: ChartKeySourceType) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChartKeySourceType)}
      style={{
        fontSize: 11, padding: '2px 4px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', background: 'var(--bg-surface)',
        color: 'var(--text-secondary)', marginBottom: 4, width: '100%',
      }}
    >
      {SOURCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{`来源：${o.label}`}</option>)}
    </select>
  )
}

// 系列颜色输入：色块选择器 + 清除按钮（空串=按样式面板 seriesColors 回退）
function SeriesColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hasColor = !!value.trim()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="color"
        value={hasColor ? value : '#4a9eff'}
        onChange={(e) => onChange(e.target.value)}
        title={hasColor ? value : '未设置（回退样式面板颜色）'}
        style={{
          width: 28, height: 24, padding: 0, cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-base)', opacity: hasColor ? 1 : 0.45,
        }}
      />
      {hasColor && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="清除（回退样式面板颜色）"
          style={{
            fontSize: 11, lineHeight: 1, padding: '3px 5px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >×</button>
      )}
    </div>
  )
}

function ChartBindingFields({ fields, state, onChange, componentNames, dynamic }: {
  fields: BindingFieldDef[]; state: ChartBindingState; onChange: (s: ChartBindingState) => void
  componentNames: string[]
  /** 动态系列：系列可增删、名称就地配置（横向柱等） */
  dynamic?: boolean
}) {
  const categoryField = fields.find((f) => f.kind === 'category')
  const seriesFields = fields.filter((f) => f.kind !== 'category')
  const seriesTemplate = seriesFields[0]

  const renderCategory = () => {
    if (!categoryField) return null
    const type = state.categorySource
    return (
      <Field key={categoryField.key} label={categoryField.label} optional={categoryField.optional}>
        <SourceSelect value={type} onChange={(v) => onChange({ ...state, categorySource: v })} />
        {type === 'component' && (
          <ComponentRefHelper names={componentNames} onPick={(nm) => onChange({ ...state, categoryInput: `${nm}.ext.` })} />
        )}
        <Inp val={state.categoryInput} onChange={(v) => onChange({ ...state, categoryInput: v })} placeholder={sourcePlaceholder(type, categoryField.placeholder)} />
        {(sourceHint(type) ?? categoryField.hint) && <Hint>{sourceHint(type) ?? categoryField.hint}</Hint>}
      </Field>
    )
  }

  // ── 动态系列：增删 + 名称就地配置 ──
  if (dynamic && seriesTemplate) {
    const count = state.seriesInputs.length
    const setSeriesAt = (idx: number, patch: { input?: string; source?: ChartKeySourceType; name?: string; color?: string }) => {
      const inputs = [...state.seriesInputs]
      const sources = [...state.seriesSources]
      const names = [...state.seriesNames]
      const cols = [...state.seriesColors]
      if (patch.input !== undefined) inputs[idx] = patch.input
      if (patch.source !== undefined) sources[idx] = patch.source
      if (patch.name !== undefined) names[idx] = patch.name
      if (patch.color !== undefined) cols[idx] = patch.color
      onChange({ ...state, seriesInputs: inputs, seriesSources: sources, seriesNames: names, seriesColors: cols })
    }
    const addSeries = () => onChange({
      ...state,
      seriesInputs: [...state.seriesInputs, ''],
      seriesSources: [...state.seriesSources, 'key'],
      seriesNames: [...state.seriesNames, ''],
      seriesColors: [...state.seriesColors, ''],
    })
    const removeSeries = (idx: number) => {
      if (count <= 1) return // 最少保留 1 个系列
      onChange({
        ...state,
        seriesInputs: state.seriesInputs.filter((_, i) => i !== idx),
        seriesSources: state.seriesSources.filter((_, i) => i !== idx),
        seriesNames: state.seriesNames.filter((_, i) => i !== idx),
        seriesColors: state.seriesColors.filter((_, i) => i !== idx),
      })
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: count }).map((_, idx) => {
          const type = state.seriesSources[idx] ?? 'key'
          return (
            <div key={idx} style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '8px 10px', marginBottom: 8, position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>系列 {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeSeries(idx)}
                  disabled={count <= 1}
                  title={count <= 1 ? '至少保留一个系列' : '删除该系列'}
                  style={{
                    fontSize: 11, lineHeight: 1, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', cursor: count <= 1 ? 'not-allowed' : 'pointer',
                    background: 'var(--bg-surface)', color: count <= 1 ? 'var(--text-muted)' : 'var(--danger)',
                    opacity: count <= 1 ? 0.5 : 1,
                  }}
                >删除</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>系列名称</div>
                  <Inp
                    val={state.seriesNames[idx] ?? ''}
                    onChange={(v) => setSeriesAt(idx, { name: v })}
                    placeholder={`系列${idx + 1}（图例/提示显示）`}
                  />
                </div>
                <div style={{ width: 92 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>颜色</div>
                  <SeriesColorInput
                    value={state.seriesColors[idx] ?? ''}
                    onChange={(v) => setSeriesAt(idx, { color: v })}
                  />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 2px' }}>数据</div>
              <SourceSelect value={type} onChange={(v) => setSeriesAt(idx, { source: v })} />
              {type === 'component' && (
                <ComponentRefHelper names={componentNames} onPick={(nm) => setSeriesAt(idx, { input: `${nm}.ext.` })} />
              )}
              <Inp
                val={state.seriesInputs[idx] ?? ''}
                onChange={(v) => setSeriesAt(idx, { input: v })}
                placeholder={sourcePlaceholder(type, seriesTemplate.placeholder)}
              />
              {(sourceHint(type) ?? seriesTemplate.hint) && <Hint>{sourceHint(type) ?? seriesTemplate.hint}</Hint>}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addSeries}
          style={{
            alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', marginBottom: 8,
            borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-accent)',
            background: 'var(--accent-muted)', color: 'var(--accent)', cursor: 'pointer',
          }}
        >+ 添加系列</button>
        {renderCategory()}
      </div>
    )
  }

  // ── 固定系列（原逻辑）──
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {fields.map((f) => {
        if (f.kind === 'category') return renderCategory()
        const idx = f.seriesIndex ?? 0
        const type = state.seriesSources[idx] ?? 'key'
        return (
          <Field key={f.key} label={f.label} optional={f.optional}>
            <SourceSelect value={type} onChange={(v) => {
              const next = [...state.seriesSources]
              next[idx] = v
              onChange({ ...state, seriesSources: next })
            }} />
            {type === 'component' && (
              <ComponentRefHelper names={componentNames} onPick={(nm) => {
                const next = [...state.seriesInputs]
                next[idx] = `${nm}.ext.`
                onChange({ ...state, seriesInputs: next })
              }} />
            )}
            <Inp
              val={state.seriesInputs[idx] ?? ''}
              onChange={(v) => {
                const next = [...state.seriesInputs]
                next[idx] = v
                onChange({ ...state, seriesInputs: next })
              }}
              placeholder={sourcePlaceholder(type, f.placeholder)}
            />
            {(sourceHint(type) ?? f.hint) && <Hint>{sourceHint(type) ?? f.hint}</Hint>}
          </Field>
        )
      })}
    </div>
  )
}

function ComponentRefHelper({ names, onPick }: { names: string[]; onPick: (name: string) => void }) {
  if (names.length === 0) return null
  return (
    <select
      value=""
      onChange={(e) => { if (e.target.value) onPick(e.target.value) }}
      style={{
        fontSize: 11, padding: '2px 4px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', background: 'var(--bg-surface)',
        color: 'var(--text-secondary)', marginBottom: 4, width: '100%',
      }}
    >
      <option value="">选择组件填入引用…</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

// ── Formatter panel ───────────────────────────────────────────────────────────

function FormatterPanel({ fmt, onChange }: {
  fmt: ValueFormatter | undefined
  onChange: (f: ValueFormatter | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const f = fmt ?? {}
  const set = (k: keyof ValueFormatter, v: unknown) => onChange({ ...f, [k]: v })
  const hasAny = fmt && (
    fmt.precision !== undefined ||
    fmt.unit || fmt.prefix || fmt.template ||
    (fmt.strReplace && fmt.strReplace.length > 0) ||
    (fmt.rangeMap && fmt.rangeMap.length > 0)
  )

  const addStrReplace = () => onChange({ ...f, strReplace: [...(f.strReplace ?? []), { from: '', to: '' }] })
  const setStrReplace = (i: number, k: 'from' | 'to', v: string) => {
    const arr = [...(f.strReplace ?? [])]
    arr[i] = { ...arr[i], [k]: v }
    onChange({ ...f, strReplace: arr })
  }
  const removeStrReplace = (i: number) => onChange({ ...f, strReplace: (f.strReplace ?? []).filter((_, idx) => idx !== i) })

  const addRange = () => onChange({ ...f, rangeMap: [...(f.rangeMap ?? []), { min: 0, max: 100, label: '', color: '' }] })
  const setRange = (i: number, k: keyof NonNullable<ValueFormatter['rangeMap']>[0], v: unknown) => {
    const arr = [...(f.rangeMap ?? [])]
    arr[i] = { ...arr[i], [k]: v }
    onChange({ ...f, rangeMap: arr })
  }
  const removeRange = (i: number) => onChange({ ...f, rangeMap: (f.rangeMap ?? []).filter((_, idx) => idx !== i) })

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: hasAny ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 600 }}>渲染格式化</span>
        {hasAny && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: 'var(--accent-muted)', color: 'var(--accent)',
            border: '1px solid var(--border-accent)',
          }}>已配置</span>
        )}
        {hasAny && (
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onChange(undefined) }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 10 }}
            title="清除格式化"
          >清除</button>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* 数字精度 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>小数位数</span>
              <input
                type="number" min={-1} max={10}
                value={f.precision ?? ''}
                placeholder="不限"
                onChange={e => set('precision', e.target.value === '' ? undefined : Number(e.target.value))}
                style={{ height: 26, padding: '0 6px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>前缀</span>
              <input
                value={f.prefix ?? ''}
                placeholder="约"
                onChange={e => set('prefix', e.target.value || undefined)}
                style={{ height: 26, padding: '0 6px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>单位后缀</span>
              <input
                value={f.unit ?? ''}
                placeholder="℃ / % / kPa"
                onChange={e => set('unit', e.target.value || undefined)}
                style={{ height: 26, padding: '0 6px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </label>
          </div>

          {/* 模板 */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>模板 <code style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>${'{v}'}</code> 为占位符</span>
            <input
              value={f.template ?? ''}
              placeholder="${v} ℃ (正常)"
              onChange={e => set('template', e.target.value || undefined)}
              style={{ height: 26, padding: '0 6px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
            />
          </label>

          {/* 字符串替换 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>字符替换</span>
              <button type="button" onClick={addStrReplace} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0 }}>+ 添加</button>
            </div>
            {(f.strReplace ?? []).map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <input value={r.from} placeholder="原文" onChange={e => setStrReplace(i, 'from', e.target.value)}
                  style={{ height: 24, padding: '0 5px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 2px' }}>→</span>
                <input value={r.to} placeholder="替换为" onChange={e => setStrReplace(i, 'to', e.target.value)}
                  style={{ height: 24, padding: '0 5px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }} />
                <button type="button" onClick={() => removeStrReplace(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>

          {/* 阈值映射 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>阈值文字映射</span>
              <button type="button" onClick={addRange} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0 }}>+ 添加</button>
            </div>
            {(f.rangeMap ?? []).map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr 36px auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <input type="number" value={r.min} placeholder="最小" onChange={e => setRange(i, 'min', Number(e.target.value))}
                  style={{ height: 24, padding: '0 5px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }} />
                <input type="number" value={r.max} placeholder="最大" onChange={e => setRange(i, 'max', Number(e.target.value))}
                  style={{ height: 24, padding: '0 5px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }} />
                <input value={r.label} placeholder="显示文字" onChange={e => setRange(i, 'label', e.target.value)}
                  style={{ height: 24, padding: '0 5px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }} />
                <input type="color" value={r.color || '#4a9eff'} onChange={e => setRange(i, 'color', e.target.value)}
                  style={{ height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none', width: '100%' }}
                  title="可选：显示颜色" />
                <button type="button" onClick={() => removeRange(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
            {(f.rangeMap ?? []).length > 0 && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                数值落在 [最小, 最大] 范围时显示对应文字，优先级高于精度/模板
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Point mode panel ───────────────────────────────────────────────────────────

function PointModePanel({ draft, setDraft, isChart, schema, chartState, setChartState, componentNames }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
  isChart: boolean
  schema: ReturnType<typeof getChartSchema>
  chartState: ChartBindingState
  setChartState: (s: ChartBindingState) => void
  componentNames: string[]
}) {
  const update = (patch: Partial<PointBinding>) => setDraft((prev) => ({ ...prev, ...patch }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isChart && schema ? '1fr 1fr' : '1fr', gap: '0 32px' }}>
        <div>
          {!isChart && (
            <Field label="点位键 (pointKey)">
              <Inp val={draft.pointKey ?? ''} onChange={(v) => update({ pointKey: v })} placeholder="device.tag" />
              <Hint>对应实时数据 Map 中的 key，如 temp_01</Hint>
            </Field>
          )}
          <Field label="转换表达式 (transform)">
            <Inp val={draft.transform ?? ''} onChange={(v) => update({ transform: v || undefined })} placeholder="v * 0.01" />
            <Hint>{'变量 v 为原始值，如：v * 0.01  |  Math.round(v)  |  v > 0 ? 1 : 0'}</Hint>
          </Field>
          <Field label="设备编码 (deviceCode)">
            <Inp val={draft.deviceCode ?? ''} onChange={(v) => update({ deviceCode: v })} placeholder="device_001" />
          </Field>
          <Field label="链路名 (linkName)" optional>
            <Inp val={draft.linkName ?? ''} onChange={(v) => update({ linkName: v || undefined })} placeholder="可选" />
          </Field>
        </div>
        {isChart && schema && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              {schema.label} 数据绑定
            </div>
            <ChartBindingFields fields={schema.bindingFields} state={chartState} onChange={setChartState} componentNames={componentNames} dynamic={schema.seriesDynamic} />
          </div>
        )}
      </div>
      {!isChart && (
        <FormatterPanel fmt={draft.formatter} onChange={(f) => update({ formatter: f })} />
      )}
    </div>
  )
}

// ── Static mode panel ──────────────────────────────────────────────────────────

// 静态数据 · 动态系列编辑器：系列可增删，逐系列配置名称/颜色/静态值。
// 存储：staticData.series{N}=值；chartSeriesNames/chartSeriesColors 为平行数组；staticData.category=分类。
function StaticChartSeriesEditor({ draft, setDraft }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
}) {
  const sd = (draft.staticData ?? {}) as Record<string, string>
  const seriesIdxs = Object.keys(sd).filter((k) => /^series\d+$/.test(k)).map((k) => Number(k.slice(6)))
  const count = Math.max(
    1,
    seriesIdxs.length ? Math.max(...seriesIdxs) + 1 : 0,
    draft.chartSeriesNames?.length ?? 0,
    draft.chartSeriesColors?.length ?? 0,
  )
  const values = Array.from({ length: count }, (_, i) => String(sd[`series${i}`] ?? ''))
  const names = Array.from({ length: count }, (_, i) => draft.chartSeriesNames?.[i] ?? '')
  const colors = Array.from({ length: count }, (_, i) => draft.chartSeriesColors?.[i] ?? '')
  const category = String(sd['category'] ?? '')

  const commit = (vals: string[], nms: string[], cols: string[], cat: string) => {
    setDraft((prev) => {
      const nextStatic: Record<string, unknown> = {}
      // 保留非系列/非分类的自定义键
      for (const [k, v] of Object.entries(prev.staticData ?? {})) {
        if (!/^series\d+$/.test(k) && k !== 'category') nextStatic[k] = v
      }
      vals.forEach((v, i) => { nextStatic[`series${i}`] = v })
      if (cat.trim()) nextStatic['category'] = cat
      return {
        ...prev,
        staticData: nextStatic,
        chartSeriesNames: nms.some((n) => n.trim()) ? nms : undefined,
        chartSeriesColors: cols.some((c) => c.trim()) ? cols : undefined,
      }
    })
  }

  const setAt = (idx: number, patch: { value?: string; name?: string; color?: string }) => {
    const vals = [...values], nms = [...names], cols = [...colors]
    if (patch.value !== undefined) vals[idx] = patch.value
    if (patch.name !== undefined) nms[idx] = patch.name
    if (patch.color !== undefined) cols[idx] = patch.color
    commit(vals, nms, cols, category)
  }
  const addSeries = () => commit([...values, ''], [...names, ''], [...colors, ''], category)
  const removeSeries = (idx: number) => commit(
    values.filter((_, i) => i !== idx),
    names.filter((_, i) => i !== idx),
    colors.filter((_, i) => i !== idx),
    category,
  )

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        每个系列直接填写静态值（JSON 数组如 <code>[42, 68, 35]</code>，或单值），并可配置名称/颜色
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {values.map((val, idx) => (
          <div key={idx} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            padding: '8px 10px', marginBottom: 8, position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>系列 {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeSeries(idx)}
                disabled={count <= 1}
                title={count <= 1 ? '至少保留一个系列' : '删除该系列'}
                style={{
                  fontSize: 11, lineHeight: 1, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', cursor: count <= 1 ? 'not-allowed' : 'pointer',
                  background: 'var(--bg-surface)', color: count <= 1 ? 'var(--text-muted)' : 'var(--danger)',
                  opacity: count <= 1 ? 0.5 : 1,
                }}
              >删除</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>系列名称</div>
                <Inp
                  val={names[idx] ?? ''}
                  onChange={(v) => setAt(idx, { name: v })}
                  placeholder={`系列${idx + 1}（图例/提示显示）`}
                />
              </div>
              <div style={{ width: 92 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>颜色</div>
                <SeriesColorInput
                  value={colors[idx] ?? ''}
                  onChange={(v) => setAt(idx, { color: v })}
                />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 2px' }}>静态值</div>
            <Inp
              val={val}
              onChange={(v) => setAt(idx, { value: v })}
              placeholder="[42, 68, 35] 或 42"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addSeries}
          style={{
            alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', marginBottom: 8,
            borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-accent)',
            background: 'var(--accent-muted)', color: 'var(--accent)', cursor: 'pointer',
          }}
        >+ 添加系列</button>
        <Field label="分类轴" optional>
          <Inp
            val={category}
            onChange={(v) => commit(values, names, colors, v)}
            placeholder="A, B, C 或 [&quot;A&quot;,&quot;B&quot;]"
          />
          <Hint>分类标签，逗号分隔或 JSON 数组；与每个系列的值按序对应</Hint>
        </Field>
      </div>
    </div>
  )
}

function StaticModePanel({ draft, setDraft, isChart, schema }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
  isChart: boolean
  schema: ReturnType<typeof getChartSchema>
}) {
  const staticData = (draft.staticData ?? {}) as Record<string, string>

  const updateKey = (key: string, val: string) => {
    setDraft((prev) => ({
      ...prev,
      staticData: { ...(prev.staticData ?? {}), [key]: val },
    }))
  }

  if (isChart && schema) {
    // 动态系列图表（如横向柱）：静态模式也支持系列增删 + 逐系列名称/颜色
    if (schema.seriesDynamic) {
      return <StaticChartSeriesEditor draft={draft} setDraft={setDraft} />
    }
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          为每个绑定字段直接填写静态 JSON 值（数字、字符串或 JSON 数组）
        </div>
        {schema.bindingFields.map((f) => (
          <Field key={f.key} label={f.label} optional={f.optional}>
            <Inp
              val={String(staticData[f.key] ?? '')}
              onChange={(v) => updateKey(f.key, v)}
              placeholder={f.kind === 'series' ? '[42, 68, 35]' : f.placeholder}
            />
            {f.hint && <Hint>{f.hint}</Hint>}
          </Field>
        ))}
      </div>
    )
  }

  return (
    <div>
      <Field label="静态值">
        <Inp
          val={String(staticData['value'] ?? '')}
          onChange={(v) => updateKey('value', v)}
          placeholder="42"
        />
        <Hint>直接填写数字或字符串，将直接显示在组件上</Hint>
      </Field>
    </div>
  )
}

// ── Simulation mode panel ──────────────────────────────────────────────────────

function SimModePanel({ draft, setDraft, scadaCode, pointData, onApply, onManage }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
  scadaCode?: string
  pointData?: PointDataMap
  onApply?: (linkName: string) => void
  onManage?: () => void
}) {
  const [simPoints, setSimPoints] = useState<ScadaSimPointItem[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<Record<string, { value: number; time: Date }>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dataBindingApi.listSimPoints(scadaCode).then((res) => setSimPoints(res.data ?? [])).catch(() => {})
  }, [scadaCode])

  // Track live data updates for all sim points
  useEffect(() => {
    if (!pointData) return
    setLastSeen((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(pointData)) {
        if (simPoints.some((p) => p.link_name === k)) {
          next[k] = { value: Number(v), time: new Date() }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pointData, simPoints])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const update = (patch: Partial<PointBinding>) => setDraft((prev) => ({ ...prev, ...patch }))

  const filtered = simPoints.filter((p) =>
    !query || p.link_name.toLowerCase().includes(query.toLowerCase()) || p.mode.toLowerCase().includes(query.toLowerCase())
  )

  const selectedPoint = simPoints.find((p) => p.link_name === draft.simLinkName)
  const liveEntry = draft.simLinkName ? lastSeen[draft.simLinkName] : undefined

  const selectPoint = (p: ScadaSimPointItem) => {
    update({ simLinkName: p.link_name })
    setQuery('')
    setOpen(false)
    onApply?.(p.link_name)
  }

  const modeColor: Record<string, string> = {
    sine: '#4a9eff', random: '#f59e0b', random_walk: '#a78bfa',
    ramp: '#34d399', constant: '#94a3b8',
  }

  return (
    <div>
      {/* Search + select */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>选择模拟点位</span>
        {onManage && (
          <button
            onClick={onManage}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              height: 22, padding: '0 8px', fontSize: 10, cursor: 'pointer',
              background: 'var(--bg-surface)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            管理点位
          </button>
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div ref={containerRef} style={{ position: 'relative' }}>
          {/* Trigger / search input */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 8px',
              background: 'var(--bg-base)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'text',
            }}
            onClick={() => setOpen(true)}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={open ? query : (selectedPoint ? selectedPoint.link_name : (draft.simLinkName ?? ''))}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="搜索点位名称…"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
              }}
            />
            {draft.simLinkName && (
              <button
                onMouseDown={(e) => { e.preventDefault(); update({ simLinkName: undefined }); setQuery('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
              background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxHeight: 220, overflowY: 'auto',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '12px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {simPoints.length === 0 ? '暂无模拟点位' : '无匹配点位'}
                </div>
              ) : filtered.map((p) => {
                const live = lastSeen[p.link_name]
                const isSelected = draft.simLinkName === p.link_name
                return (
                  <div
                    key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); selectPoint(p) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-muted)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-overlay)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* mode badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                      background: `${modeColor[p.mode] ?? '#64748b'}20`,
                      color: modeColor[p.mode] ?? '#64748b',
                      border: `1px solid ${modeColor[p.mode] ?? '#64748b'}40`,
                      flexShrink: 0, fontFamily: 'var(--font-mono)',
                    }}>{p.mode.toUpperCase()}</span>

                    {/* name */}
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: p.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {p.link_name}
                    </span>

                    {/* interval */}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{p.interval_ms}ms</span>

                    {/* live value */}
                    {live && (
                      <span style={{
                        fontSize: 10, fontFamily: 'var(--font-mono)',
                        color: '#4ade80', background: 'rgba(74,222,128,0.1)',
                        padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                      }}>{live.value.toFixed(2)}</span>
                    )}

                    {/* disabled badge */}
                    {!p.enabled && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>已禁用</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live data preview for selected point */}
      {draft.simLinkName && (
        <div style={{
          marginTop: 2, padding: '10px 12px',
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: liveEntry ? 8 : 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>已绑定</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
            }}>{draft.simLinkName}</span>
            {selectedPoint && (
              <>
                <span style={{
                  fontSize: 9, padding: '1px 4px', borderRadius: 3,
                  background: `${modeColor[selectedPoint.mode] ?? '#64748b'}20`,
                  color: modeColor[selectedPoint.mode] ?? '#64748b',
                  border: `1px solid ${modeColor[selectedPoint.mode] ?? '#64748b'}40`,
                  fontFamily: 'var(--font-mono)',
                }}>{selectedPoint.mode}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selectedPoint.interval_ms}ms</span>
              </>
            )}
            {/* live pulse dot */}
            {liveEntry && (
              <span style={{
                marginLeft: 'auto',
                width: 6, height: 6, borderRadius: '50%',
                background: '#22c55e', boxShadow: '0 0 5px #22c55e',
                flexShrink: 0,
              }} title="数据推送中" />
            )}
          </div>

          {liveEntry ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{
                fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: '#4ade80',
              }}>{liveEntry.value.toFixed(3)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {liveEntry.time.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              等待 STOMP 推送… (需开启"加载数据")
            </div>
          )}
        </div>
      )}
      <FormatterPanel fmt={draft.formatter} onChange={(f) => update({ formatter: f })} />
    </div>
  )
}

// ── Trend mode panel ───────────────────────────────────────────────────────────

function TrendModePanel({ draft, setDraft, scadaCode }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
  scadaCode?: string
}) {
  const [simPoints, setSimPoints] = useState<ScadaSimPointItem[]>([])
  const [query, setQuery] = useState('')

  const update = (patch: Partial<PointBinding>) => setDraft((prev) => ({ ...prev, ...patch }))
  const selectedKeys: string[] = draft.trendKeys ?? []

  useEffect(() => {
    dataBindingApi.listSimPoints(scadaCode).then((res) => setSimPoints(res.data ?? [])).catch(() => {})
  }, [scadaCode])

  const filtered = simPoints.filter((p) =>
    !query || p.link_name.toLowerCase().includes(query.toLowerCase())
  )

  const toggle = (linkName: string) => {
    const next = selectedKeys.includes(linkName)
      ? selectedKeys.filter((k) => k !== linkName)
      : [...selectedKeys, linkName]
    update({ trendKeys: next })
  }

  return (
    <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="数据点位（多选）">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索点位名…"
          style={{
            width: '100%', padding: '5px 10px', fontSize: 12, boxSizing: 'border-box',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none',
            marginBottom: 6,
          }}
        />
        <div style={{
          maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', background: 'var(--bg-base)',
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              暂无点位{scadaCode ? `（${scadaCode}）` : ''}
            </div>
          )}
          {filtered.map((p) => {
            const checked = selectedKeys.includes(p.link_name)
            return (
              <div
                key={p.id}
                onClick={() => toggle(p.link_name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  background: checked ? 'var(--accent-muted)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: checked ? 'none' : '1px solid var(--border)',
                  background: checked ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                </span>
                <span style={{ flex: 1, color: checked ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {p.link_name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.mode}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.interval_ms}ms</span>
              </div>
            )
          })}
        </div>
        {selectedKeys.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selectedKeys.map((k) => (
              <span key={k} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--accent)', fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }} onClick={() => toggle(k)} title="点击移除">
                {k} ×
              </span>
            ))}
          </div>
        )}
      </Field>

      <Field label="最大点数">
        <input
          type="number"
          value={draft.trendMaxPoints ?? 200}
          min={10} max={2000}
          onChange={(e) => update({ trendMaxPoints: Math.max(10, parseInt(e.target.value) || 200) })}
          style={{
            width: 100, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>条</span>
      </Field>

      <Field label="时间窗口">
        <input
          type="number"
          value={draft.trendTimeWindowSec ?? 0}
          min={0}
          onChange={(e) => update({ trendTimeWindowSec: Math.max(0, parseInt(e.target.value) || 0) })}
          style={{
            width: 100, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>秒（0=不限）</span>
      </Field>
    </div>
  )
}

function buildInterfaceTargets(isChart: boolean, schema: ReturnType<typeof getChartSchema>): string[] {
  if (isChart && schema) {
    return schema.bindingFields.map((f) => {
      if (f.kind === 'category') return 'category'
      return `series:${f.seriesIndex ?? 0}`
    })
  }
  return ['text', 'fill', 'stroke', 'value']
}

// 接口参数「来源选择 + 非固定值输入」控件。
// 固定值(constant)输入由调用方自行渲染（因需按 ParamSpec 类型区分 enum/boolean/number）。
function ParamSourceControls({
  name, source, binding, exprScope, elements,
  onSource, onPath, onExpression, onGlobal, onElementId, onProperty, globalParamKeys,
}: {
  name: string
  source: InterfaceParamSourceType
  binding?: { path?: string; expression?: string; paramName?: string; elementId?: string; property?: string }
  exprScope: ExprScopeInfo
  elements: { id: string; name: string }[]
  onSource: (name: string, source: InterfaceParamSourceType) => void
  onPath: (name: string, path: string) => void
  onExpression: (name: string, expr: string) => void
  onGlobal: (name: string, paramName: string) => void
  onElementId: (name: string, elementId: string) => void
  onProperty: (name: string, property: string) => void
  globalParamKeys: string[]
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, marginBottom: 6 }}>
        <Sel val={source} onChange={(v) => onSource(name, v as InterfaceParamSourceType)}>
          <option value="constant">固定值</option>
          <option value="global">全局参数</option>
          <option value="expression">表达式</option>
          <option value="element">组件值</option>
          <option value="url">URL 参数</option>
          <option value="context">SCADA 上下文</option>
          <option value="point">点位数据</option>
          <option value="object">组合对象</option>
        </Sel>
        {source === 'constant' ? (
          <span style={{ alignSelf: 'center', fontSize: 10, color: 'var(--text-muted)' }}>按接口契约校验并转换类型</span>
        ) : source === 'global' ? (
          <Sel val={binding?.paramName ?? ''} onChange={(v) => onGlobal(name, v)}>
            <option value="">-- 选择全局参数 --</option>
            {globalParamKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </Sel>
        ) : source === 'expression' ? (
          <span style={{ alignSelf: 'center', fontSize: 10, color: 'var(--text-muted)' }}>见下方表达式编辑器</span>
        ) : source === 'element' ? (
          <Sel val={binding?.elementId ?? ''} onChange={(v) => onElementId(name, v)}>
            <option value="">-- 选择组件 --</option>
            {elements.map((e) => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}
          </Sel>
        ) : (
          <Inp
            val={binding?.path ?? ''}
            onChange={(v) => onPath(name, v)}
            placeholder={source === 'url' ? 'query 参数名' : '点分隔路径'}
          />
        )}
      </div>
      {source === 'element' && (
        <Inp
          val={binding?.property ?? ''}
          onChange={(v) => onProperty(name, v)}
          placeholder="属性路径（如 text / pointBinding.pointKey）"
        />
      )}
      {source === 'expression' && (
        <ExpressionInput
          value={binding?.expression ?? ''}
          onChange={(v) => onExpression(name, v)}
          scope={exprScope}
          placeholder="如：today('YYYY-MM-DD') 或 params.deviceId"
        />
      )}
    </>
  )
}

function IfaceModePanel({ draft, setDraft, isChart, schema, isText, isTable }: {
  draft: PointBinding
  setDraft: (fn: (prev: PointBinding) => PointBinding) => void
  isChart: boolean
  schema: ReturnType<typeof getChartSchema>
  isText: boolean
  isTable: boolean
}) {
  const [apps, setApps] = useState<OutboundAppItem[]>([])
  const [dataIfaces, setDataIfaces] = useState<DataInterfaceItem[]>([])
  const [webhooks, setWebhooks] = useState<OutboundWebhookItem[]>([])
  const [endpoints, setEndpoints] = useState<OutboundEndpointItem[]>([])
  const [testLoading, setTestLoading] = useState(false)
  const [testResponse, setTestResponse] = useState<Record<string, unknown> | null>(null)
  const [testError, setTestError] = useState<string>('')
  const [showGlobals, setShowGlobals] = useState(false)

  const project = useEditorStore((s) => s.project)
  const activeCanvas = useEditorStore((s) => s.project.canvases[s.project.activeCanvasId])
  const globalParamList = project.globalParams ?? []
  const customFnList = project.customFunctions ?? []
  const exprScope: ExprScopeInfo = {
    paramKeys: globalParamList.map((p) => p.key).filter(Boolean),
    functionNames: customFnList.map((f) => f.name).filter(Boolean),
    elementNames: (activeCanvas?.elements ?? []).map((e) => e.name).filter(Boolean),
  }
  const canvasElements = activeCanvas?.elements ?? []

  const sourceType = draft.ifaceSourceType ?? 'data_iface'

  useEffect(() => {
    dataBindingApi.listDataInterfaces().then((r) => setDataIfaces(r.data ?? [])).catch(() => {})
    dataBindingApi.listOutboundApps().then((r) => setApps(r.data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (sourceType === 'webhook' && draft.ifaceAppId) {
      dataBindingApi.listOutboundWebhooks(draft.ifaceAppId).then((r) => setWebhooks(r.data ?? [])).catch(() => {})
    }
    if (sourceType === 'open_api' && draft.ifaceAppId) {
      dataBindingApi.listOutboundEndpoints(draft.ifaceAppId).then((r) => setEndpoints(r.data ?? [])).catch(() => {})
    }
  }, [sourceType, draft.ifaceAppId])

  const update = (patch: Partial<PointBinding>) => setDraft((prev) => ({ ...prev, ...patch }))

  const setMapping = (idx: number, key: keyof InterfaceFieldMapping, val: string) => {
    const mappings = [...(draft.ifaceFieldMappings ?? [])]
    mappings[idx] = { ...(mappings[idx] ?? { target: '', sourceField: '' }), [key]: val }
    update({ ifaceFieldMappings: mappings })
  }

  const addMapping = () => {
    const mappings = [...(draft.ifaceFieldMappings ?? []), { target: '', sourceField: '' }]
    update({ ifaceFieldMappings: mappings })
  }

  const removeMapping = (idx: number) => {
    const mappings = (draft.ifaceFieldMappings ?? []).filter((_, i) => i !== idx)
    update({ ifaceFieldMappings: mappings })
  }

  const targets = buildInterfaceTargets(isChart, schema)

  // Parse schema from selected interface to suggest field names
  const getSchemaFields = (): string[] => {
    try {
      if (sourceType === 'data_iface') {
        const iface = dataIfaces.find((i) => i.id === draft.ifaceId)
        if (iface?.schema_json) {
          const s = JSON.parse(iface.schema_json)
          if (s.properties) return Object.keys(s.properties)
        }
      } else if (sourceType === 'open_api') {
        const ep = endpoints.find((e) => e.id === draft.ifaceId)
        if (ep?.response_schema) {
          const s = JSON.parse(ep.response_schema)
          if (s.properties) return Object.keys(s.properties)
        }
      } else if (sourceType === 'webhook') {
        const wh = webhooks.find((w) => w.id === draft.ifaceId)
        if (wh?.response_schema) {
          const s = JSON.parse(wh.response_schema)
          if (s.properties) return Object.keys(s.properties)
        }
      }
    } catch {}
    return []
  }

  const schemaFields = getSchemaFields()

  // Parse param specs from selected interface
  const getParamSpecs = (): ParamSpec[] => {
    try {
      if (sourceType === 'data_iface') {
        const iface = dataIfaces.find((i) => i.id === draft.ifaceId)
        if (iface?.param_contract_json) {
          return JSON.parse(iface.param_contract_json)
        }
      } else if (sourceType === 'open_api') {
        const ep = endpoints.find((e) => e.id === draft.ifaceId)
        if (ep?.param_schema) {
          // param_schema 是 JSON Schema 格式，从 properties 提取参数
          const schema = JSON.parse(ep.param_schema)
          if (schema.properties) {
            const params: ParamSpec[] = []
            const required = schema.required || []
            for (const [name, prop] of Object.entries(schema.properties)) {
              const p = prop as any
              params.push({
                name,
                type: p.type || 'string',
                required: required.includes(name),
                enum: p.enum,
                min: p.minimum,
                max: p.maximum,
                pattern: p.pattern,
                default: p.default,
              })
            }
            return params
          }
        }
      }
      // webhook 模式暂时返回空数组，允许自由添加键值对
    } catch {}
    return []
  }

  const paramSpecs = getParamSpecs()
  const hasParams = paramSpecs.length > 0 || sourceType === 'webhook' || sourceType === 'open_api'

  // 自由参数名的可选建议：来自接口契约/schema 中声明但尚未添加的参数
  const getParamNameSuggestions = (): string[] => {
    const used = new Set(Object.keys(draft.ifaceParamValues ?? {}))
    const names = paramSpecs.map((p) => p.name)
    try {
      if (sourceType === 'open_api') {
        const ep = endpoints.find((e) => e.id === draft.ifaceId)
        if (ep?.param_schema) {
          const s = JSON.parse(ep.param_schema)
          if (s.properties) names.push(...Object.keys(s.properties))
        }
      } else if (sourceType === 'webhook') {
        const wh = webhooks.find((w) => w.id === draft.ifaceId)
        if (wh?.response_schema) {
          const s = JSON.parse(wh.response_schema)
          if (s.properties) names.push(...Object.keys(s.properties))
        }
      }
    } catch {}
    return Array.from(new Set(names)).filter((n) => !used.has(n))
  }
  const paramNameSuggestions = getParamNameSuggestions()

  const setParamValue = (name: string, value: string) => {
    const params = { ...(draft.ifaceParamValues ?? {}), [name]: value }
    const bindings = { ...(draft.ifaceParamBindings ?? {}), [name]: { source: 'constant' as const, value } }
    update({ ifaceParamValues: params, ifaceParamBindings: bindings })
  }

  const setParamSource = (name: string, source: InterfaceParamSourceType) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    const existing = bindings[name]
    if (source === 'constant') bindings[name] = { source, value: draft.ifaceParamValues?.[name] ?? '' }
    else if (source === 'global') bindings[name] = { source, paramName: existing?.paramName ?? '' }
    else if (source === 'expression') bindings[name] = { source, expression: existing?.expression ?? '' }
    else if (source === 'element') bindings[name] = { source, elementId: existing?.elementId ?? '', property: existing?.property ?? '' }
    else bindings[name] = { source, path: existing?.path ?? '' }
    update({ ifaceParamBindings: bindings })
  }

  const setParamPath = (name: string, path: string) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    bindings[name] = { ...(bindings[name] ?? { source: 'constant' as const }), path }
    update({ ifaceParamBindings: bindings })
  }

  const setParamExpression = (name: string, expression: string) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    bindings[name] = { ...(bindings[name] ?? { source: 'expression' as const }), source: 'expression', expression }
    update({ ifaceParamBindings: bindings })
  }

  const setParamGlobal = (name: string, paramName: string) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    bindings[name] = { ...(bindings[name] ?? { source: 'global' as const }), source: 'global', paramName }
    update({ ifaceParamBindings: bindings })
  }

  const setParamElementId = (name: string, elementId: string) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    bindings[name] = { ...(bindings[name] ?? { source: 'element' as const }), source: 'element', elementId }
    update({ ifaceParamBindings: bindings })
  }

  const setParamProperty = (name: string, property: string) => {
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    bindings[name] = { ...(bindings[name] ?? { source: 'element' as const }), source: 'element', property }
    update({ ifaceParamBindings: bindings })
  }

  const addFreeParam = () => {
    const params = { ...(draft.ifaceParamValues ?? {}), '': '' }
    update({ ifaceParamValues: params })
  }

  const removeFreeParam = (key: string) => {
    const params = { ...(draft.ifaceParamValues ?? {}) }
    delete params[key]
    const bindings = { ...(draft.ifaceParamBindings ?? {}) }
    delete bindings[key]
    update({ ifaceParamValues: params, ifaceParamBindings: bindings })
  }

  const renameFreeParam = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return
    const src = draft.ifaceParamValues ?? {}
    // 保持原有顺序重建对象，避免重命名后该行跳到末尾
    const params: Record<string, string> = {}
    for (const [k, v] of Object.entries(src)) {
      if (k === oldKey) {
        if (newKey) params[newKey] = v
      } else {
        params[k] = v
      }
    }
    const srcBindings = draft.ifaceParamBindings ?? {}
    const bindings: Record<string, typeof srcBindings[string]> = {}
    for (const [k, v] of Object.entries(srcBindings)) {
      if (k === oldKey) {
        if (newKey) bindings[newKey] = v
      } else {
        bindings[k] = v
      }
    }
    update({ ifaceParamValues: params, ifaceParamBindings: bindings })
  }

  // Test interface call
  const testInterfaceCall = async () => {
    if (!draft.ifaceId || sourceType !== 'data_iface') return

    setTestLoading(true)
    setTestError('')
    setTestResponse(null)

    try {
      const token = localStorage.getItem('token') ?? ''
      const url = `/api/data/interfaces/${draft.ifaceId}/invoke`
      const params = draft.ifaceParamValues ?? {}

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ param_values: params, limit: 10 }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `HTTP ${res.status}`)
      }

      const json = await res.json()
      setTestResponse(json)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTestLoading(false)
    }
  }

  // Auto-fill sourceField from JSON path
  const fillFieldPath = (path: string, mappingIdx: number) => {
    setMapping(mappingIdx, 'sourceField', path)
  }

  // Table column operations
  const addTableColumn = () => {
    const cols = [...(draft.tableColumns ?? []), { key: '', title: '', align: 'left' as const }]
    update({ tableColumns: cols })
  }

  const setTableColumn = (idx: number, field: string, value: any) => {
    const cols = [...(draft.tableColumns ?? [])]
    if (cols[idx]) {
      cols[idx] = { ...cols[idx], [field]: value }
      update({ tableColumns: cols })
    }
  }

  const removeTableColumn = (idx: number) => {
    const cols = (draft.tableColumns ?? []).filter((_, i) => i !== idx)
    update({ tableColumns: cols })
  }

  return (
    <div>
      <Field label="数据源类型">
        <Sel
          val={sourceType}
          onChange={(v) => update({ ifaceSourceType: v as InterfaceSourceType, ifaceId: undefined, ifaceCode: undefined, ifaceAppId: undefined, ifaceName: undefined })}
        >
          <option value="data_iface">平台数据接口</option>
          <option value="open_api">外部应用开放接口</option>
          <option value="webhook">外部应用 Webhook</option>
        </Sel>
      </Field>

      {sourceType === 'data_iface' && (
        <Field label="选择数据接口">
          <Sel
            val={String(draft.ifaceId ?? '')}
            onChange={(v) => {
              const iface = dataIfaces.find((i) => i.id === Number(v))
              update({ ifaceId: Number(v) || undefined, ifaceCode: iface?.code, ifaceName: iface?.name })
            }}
          >
            <option value="">-- 选择接口 --</option>
            {dataIfaces.filter((i) => i.enabled).map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
            ))}
          </Sel>
          {draft.ifaceCode && <Hint>调用路径：/api/open/v1/data/{draft.ifaceCode}</Hint>}
        </Field>
      )}

      {sourceType === 'open_api' && (
        <>
          <Field label="选择外部应用">
            <Sel
              val={String(draft.ifaceAppId ?? '')}
              onChange={(v) => update({ ifaceAppId: Number(v) || undefined, ifaceId: undefined, ifaceName: undefined })}
            >
              <option value="">-- 选择应用 --</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
              ))}
            </Sel>
          </Field>
          {draft.ifaceAppId && (
            <Field label="选择开放接口">
              <Sel
                val={String(draft.ifaceId ?? '')}
                onChange={(v) => {
                  const ep = endpoints.find((e) => e.id === Number(v))
                  update({ ifaceId: Number(v) || undefined, ifaceName: ep?.name })
                }}
              >
                <option value="">-- 选择接口 --</option>
                {endpoints.filter((e) => e.enabled).map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.method} {e.path})</option>
                ))}
              </Sel>
              {draft.ifaceId && endpoints.find(e => e.id === draft.ifaceId) && (
                <Hint>
                  {endpoints.find(e => e.id === draft.ifaceId)?.method} {endpoints.find(e => e.id === draft.ifaceId)?.path}
                </Hint>
              )}
            </Field>
          )}
        </>
      )}

      {sourceType === 'webhook' && (
        <>
          <Field label="选择外部应用">
            <Sel
              val={String(draft.ifaceAppId ?? '')}
              onChange={(v) => update({ ifaceAppId: Number(v) || undefined, ifaceId: undefined, ifaceName: undefined })}
            >
              <option value="">-- 选择应用 --</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
              ))}
            </Sel>
          </Field>
          {draft.ifaceAppId && (
            <Field label="选择 Webhook">
              <Sel
                val={String(draft.ifaceId ?? '')}
                onChange={(v) => {
                  const wh = webhooks.find((w) => w.id === Number(v))
                  update({ ifaceId: Number(v) || undefined, ifaceName: wh?.name })
                }}
              >
                <option value="">-- 选择 Webhook --</option>
                {webhooks.filter((w) => w.enabled).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Sel>
            </Field>
          )}
        </>
      )}

      <Field label="数据传输模式">
        <Sel val={draft.ifaceTransport ?? 'polling'} onChange={(v) => update({ ifaceTransport: v as 'polling' | 'stomp' })}>
          <option value="polling">浏览器轮询</option>
          <option value="stomp">SCADA STOMP 推送</option>
        </Sel>
        <Hint>STOMP 模式由服务端按已发布组态注册接口任务；动态 URL、组件或组合参数应保留轮询。</Hint>
      </Field>
      <Field label="轮询间隔 (ms)" optional>
        <Inp
          type="number"
          val={String(draft.ifaceRefreshMs ?? 5000)}
          onChange={(v) => update({ ifaceRefreshMs: Number(v) || 5000 })}
          placeholder="5000"
        />
        <Hint>{draft.ifaceTransport === 'stomp' ? '服务端推送任务的执行间隔，最低 1000ms。' : '浏览器请求接口的间隔。'}</Hint>
      </Field>

      {/* 接口参数 */}
      {hasParams && draft.ifaceId && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Label>接口参数</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowGlobals(true)}
                title="管理全局参数与自定义函数"
                style={{
                  padding: '2px 8px', fontSize: 10, cursor: 'pointer',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                }}
              >全局参数/函数</button>
              {(sourceType === 'webhook' || (sourceType === 'open_api' && paramSpecs.length === 0)) && (
                <button
                  onClick={addFreeParam}
                  style={{
                    padding: '2px 8px', fontSize: 10, cursor: 'pointer',
                    background: 'var(--accent-muted)', color: 'var(--accent)',
                    border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)',
                  }}
                >+ 添加参数</button>
              )}
            </div>
          </div>

          {paramSpecs.length === 0 && sourceType !== 'webhook' && sourceType !== 'open_api' && (
            <Hint>此接口无需参数</Hint>
          )}

          {/* Schema-based params (data_iface) */}
          {paramSpecs.map((param) => {
            const val = draft.ifaceParamValues?.[param.name] ?? String(param.default ?? '')
            const paramBinding = draft.ifaceParamBindings?.[param.name]
            const source = paramBinding?.source ?? 'constant'
            return (
              <div key={param.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Label>{param.name}</Label>
                  {param.required && (
                    <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>*</span>
                  )}
                  {param.type && param.type !== 'any' && (
                    <span style={{
                      fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-overlay)',
                      padding: '1px 4px', borderRadius: 2, border: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)',
                    }}>{param.type}</span>
                  )}
                </div>
                <ParamSourceControls
                  name={param.name}
                  source={source}
                  binding={paramBinding}
                  exprScope={exprScope}
                  elements={canvasElements}
                  globalParamKeys={exprScope.paramKeys ?? []}
                  onSource={setParamSource}
                  onPath={setParamPath}
                  onExpression={setParamExpression}
                  onGlobal={setParamGlobal}
                  onElementId={setParamElementId}
                  onProperty={setParamProperty}
                />
                {source === 'constant' && (param.enum && param.enum.length > 0 ? (
                  <Combo
                    val={val}
                    onChange={(v) => setParamValue(param.name, v)}
                    options={param.enum.map((e) => String(e))}
                    placeholder="选择或录入"
                    type={param.type === 'number' || param.type === 'integer' ? 'number' : 'text'}
                  />
                ) : param.type === 'boolean' ? (
                  <Sel val={val} onChange={(v) => setParamValue(param.name, v)}>
                    <option value="">-- 选择 --</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Sel>
                ) : (
                  <ExpressionInput
                    value={val}
                    onChange={(v) => setParamValue(param.name, v)}
                    placeholder={param.default ? String(param.default) : `输入 ${param.name} 或表达式`}
                    scope={exprScope}
                    singleLine
                  />
                ))}
                {(param.min !== undefined || param.max !== undefined) && (
                  <Hint>
                    范围：{param.min !== undefined ? `最小 ${param.min}` : ''}
                    {param.min !== undefined && param.max !== undefined ? '，' : ''}
                    {param.max !== undefined ? `最大 ${param.max}` : ''}
                  </Hint>
                )}
              </div>
            )
          })}

          {/* Free-form params (webhook / open_api without schema) */}
          {(sourceType === 'webhook' || sourceType === 'open_api') && (
            <>
              {Object.entries(draft.ifaceParamValues ?? {}).map(([key, val]) => {
                const fb = draft.ifaceParamBindings?.[key]
                const fsource = fb?.source ?? 'constant'
                return (
                  <div key={key} style={{
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    padding: 8, marginBottom: 8, background: 'var(--bg-base)',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <FreeParamNameInput
                        name={key}
                        onCommit={(v) => renameFreeParam(key, v)}
                        options={paramNameSuggestions}
                      />
                      <button
                        onClick={() => removeFreeParam(key)}
                        style={{
                          padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                          background: 'var(--danger-muted)', color: 'var(--danger)',
                          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
                        }}
                      >×</button>
                    </div>
                    <ParamSourceControls
                      name={key}
                      source={fsource}
                      binding={fb}
                      exprScope={exprScope}
                      elements={canvasElements}
                      globalParamKeys={exprScope.paramKeys ?? []}
                      onSource={setParamSource}
                      onPath={setParamPath}
                      onExpression={setParamExpression}
                      onGlobal={setParamGlobal}
                      onElementId={setParamElementId}
                      onProperty={setParamProperty}
                    />
                    {fsource === 'constant' && (
                      <ExpressionInput
                        value={String(val)}
                        onChange={(v) => setParamValue(key, v)}
                        placeholder="参数值或表达式"
                        scope={exprScope}
                        singleLine
                      />
                    )}
                  </div>
                )
              })}
              {Object.keys(draft.ifaceParamValues ?? {}).length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
                  点击"添加参数"为接口添加请求参数
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 测试调用 */}
      {draft.ifaceId && sourceType === 'data_iface' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Label>测试调用</Label>
            <button
              onClick={testInterfaceCall}
              disabled={testLoading}
              style={{
                padding: '4px 12px', fontSize: 11, cursor: testLoading ? 'not-allowed' : 'pointer',
                background: testLoading ? 'var(--bg-surface)' : 'var(--accent)',
                color: testLoading ? 'var(--text-muted)' : '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                opacity: testLoading ? 0.6 : 1,
              }}
            >
              {testLoading ? '调用中...' : '测试接口'}
            </button>
          </div>

          {testError && (
            <div style={{
              padding: '8px 10px', fontSize: 11, color: 'var(--danger)',
              background: 'var(--danger-muted)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-sm)', marginBottom: 8, fontFamily: 'var(--font-mono)',
            }}>
              错误：{testError}
            </div>
          )}

          {testResponse && (
            <div style={{
              maxHeight: 240, overflowY: 'auto',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px',
            }}>
              <JsonTree
                data={testResponse}
                onSelectPath={(path) => {
                  // Auto-fill the first empty mapping, or add a new one
                  const emptyIdx = (draft.ifaceFieldMappings ?? []).findIndex(m => !m.sourceField)
                  if (emptyIdx >= 0) {
                    fillFieldPath(path, emptyIdx)
                  } else {
                    addMapping()
                    setTimeout(() => fillFieldPath(path, (draft.ifaceFieldMappings ?? []).length), 0)
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 文本模板（仅文本组件在 interface 模式显示）*/}
      {isText && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <Field label="文本模板">
            <Inp
              val={draft.textTemplate ?? ''}
              onChange={(v) => update({ textTemplate: v })}
              placeholder="{{field1}} - {{field2}}"
            />
            <Hint>
              使用 {'{{'} {'}}'}包裹字段名进行多字段拼接，如：{'{{'} name {'}}'}  -  {'{{'} status {'}}'}<br />
              留空则使用字段映射中的第一个 text 字段
            </Hint>
          </Field>
        </div>
      )}

      {/* 表格列定义（仅表格组件显示）*/}
      {isTable && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <Label>表格列定义</Label>
            <button
              onClick={addTableColumn}
              style={{
                padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)',
              }}
            >+ 添加列</button>
          </div>

          {(draft.tableColumns ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
              点击"添加列"定义表格列（key 对应接口返回数据中的字段名）
            </div>
          )}

          {(draft.tableColumns ?? []).map((col, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr 0.8fr auto', gap: 6, marginBottom: 8, alignItems: 'end',
            }}>
              <div>
                {idx === 0 && <Label>字段名(key)</Label>}
                <Inp val={col.key} onChange={(v) => setTableColumn(idx, 'key', v)} placeholder="name" />
              </div>
              <div>
                {idx === 0 && <Label>列标题</Label>}
                <Inp val={col.title} onChange={(v) => setTableColumn(idx, 'title', v)} placeholder="名称" />
              </div>
              <div>
                {idx === 0 && <Label>宽度</Label>}
                <Inp val={col.width ? String(col.width) : ''} onChange={(v) => setTableColumn(idx, 'width', v ? Number(v) : undefined)} placeholder="auto" type="number" />
              </div>
              <div>
                {idx === 0 && <Label>对齐</Label>}
                <Sel val={col.align ?? 'left'} onChange={(v) => setTableColumn(idx, 'align', v as 'left' | 'center' | 'right')}>
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                </Sel>
              </div>
              <button
                onClick={() => removeTableColumn(idx)}
                style={{
                  padding: '4px 6px', fontSize: 11, cursor: 'pointer', marginTop: idx === 0 ? 16 : 0,
                  background: 'var(--danger-muted)', color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* 字段映射（非表格组件显示）*/}
      {!isTable && (
        <div style={{ marginTop: 4 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <Label>字段映射</Label>
            <button
              onClick={addMapping}
              style={{
                padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)',
              }}
            >+ 添加映射</button>
          </div>

          {(draft.ifaceFieldMappings ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
              点击"添加映射"将接口返回字段绑定到组件属性
            </div>
          )}

          {(draft.ifaceFieldMappings ?? []).map((m, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'end',
            }}>
              <div>
                {idx === 0 && <Label>目标属性</Label>}
                <Sel val={m.target} onChange={(v) => setMapping(idx, 'target', v)}>
                  <option value="">-- 目标 --</option>
                  {targets.map((t) => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </div>
              <div>
                {idx === 0 && <Label>接口字段（点分隔路径）</Label>}
                {schemaFields.length > 0 ? (
                  <Sel val={m.sourceField} onChange={(v) => setMapping(idx, 'sourceField', v)}>
                    <option value="">-- 字段 --</option>
                    {schemaFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </Sel>
                ) : (
                  <Inp val={m.sourceField} onChange={(v) => setMapping(idx, 'sourceField', v)} placeholder="data.value" />
                )}
              </div>
              <button
                onClick={() => removeMapping(idx)}
                style={{
                  padding: '4px 6px', fontSize: 11, cursor: 'pointer', marginTop: idx === 0 ? 16 : 0,
                  background: 'var(--danger-muted)', color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {showGlobals && <GlobalParamsModal onClose={() => setShowGlobals(false)} />}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BindingDrawer({ elementId, scadaCode, pointData, onClose }: Props) {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const el = canvas?.elements.find((e) => e.id === elementId)
  // Guard lives in this thin wrapper so no hooks run after an early return.
  // When the element is deleted/cleared, the inner (hook-bearing) component
  // unmounts wholesale instead of rendering a different number of hooks
  // (which would trigger React error #300 "rendered fewer hooks than expected").
  if (!el) return null
  return (
    <BindingDrawerInner
      el={el}
      elementId={elementId}
      scadaCode={scadaCode}
      pointData={pointData}
      onClose={onClose}
    />
  )
}

function BindingDrawerInner({ el, elementId, scadaCode, pointData, onClose }: Props & { el: CanvasElement }) {
  const store = useEditorStore()
  const pb = el.pointBinding ?? { mode: 'point', pointKey: '', deviceCode: '' }
  const schema = getChartSchema(el.type)
  const isChart = !!schema
  const isTable = el.type === 'table'
  const isText = el.type === 'text'

  const maxSeriesIdx = schema
    ? Math.max(0, ...schema.bindingFields.filter((f) => f.kind !== 'category').map((f) => f.seriesIndex ?? 0))
    : 0

  const [mode, setMode] = useState<DataBindingMode>(pb.mode ?? 'point')
  const [draft, setDraft] = useState<PointBinding>(() => {
    // Initialize draft with tableColumns from element if table type
    if (isTable && el.tableColumns) {
      return { ...pb, tableColumns: el.tableColumns }
    }
    return { ...pb }
  })
  const [chartState, setChartState] = useState<ChartBindingState>(() => initChartState(pb, maxSeriesIdx + 1, schema?.seriesDynamic))

  // 其他组件名称（供「来源=组件属性」下拉引用；排除自身）
  const componentNames = (store.activeCanvas()?.elements ?? [])
    .filter((e) => e.id !== elementId && e.type !== 'group' && (e.name?.trim()))
    .map((e) => e.name!.trim())

  const handleModeChange = (m: DataBindingMode) => {
    setMode(m)
    setDraft((prev) => ({ ...prev, mode: m }))
  }

  const save = () => {
    const binding: PointBinding = {
      ...draft,
      mode,
      pointKey: draft.pointKey?.trim() ?? '',
      deviceCode: draft.deviceCode?.trim() ?? '',
    }
    if (mode === 'point' && isChart && schema) {
      // 系列：来源=key 存 chartSeriesKeys；来源=component/global 存 chartSeriesSources.ref
      const seriesKeys: string[][] = []
      const seriesSources: ChartKeySource[] = []
      let hasNonKey = false
      chartState.seriesInputs.forEach((s, i) => {
        const type = chartState.seriesSources[i] ?? 'key'
        if (type === 'key') {
          seriesKeys.push(s.split(',').map((k) => k.trim()).filter(Boolean))
          seriesSources.push({ type: 'key' })
        } else {
          seriesKeys.push([])
          seriesSources.push({ type, ref: s.trim() || undefined })
          hasNonKey = true
        }
      })
      binding.chartSeriesKeys = seriesKeys
      binding.chartSeriesSources = hasNonKey ? seriesSources : undefined

      // 动态系列名称/颜色：有任一非空则保存（与 seriesKeys 对齐长度）
      if (schema.seriesDynamic) {
        const names = chartState.seriesNames.map((n) => n.trim())
        binding.chartSeriesNames = names.some(Boolean) ? names : undefined
        const cols = chartState.seriesColors.map((c) => c.trim())
        binding.chartSeriesColors = cols.some(Boolean) ? cols : undefined
      } else {
        binding.chartSeriesNames = undefined
        binding.chartSeriesColors = undefined
      }

      const catType = chartState.categorySource
      if (catType === 'key') {
        binding.chartCategoryKey = chartState.categoryInput.trim() || undefined
        binding.chartCategorySource = undefined
      } else {
        binding.chartCategoryKey = undefined
        binding.chartCategorySource = { type: catType, ref: chartState.categoryInput.trim() || undefined }
      }
    } else if (mode !== 'point') {
      // Clear point-mode chart key fields to avoid stale keys bleeding into other modes
      binding.chartSeriesKeys = undefined
      binding.chartCategoryKey = undefined
      binding.chartSeriesSources = undefined
      binding.chartCategorySource = undefined
      // 静态模式动态系列图表：保留编辑器写入的逐系列名称/颜色；其余模式清空
      if (mode === 'static' && isChart && schema?.seriesDynamic) {
        const names = (draft.chartSeriesNames ?? []).map((n) => (n ?? '').trim())
        binding.chartSeriesNames = names.some(Boolean) ? names : undefined
        const cols = (draft.chartSeriesColors ?? []).map((c) => (c ?? '').trim())
        binding.chartSeriesColors = cols.some(Boolean) ? cols : undefined
      } else {
        binding.chartSeriesNames = undefined
        binding.chartSeriesColors = undefined
      }
    }

    // Save table columns to element (not in binding)
    if (isTable && mode === 'interface') {
      store.updateElement(elementId, {
        pointBinding: binding,
        tableColumns: draft.tableColumns ?? []
      })
    } else {
      store.updateElement(elementId, { pointBinding: binding })
    }
    onClose()
  }

  const clear = () => {
    store.updateElement(elementId, { pointBinding: undefined })
    onClose()
  }

  // Immediately bind a simulation point to the element when selected
  const applySimPoint = (linkName: string) => {
    const binding: PointBinding = {
      ...draft,
      mode: 'simulation',
      simLinkName: linkName,
      chartSeriesKeys: undefined,
      chartCategoryKey: undefined,
      pointKey: draft.pointKey?.trim() ?? '',
      deviceCode: draft.deviceCode?.trim() ?? '',
    }
    store.updateElement(elementId, { pointBinding: binding })
  }

  // scadaCode comes from props (passed by CanvasBoard)
  const [showSimManager, setShowSimManager] = useState(false)

  // ── Display mode: 'bottom' | 'right' | 'float' ────────────────────────────
  type DisplayMode = 'bottom' | 'right' | 'float'
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    return (localStorage.getItem('scada:bindingDrawerMode') as DisplayMode) ?? 'bottom'
  })
  const changeDisplayMode = (m: DisplayMode) => {
    setDisplayMode(m)
    localStorage.setItem('scada:bindingDrawerMode', m)
  }

  // Floating window drag/resize state
  const [floatPos, setFloatPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem('scada:bindingDrawerFloat')
      if (s) return JSON.parse(s)
    } catch { /* ignore */ }
    return { x: Math.max(0, window.innerWidth / 2 - 220), y: 80 }
  })
  const [floatSize, setFloatSize] = useState<{ w: number; h: number }>(() => {
    try {
      const s = localStorage.getItem('scada:bindingDrawerFloatSize')
      if (s) return JSON.parse(s)
    } catch { /* ignore */ }
    return { w: 440, h: 560 }
  })

  const floatRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const resizeState = useRef<{ startX: number; startY: number; ow: number; oh: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: floatPos.x, oy: floatPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const nx = dragState.current.ox + ev.clientX - dragState.current.startX
      const ny = dragState.current.oy + ev.clientY - dragState.current.startY
      const pos = { x: Math.max(0, nx), y: Math.max(0, ny) }
      setFloatPos(pos)
      localStorage.setItem('scada:bindingDrawerFloat', JSON.stringify(pos))
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [floatPos])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { startX: e.clientX, startY: e.clientY, ow: floatSize.w, oh: floatSize.h }
    const onMove = (ev: MouseEvent) => {
      if (!resizeState.current) return
      const nw = Math.max(320, resizeState.current.ow + ev.clientX - resizeState.current.startX)
      const nh = Math.max(320, resizeState.current.oh + ev.clientY - resizeState.current.startY)
      const sz = { w: nw, h: nh }
      setFloatSize(sz)
      localStorage.setItem('scada:bindingDrawerFloatSize', JSON.stringify(sz))
    }
    const onUp = () => {
      resizeState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [floatSize])

  // ── Shared inner content ───────────────────────────────────────────────────
  const ModeIcon = ({ m }: { m: DisplayMode }) => {
    if (m === 'bottom') return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <rect x={2} y={14} width={20} height={8} rx={1} />
        <path d="M2 2h20" opacity={0.3} />
      </svg>
    )
    if (m === 'right') return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <rect x={14} y={2} width={8} height={20} rx={1} />
        <path d="M2 2v20" opacity={0.3} />
      </svg>
    )
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <rect x={3} y={3} width={18} height={18} rx={2} />
        <path d="M9 3v18M3 9h6" opacity={0.4} />
      </svg>
    )
  }

  const panelHeader = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px 10px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      ...(displayMode === 'float' ? { cursor: 'move', borderRadius: '10px 10px 0 0' } : {}),
    }}
      onMouseDown={displayMode === 'float' ? onDragStart : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>数据绑定</span>
        <span style={{
          fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-base)',
          border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', fontFamily: 'var(--font-mono)',
        }}>{el.type}</span>
        {schema && (
          <span style={{
            fontSize: 9, color: 'var(--accent)', background: 'var(--accent-muted)',
            border: '1px solid var(--border-accent)', borderRadius: 3, padding: '1px 4px',
          }}>{schema.label}</span>
        )}
        {el.name && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Display mode switcher */}
        {(['bottom', 'right', 'float'] as DisplayMode[]).map((m) => (
          <button
            key={m}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); changeDisplayMode(m) }}
            title={m === 'bottom' ? '底部抽屉' : m === 'right' ? '右侧面板' : '浮窗'}
            style={{
              width: 22, height: 22, borderRadius: 4, border: 'none',
              background: displayMode === m ? 'var(--accent-muted)' : 'transparent',
              color: displayMode === m ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ModeIcon m={m} />
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )

  const panelBody = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 0' }}>
      <ModeTabs mode={mode} onChange={handleModeChange} elType={el.type} />
      <div style={{ paddingTop: 14 }}>
        {mode === 'point' && (
          <PointModePanel
            draft={draft}
            setDraft={setDraft}
            isChart={isChart}
            schema={schema}
            chartState={chartState}
            setChartState={setChartState}
            componentNames={componentNames}
          />
        )}
        {mode === 'static' && (
          <StaticModePanel draft={draft} setDraft={setDraft} isChart={isChart} schema={schema} />
        )}
        {mode === 'simulation' && (
          <SimModePanel draft={draft} setDraft={setDraft} scadaCode={scadaCode} pointData={pointData} onApply={applySimPoint} onManage={() => setShowSimManager(true)} />
        )}
        {mode === 'interface' && (
          <IfaceModePanel draft={draft} setDraft={setDraft} isChart={isChart} schema={schema} isText={isText} isTable={isTable} />
        )}
        {mode === 'trend' && (
          <TrendModePanel draft={draft} setDraft={setDraft} scadaCode={scadaCode} />
        )}
      </div>
    </div>
  )

  const panelFooter = (
    <div style={{
      display: 'flex', gap: 6, justifyContent: 'flex-end',
      padding: '10px 16px', borderTop: '1px solid var(--border)',
      background: 'var(--bg-panel)', flexShrink: 0,
    }}>
      <button
        onClick={clear}
        style={{
          padding: '5px 12px', fontSize: 11, cursor: 'pointer',
          background: 'var(--danger-muted)', color: 'var(--danger)',
          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
        }}
      >清除绑定</button>
      <button
        onClick={onClose}
        style={{
          padding: '5px 12px', fontSize: 11, cursor: 'pointer',
          background: 'var(--bg-surface)', color: 'var(--text-secondary)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}
      >取消</button>
      <button
        onClick={save}
        style={{
          padding: '5px 14px', fontSize: 11, cursor: 'pointer',
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius-sm)',
        }}
      >保存</button>
    </div>
  )

  const simManager = showSimManager && scadaCode ? (
    <SimPointsModal scadaCode={scadaCode} onClose={() => setShowSimManager(false)} />
  ) : null

  // ── Render by displayMode ──────────────────────────────────────────────────

  if (displayMode === 'right') {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000 }} />
        <div onKeyDown={stopKeyboardBubble} style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 10001,
          width: 360,
          background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-strong)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
        }}>
          {panelHeader}
          {panelBody}
          {panelFooter}
        </div>
        {simManager}
      </>
    )
  }

  if (displayMode === 'float') {
    return (
      <>
        <div ref={floatRef} onKeyDown={stopKeyboardBubble} style={{
          position: 'fixed', zIndex: 10001,
          left: floatPos.x, top: floatPos.y,
          width: floatSize.w, height: floatSize.h,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {panelHeader}
          {panelBody}
          {panelFooter}
          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            style={{
              position: 'absolute', right: 0, bottom: 0, width: 14, height: 14,
              cursor: 'nwse-resize',
              background: 'transparent',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 10 10" style={{ position: 'absolute', right: 2, bottom: 2, opacity: 0.3 }}>
              <path d="M8 2L2 8M5 2L2 5M8 5L5 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </div>
        </div>
        {simManager}
      </>
    )
  }

  // bottom drawer (default)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000 }} />
      <div onKeyDown={stopKeyboardBubble} style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001,
        background: 'var(--bg-panel)', borderTop: '1px solid var(--border-strong)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)', borderRadius: '12px 12px 0 0',
        maxHeight: '70vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
        </div>
        {panelHeader}
        {panelBody}
        {panelFooter}
      </div>
      {simManager}
    </>
  )
}
