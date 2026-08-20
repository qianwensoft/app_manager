import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'
import { scadaApi } from '@/api/scada'
import { getChartSchema, type StyleFieldDef } from '@/schema/chartSchema'
import type {
  CanvasElement, TableColumn, ElementEvent, FormFieldRule, FormFieldReaction,
  ElementAnimation, PointBinding, DataBindingMode, DateTimeConfig,
  GroupParamSpec, VirtualLayoutConfig,
} from '@/types'
import type { ScadaWorkflow } from '@/types/workflow'
import { generateId } from '@/utils/canvas'
import {
  DATETIME_PRESETS, DATETIME_TOKENS, formatDate, parseAnyToDate, defaultDateTimeConfig,
} from '@/runtime/dateTimeFormat'
import { scanElementsForTemplateParams } from '@/runtime/groupParamScan'

/* ── Shared input ── */
const Inp = ({ val, onChange, type = 'text', placeholder = '' }: {
  val: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) => (
  <input
    type={type}
    value={val}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%', height: 26,
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      color: 'var(--text-primary)',
      padding: '0 6px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      outline: 'none',
      transition: 'border-color var(--duration-fast)',
      fontFamily: type === 'number' ? 'var(--font-mono)' : 'inherit',
    }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
  />
)

/* ── Color picker ── */
const ColorPicker = ({ val, onChange }: { val: string; onChange: (v: string) => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <input
      type="color"
      value={val}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 26, height: 26,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-base)',
        cursor: 'pointer', padding: 2,
      }}
    />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{val}</span>
  </div>
)

/* ── Toggle ── */
const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: checked ? 'var(--accent)' : 'var(--bg-overlay)',
        border: `1px solid ${checked ? 'var(--accent-dim)' : 'var(--border-strong)'}`,
        position: 'relative', cursor: 'pointer',
        transition: 'all var(--duration-base)',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 'calc(100% - 16px)' : '2px',
        width: 12, height: 12, borderRadius: '50%',
        background: '#fff',
        transition: 'left var(--duration-base)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
    {label && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>}
  </label>
)

/* ── Collapsible section ── */
const Section = ({ title, children, defaultOpen = true, accent = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; accent?: boolean
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 10px', background: 'var(--bg-surface)',
          border: 'none', cursor: 'pointer',
          color: accent ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          transition: 'color var(--duration-fast)',
        }}
      >
        {title}
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Property row ── */
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="prop-row">
    <span className="prop-label">{label}</span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
)

/* ── XY pair ── */
const PairRow = ({ l1, v1, l2, v2, on1, on2 }: {
  l1: string; v1: number; l2: string; v2: number
  on1: (v: string) => void; on2: (v: string) => void
}) => (
  <div style={{ display: 'flex', gap: 5 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em' }}>{l1}</div>
      <Inp val={Math.round(v1)} onChange={on1} type="number" />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em' }}>{l2}</div>
      <Inp val={Math.round(v2)} onChange={on2} type="number" />
    </div>
  </div>
)

/* ── 表达式自动补全输入框 ── */
type ExprSuggestion = {
  /** 显示的标签 */
  label: string
  /** 分类说明 */
  hint: string
  /** 实际插入的文本 */
  insert: string
  /** 插入后光标相对末尾的偏移（负数表示回退，用于定位到括号内） */
  cursorOffset?: number
}

function ExpressionAutocompleteInput({ value, onChange, placeholder, extDataKeys, elementNames }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  extDataKeys: string[]
  elementNames: string[]
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [caret, setCaret] = useState(0)

  // 内置变量与函数建议
  const baseSuggestions: ExprSuggestion[] = [
    { label: 'v', hint: '绑定值', insert: 'v' },
    { label: 'text', hint: '显示文本', insert: 'text' },
    { label: 'Number()', hint: '转数字', insert: 'Number()', cursorOffset: -1 },
    { label: 'String()', hint: '转文本', insert: 'String()', cursorOffset: -1 },
    { label: 'Math.abs()', hint: '绝对值', insert: 'Math.abs()', cursorOffset: -1 },
    { label: 'Math.max()', hint: '最大值', insert: 'Math.max()', cursorOffset: -1 },
    { label: 'Math.min()', hint: '最小值', insert: 'Math.min()', cursorOffset: -1 },
  ]

  // 计算光标前正在输入的 token（含点号，如 ext.ma）
  const getToken = (text: string, pos: number): { token: string; start: number } => {
    let start = pos
    while (start > 0 && /[A-Za-z0-9_.$']/.test(text[start - 1])) start--
    return { token: text.slice(start, pos), start }
  }

  // 根据当前 token 生成建议列表
  const buildSuggestions = (text: string, pos: number): ExprSuggestion[] => {
    const { token } = getToken(text, pos)

    // 正在输入 ext. → 提示扩展数据 key
    if (/^ext\.[A-Za-z0-9_$]*$/.test(token)) {
      const partial = token.slice(4).toLowerCase()
      return extDataKeys
        .filter((k) => k.toLowerCase().startsWith(partial))
        .map((k) => ({ label: `ext.${k}`, hint: '扩展数据', insert: `ext.${k}` }))
    }

    // 正在输入 el( → 提示其他组件名
    const beforeCaret = text.slice(0, pos)
    const elMatch = beforeCaret.match(/el\(\s*'([^')]*)$/)
    if (elMatch) {
      const partial = elMatch[1].toLowerCase()
      return elementNames
        .filter((n) => n.toLowerCase().includes(partial))
        .map((n) => ({
          label: n,
          hint: '组件引用',
          insert: `el('${n}', 'extData.key')`,
          cursorOffset: 0,
        }))
    }

    // 通用建议：内置变量/函数 + ext + el 模板
    const all: ExprSuggestion[] = [
      ...baseSuggestions,
      { label: 'ext.', hint: '扩展数据', insert: 'ext.', cursorOffset: 0 },
      { label: "el('名称','extData.key')", hint: '其他组件', insert: "el('名称', 'extData.key')", cursorOffset: 0 },
    ]
    if (!token) return all
    const lower = token.toLowerCase()
    return all.filter((s) => s.label.toLowerCase().includes(lower) || s.insert.toLowerCase().includes(lower))
  }

  const suggestions = open ? buildSuggestions(value, caret) : []

  const applySuggestion = (s: ExprSuggestion) => {
    const ta = taRef.current
    const pos = ta ? ta.selectionStart : caret

    // 计算要替换的 token 范围
    const beforeCaret = value.slice(0, pos)
    const elMatch = beforeCaret.match(/el\(\s*'([^')]*)$/)
    let start: number
    if (elMatch && !s.insert.startsWith('el(') && s.hint === '组件引用') {
      // el(' 场景：只替换 el(' 后的部分名称，并补上完整模板
      start = pos - elMatch[1].length
      const head = value.slice(0, beforeCaret.lastIndexOf('el('))
      const tail = value.slice(pos)
      // 去掉已输入的 el(' 前缀，用完整模板替换
      const newVal = head + s.insert + tail
      const cursorPos = head.length + s.insert.length + (s.cursorOffset ?? 0)
      onChange(newVal)
      requestAnimationFrame(() => {
        if (taRef.current) {
          taRef.current.focus()
          taRef.current.setSelectionRange(cursorPos, cursorPos)
        }
      })
      setOpen(false)
      return
    } else {
      start = getToken(value, pos).start
    }

    const newVal = value.slice(0, start) + s.insert + value.slice(pos)
    const cursorPos = start + s.insert.length + (s.cursorOffset ?? 0)
    onChange(newVal)
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus()
        taRef.current.setSelectionRange(cursorPos, cursorPos)
      }
    })
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || suggestions.length === 0) {
      // Ctrl/Cmd + Space 手动唤起
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault()
        setCaret(taRef.current?.selectionStart ?? 0)
        setActiveIdx(0)
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
          setActiveIdx(0)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        onClick={() => setCaret(taRef.current?.selectionStart ?? 0)}
        onFocus={() => { setCaret(taRef.current?.selectionStart ?? 0); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={2}
        spellCheck={false}
        style={{
          width: '100%', fontSize: 10, padding: '4px',
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', borderRadius: 3, fontFamily: 'var(--font-mono)',
          resize: 'vertical',
        }}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            marginTop: 2, maxHeight: 180, overflowY: 'auto',
            background: 'var(--bg-base)', border: '1px solid var(--accent)',
            borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 10,
                background: i === activeIdx ? 'var(--accent)' : 'transparent',
                color: i === activeIdx ? '#fff' : 'var(--text-primary)',
              }}
            >
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{s.label}</code>
              <span style={{ fontSize: 8, opacity: 0.7, flexShrink: 0 }}>{s.hint}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 条件颜色规则编辑器 ── */
function ConditionalColorRulesEditor({ rules, onChange, propertyLabel, extDataKeys = [], elementNames = [] }: {
  rules: Array<{ condition: string; color: string; label?: string }>
  onChange: (rules: Array<{ condition: string; color: string; label?: string }>) => void
  propertyLabel: string
  extDataKeys?: string[]
  elementNames?: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  const addRule = () => {
    onChange([...rules, { condition: '', color: '#ff0000', label: '' }])
    setExpanded(true)
  }

  const updateRule = (index: number, field: 'condition' | 'color' | 'label', value: string) => {
    const updated = [...rules]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index))
  }

  const moveRule = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === rules.length - 1)) return
    const updated = [...rules]
    const target = direction === 'up' ? index - 1 : index + 1
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    onChange(updated)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
          {propertyLabel} ({rules.length})
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {rules.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: '2px 6px', fontSize: 9, cursor: 'pointer',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', borderRadius: 3,
              }}
            >
              {expanded ? '收起' : '展开'}
            </button>
          )}
          <button
            onClick={addRule}
            style={{
              padding: '2px 6px', fontSize: 9, cursor: 'pointer',
              background: 'var(--accent)', border: 'none',
              color: '#fff', borderRadius: 3,
            }}
          >
            + 添加规则
          </button>
        </div>
      </div>

      {expanded && rules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
          {rules.map((rule, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6, background: 'var(--bg-surface)', borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>规则 {index + 1}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={() => moveRule(index, 'up')}
                    disabled={index === 0}
                    style={{
                      width: 18, height: 18, padding: 0, cursor: index === 0 ? 'not-allowed' : 'pointer',
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: index === 0 ? 'var(--border)' : 'var(--text-muted)', borderRadius: 2, fontSize: 10,
                    }}
                  >↑</button>
                  <button
                    onClick={() => moveRule(index, 'down')}
                    disabled={index === rules.length - 1}
                    style={{
                      width: 18, height: 18, padding: 0, cursor: index === rules.length - 1 ? 'not-allowed' : 'pointer',
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: index === rules.length - 1 ? 'var(--border)' : 'var(--text-muted)', borderRadius: 2, fontSize: 10,
                    }}
                  >↓</button>
                  <button
                    onClick={() => removeRule(index)}
                    style={{
                      width: 18, height: 18, padding: 0, cursor: 'pointer',
                      background: 'transparent', border: 'none',
                      color: 'var(--danger)', borderRadius: 2, fontSize: 14, lineHeight: 1,
                    }}
                  >×</button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>规则名称（可选）</div>
                <input
                  value={rule.label ?? ''}
                  onChange={(e) => updateRule(index, 'label', e.target.value)}
                  placeholder="如：高温告警"
                  style={{
                    width: '100%', height: 22, fontSize: 10, padding: '0 4px',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', borderRadius: 3,
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>
                  条件表达式 <span style={{ opacity: 0.6 }}>（输入触发提示，↑↓ 选择，Enter 确认）</span>
                </div>
                <ExpressionAutocompleteInput
                  value={rule.condition}
                  onChange={(v) => updateRule(index, 'condition', v)}
                  placeholder="如：Number(text) > Number(ext.max)"
                  extDataKeys={extDataKeys}
                  elementNames={elementNames}
                />
              </div>

              <div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>颜色</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={rule.color}
                    onChange={(e) => updateRule(index, 'color', e.target.value)}
                    style={{
                      width: 32, height: 24, cursor: 'pointer',
                      border: '1px solid var(--border)', borderRadius: 3,
                    }}
                  />
                  <input
                    type="text"
                    value={rule.color}
                    onChange={(e) => updateRule(index, 'color', e.target.value)}
                    style={{
                      flex: 1, height: 24, fontSize: 10, padding: '0 4px',
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 3, fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rules.length === 0 && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
          暂无规则，点击"添加规则"开始配置
        </div>
      )}
    </div>
  )
}

/* ── 扩展数据编辑器 ── */
function ExtDataEditor({ extData, onChange, allElements, currentElId }: {
  extData: Record<string, string>
  onChange: (extData: Record<string, string>) => void
  allElements: CanvasElement[]
  currentElId: string
}) {
  const entries = Object.entries(extData)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const handleAdd = () => {
    const key = newKey.trim()
    if (!key) return
    if (extData[key] !== undefined) return
    onChange({ ...extData, [key]: newValue })
    setNewKey('')
    setNewValue('')
  }

  const handleRemove = (key: string) => {
    const next = { ...extData }
    delete next[key]
    onChange(next)
  }

  const handleUpdate = (key: string, value: string) => {
    onChange({ ...extData, [key]: value })
  }

  const insertRef = (type: 'self' | 'other' | 'comp' | 'global', elName?: string) => {
    let ref: string
    if (type === 'self') ref = `{{ext:${newKey || 'key'}}}`
    else if (type === 'other') ref = `{{el:${elName || '元素名'}:${newKey || 'key'}}}`
    else if (type === 'comp') ref = `{{comp:${elName || '组件名'}:value}}`
    else ref = `{{global:${'路径'}}}`
    setNewValue((prev) => prev + ref)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={key}
                readOnly
                style={{
                  width: 80, height: 22, fontSize: 10, padding: '0 4px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', borderRadius: 3,
                }}
              />
              <input
                value={value}
                onChange={(e) => handleUpdate(key, e.target.value)}
                style={{
                  flex: 1, height: 22, fontSize: 10, padding: '0 4px',
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', borderRadius: 3,
                }}
              />
              <button
                onClick={() => handleRemove(key)}
                style={{
                  width: 22, height: 22, padding: 0, border: 'none',
                  background: 'transparent', color: 'var(--danger)', cursor: 'pointer',
                  borderRadius: 3, fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
        引用语法：<code style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 2 }}>{'{{ext:key}}'}</code> 本组件 &nbsp;
        <code style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 2 }}>{'{{el:名称:key}}'}</code> 其他组件扩展 &nbsp;
        <code style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 2 }}>{'{{comp:名称:value}}'}</code> 组件快照 &nbsp;
        <code style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 2 }}>{'{{global:a.b}}'}</code> 全局上下文
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        值支持类型化：数字/布尔/JSON 数组或对象会在解析时自动识别（如 <code style={{ background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 2 }}>[1,2,3]</code>）
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="key"
          style={{
            width: 70, height: 22, fontSize: 10, padding: '0 4px',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 3,
          }}
        />
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          style={{
            flex: 1, height: 22, fontSize: 10, padding: '0 4px',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 3,
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '0 8px', height: 22, fontSize: 10,
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 3, cursor: 'pointer',
          }}
        >+</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => insertRef('self')}
          style={{
            flex: 1, padding: '3px 0', fontSize: 10,
            background: 'var(--bg-surface)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
          }}
        >引用本组件</button>
        <select
          onChange={(e) => {
            if (e.target.value) insertRef('other', e.target.value)
            e.target.value = ''
          }}
          style={{
            flex: 1, height: 22, fontSize: 10, padding: '0 4px',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 3,
          }}
        >
          <option value="">引用其他组件扩展...</option>
          {allElements
            .filter((el) => el.id !== currentElId)
            .map((el) => (
              <option key={el.id} value={el.name}>{el.name} ({el.type})</option>
            ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          onChange={(e) => {
            if (e.target.value) insertRef('comp', e.target.value)
            e.target.value = ''
          }}
          style={{
            flex: 1, height: 22, fontSize: 10, padding: '0 4px',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 3,
          }}
        >
          <option value="">组件快照取值...</option>
          {allElements
            .filter((el) => el.id !== currentElId && el.name)
            .map((el) => (
              <option key={el.id} value={el.name}>{el.name} → value</option>
            ))}
        </select>
        <button
          onClick={() => insertRef('global')}
          style={{
            flex: 1, padding: '3px 0', fontSize: 10,
            background: 'var(--bg-surface)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
          }}
        >引用全局上下文</button>
      </div>
    </div>
  )
}

/* ── 日期时间引导式配置 ── */
function DateTimeConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: keyof CanvasElement, value: unknown) => void
}) {
  const dt = el.dateTime
  const enabled = !!dt?.enabled
  const cfg: DateTimeConfig = dt ?? defaultDateTimeConfig()
  const formatRef = useRef<HTMLInputElement>(null)

  const patch = (partial: Partial<DateTimeConfig>) => {
    const base: DateTimeConfig = dt ?? defaultDateTimeConfig()
    onUpdate('dateTime', { ...base, ...partial })
  }

  // 实时预览：current 用系统时间；data 用一个示例时间戳
  const sampleDate = (cfg.source ?? 'current') === 'current'
    ? new Date()
    : (parseAnyToDate(Date.now(), cfg.inputType ?? 'auto') ?? new Date())
  let preview = ''
  try {
    preview = formatDate(sampleDate, cfg.format || 'YYYY-MM-DD HH:mm:ss', cfg.locale ?? 'zh')
  } catch {
    preview = '(格式无效)'
  }

  const insertToken = (token: string) => {
    const input = formatRef.current
    const current = cfg.format ?? ''
    if (input && typeof input.selectionStart === 'number') {
      const s = input.selectionStart
      const e = input.selectionEnd ?? s
      patch({ format: current.slice(0, s) + token + current.slice(e) })
      requestAnimationFrame(() => {
        input.focus()
        const pos = s + token.length
        input.setSelectionRange(pos, pos)
      })
    } else {
      patch({ format: current + token })
    }
  }

  const chipStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 7px', cursor: 'pointer',
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
  }
  const dtSelectStyle: React.CSSProperties = {
    width: '100%', height: 26, background: 'var(--bg-base)',
    border: '1px solid var(--border)', color: 'var(--text-primary)',
    borderRadius: 'var(--radius-sm)', fontSize: 11, padding: '0 4px', outline: 'none',
  }

  return (
    <Section title="日期时间" defaultOpen={enabled}>
      <Row label="启用">
        <Toggle
          checked={enabled}
          onChange={(v) => {
            if (v) patch({ enabled: true })
            else onUpdate('dateTime', { ...cfg, enabled: false })
          }}
          label={enabled ? '按日期时间显示' : '普通文本'}
        />
      </Row>

      {enabled && (
        <>
          {/* 实时预览 */}
          <div style={{
            margin: '2px 0 4px', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-base)', border: '1px dashed var(--border-accent, var(--border))',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: '0.06em' }}>预览</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{preview || '--'}</div>
          </div>

          <Row label="数据来源">
            <select
              value={cfg.source ?? 'current'}
              onChange={(e) => patch({ source: e.target.value as DateTimeConfig['source'] })}
              style={dtSelectStyle}
            >
              <option value="current">当前系统时间（自动刷新）</option>
              <option value="data">绑定数据（解析为时间）</option>
            </select>
          </Row>

          {/* 快捷格式预设 */}
          <div>
            <div style={labelStyle}>常用格式</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DATETIME_PRESETS.map((p) => {
                const active = (cfg.format ?? '') === p.format
                return (
                  <button
                    key={p.format}
                    type="button"
                    onClick={() => patch({ format: p.format })}
                    title={p.format}
                    style={{
                      ...chipStyle,
                      ...(active ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-muted)' } : {}),
                    }}
                  >{p.label}</button>
                )
              })}
            </div>
          </div>

          {/* 格式串（可手动编辑 + 令牌插入） */}
          <div>
            <div style={labelStyle}>格式串</div>
            <input
              ref={formatRef}
              value={cfg.format ?? ''}
              placeholder="YYYY-MM-DD HH:mm:ss"
              onChange={(e) => patch({ format: e.target.value })}
              style={{
                width: '100%', height: 26, background: 'var(--bg-base)',
                border: '1px solid var(--border)', color: 'var(--text-primary)',
                padding: '0 6px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                outline: 'none', fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* 令牌插入 */}
          <div>
            <div style={labelStyle}>点击插入字段</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DATETIME_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertToken(t.token)}
                  title={`${t.desc} 示例 ${t.sample}`}
                  style={{ ...chipStyle, fontFamily: 'var(--font-mono)' }}
                >{t.token}</button>
              ))}
            </div>
          </div>

          <Row label="语言">
            <select
              value={cfg.locale ?? 'zh'}
              onChange={(e) => patch({ locale: e.target.value as DateTimeConfig['locale'] })}
              style={dtSelectStyle}
            >
              <option value="zh">中文（星期/月名）</option>
              <option value="en">英文（星期/月名）</option>
            </select>
          </Row>

          {(cfg.source ?? 'current') === 'current' ? (
            <Row label="刷新(ms)">
              <Inp
                val={cfg.refreshMs ?? 1000}
                type="number"
                onChange={(v) => patch({ refreshMs: Math.max(200, Number(v) || 1000) })}
              />
            </Row>
          ) : (
            <>
              <Row label="输入类型">
                <select
                  value={cfg.inputType ?? 'auto'}
                  onChange={(e) => patch({ inputType: e.target.value as DateTimeConfig['inputType'] })}
                  style={dtSelectStyle}
                >
                  <option value="auto">自动识别（时间戳/字符串）</option>
                  <option value="unix_s">Unix 秒级时间戳</option>
                  <option value="unix_ms">Unix 毫秒时间戳</option>
                  <option value="iso">ISO / 日期字符串</option>
                  <option value="string">普通日期字符串</option>
                </select>
              </Row>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                自动识别：10 位按秒、13 位按毫秒解析；非数字按日期字符串解析。数据来源取自本元件的数据绑定。
              </div>
            </>
          )}

          <Row label="无值占位">
            <Inp
              val={cfg.fallback ?? ''}
              placeholder="--"
              onChange={(v) => patch({ fallback: v })}
            />
          </Row>
        </>
      )}
    </Section>
  )
}

/* ── Image resource section with upload ── */
function ImageResourceSection({ imageUrl, onUpdate }: { imageUrl?: string; onUpdate: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await scadaApi.uploadResource(file, 'image')
      onUpdate(res.url)
    } catch {
      // ignore
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <Section title="图片资源">
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 4, marginBottom: 4, background: '#111' }}
        />
      )}
      <Row label="图片URL">
        <Inp val={imageUrl || ''} onChange={onUpdate} placeholder="/images/bg/bg01.jpg" />
      </Row>
      <div style={{ marginTop: 4 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          {uploading ? '上传中…' : '上传图片'}
        </button>
      </div>
    </Section>
  )
}

// ── Chart Config Section ──────────────────────────────────────────────────────

function ChartConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const schema = getChartSchema(el.type)
  if (!schema) return null

  const cfg = (el.properties?.chartConfig ?? {}) as Record<string, unknown>

  const setField = (field: StyleFieldDef, value: unknown) => {
    onUpdate('properties', {
      ...el.properties,
      chartConfig: { ...cfg, [field.key]: value },
    })
  }

  // group fields by field.group
  const groups: Record<string, StyleFieldDef[]> = {}
  for (const f of schema.styleFields) {
    const g = f.group ?? '其他'
    if (!groups[g]) groups[g] = []
    groups[g].push(f)
  }

  return (
    <>
      {Object.entries(groups).map(([groupName, fields]) => (
        <Section key={groupName} title={groupName} defaultOpen={groupName === '标题' ? false : true}>
          {fields.map((f) => {
            const val = cfg[f.key] !== undefined ? cfg[f.key] : f.default
            if (f.type === 'color') {
              return (
                <Row key={f.key} label={f.label}>
                  <ColorPicker
                    val={typeof val === 'string' && val !== 'transparent' ? val : '#000000'}
                    onChange={(v) => setField(f, v)}
                  />
                </Row>
              )
            }
            if (f.type === 'boolean') {
              return (
                <Row key={f.key} label={f.label}>
                  <Toggle
                    checked={!!val}
                    onChange={(v) => setField(f, v)}
                    label={val ? '开' : '关'}
                  />
                </Row>
              )
            }
            if (f.type === 'select' && f.options) {
              return (
                <Row key={f.key} label={f.label}>
                  <select
                    value={String(val)}
                    onChange={(e) => setField(f, e.target.value)}
                    style={{
                      width: '100%', height: 26,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                      fontSize: 11, padding: '0 4px', outline: 'none',
                    }}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Row>
              )
            }
            // text / number
            return (
              <Row key={f.key} label={f.label}>
                <Inp
                  val={f.type === 'number' ? Number(val) : String(val ?? '')}
                  type={f.type === 'number' ? 'number' : 'text'}
                  onChange={(v) => setField(f, f.type === 'number' ? Number(v) : v)}
                  placeholder={f.hint ?? ''}
                />
              </Row>
            )
          })}
        </Section>
      ))}
    </>
  )
}

// ── Table Config Section ──────────────────────────────────────────────────────

function TableConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const cols: TableColumn[] = el.tableColumns ?? []
  const rows: Record<string, unknown>[] = el.tableData ?? []

  const setCol = (i: number, patch: Partial<TableColumn>) => {
    const next = cols.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onUpdate('tableColumns', next)
  }

  const addCol = () => {
    onUpdate('tableColumns', [...cols, { key: `col${cols.length + 1}`, title: `列${cols.length + 1}`, align: 'left' }])
  }

  const removeCol = (i: number) => {
    onUpdate('tableColumns', cols.filter((_, idx) => idx !== i))
  }

  const moveCol = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cols.length) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    onUpdate('tableColumns', next)
  }

  const setCell = (rowIdx: number, key: string, val: string) => {
    const next = rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r)
    onUpdate('tableData', next)
  }

  const addRow = () => {
    const empty: Record<string, unknown> = {}
    cols.forEach((c) => { empty[c.key] = '' })
    onUpdate('tableData', [...rows, empty])
  }

  const removeRow = (i: number) => {
    onUpdate('tableData', rows.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>列配置</div>
      {cols.map((col, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 7px', marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>列 {i + 1}</span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={() => moveCol(i, -1)} disabled={i === 0} style={btnStyle}>↑</button>
              <button onClick={() => moveCol(i, 1)} disabled={i === cols.length - 1} style={btnStyle}>↓</button>
              <button onClick={() => removeCol(i)} style={{ ...btnStyle, color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>标题</div>
                <Inp val={col.title} onChange={(v) => setCol(i, { title: v })} placeholder="列标题" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>字段键</div>
                <Inp val={col.key} onChange={(v) => setCol(i, { key: v })} placeholder="field_key" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>宽度(px)</div>
                <Inp val={col.width ?? ''} type="number" onChange={(v) => setCol(i, { width: v ? Number(v) : undefined })} placeholder="自动" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>合并列数</div>
                <Inp val={col.colSpan ?? 1} type="number" onChange={(v) => setCol(i, { colSpan: Number(v) || 1 })} placeholder="1" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>对齐</div>
                <select
                  value={col.align ?? 'left'}
                  onChange={(e) => setCol(i, { align: e.target.value as TableColumn['align'] })}
                  style={selectStyle}
                >
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addCol} style={{
        width: '100%', padding: '5px 0', cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px dashed var(--border-accent)',
        borderRadius: 'var(--radius-sm)', fontSize: 11,
      }}>
        + 添加列
      </button>

      {/* ── Static data rows ── */}
      {cols.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>静态数据</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} style={{
                      padding: '3px 4px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap', fontSize: 9,
                    }}>{c.title}</th>
                  ))}
                  <th style={{ width: 18 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {cols.map((c) => (
                      <td key={c.key} style={{ padding: '2px 2px' }}>
                        <input
                          value={String(row[c.key] ?? '')}
                          onChange={(e) => setCell(ri, c.key, e.target.value)}
                          style={{
                            width: '100%', height: 22, fontSize: 10,
                            background: 'var(--bg-base)', border: '1px solid var(--border)',
                            color: 'var(--text-primary)', borderRadius: 3,
                            padding: '0 4px', outline: 'none', fontFamily: 'inherit',
                            boxSizing: 'border-box',
                          }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '2px 2px', textAlign: 'center' }}>
                      <button onClick={() => removeRow(ri)} style={{ ...btnStyle, color: 'var(--danger)', width: 18, height: 18 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} style={{
            width: '100%', marginTop: 4, padding: '4px 0', cursor: 'pointer',
            background: 'var(--bg-base)', color: 'var(--text-muted)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-sm)', fontSize: 10,
          }}>
            + 添加行
          </button>
        </div>
      )}
    </div>
  )
}

// ── Form Field Config Section ─────────────────────────────────────────────────
// ── Form field config — multi-tab (属性 | 校验 | 联动) ────────────────────────

const RULE_TYPE_OPTIONS = [
  { value: '', label: '自定义' },
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: '手机号' },
  { value: 'idcard', label: '身份证' },
  { value: 'pattern', label: '正则' },
]

const miniInput: React.CSSProperties = {
  width: '100%', height: 22,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', padding: '0 4px',
  borderRadius: 'var(--radius-sm)', fontSize: 10, outline: 'none', boxSizing: 'border-box',
}

function RuleEditor({ rules, onChange }: { rules: FormFieldRule[]; onChange: (r: FormFieldRule[]) => void }) {
  const addRule = () => onChange([...rules, {}])
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i))
  const upd = (i: number, p: Partial<FormFieldRule>) => onChange(rules.map((r, idx) => idx === i ? { ...r, ...p } : r))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rules.map((rule, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 4, position: 'relative',
        }}>
          <button onClick={() => remove(i)} style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>类型</div>
              <select value={rule.type ?? ''} onChange={(e) => upd(i, { type: (e.target.value || undefined) as FormFieldRule['type'] })} style={{ ...miniInput, cursor: 'pointer' }}>
                {RULE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>错误消息</div>
              <input value={rule.message ?? ''} onChange={(e) => upd(i, { message: e.target.value || undefined })} placeholder="自动" style={miniInput} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>最小</div>
              <input type="number" value={rule.min ?? ''} onChange={(e) => upd(i, { min: e.target.value ? Number(e.target.value) : undefined })} style={miniInput} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>最大</div>
              <input type="number" value={rule.max ?? ''} onChange={(e) => upd(i, { max: e.target.value ? Number(e.target.value) : undefined })} style={miniInput} />
            </div>
          </div>
          {rule.type === 'pattern' && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>正则</div>
              <input value={rule.pattern ?? ''} onChange={(e) => upd(i, { pattern: e.target.value || undefined })} placeholder="^\d+$" style={miniInput} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>自定义 <span style={{ opacity: 0.6 }}>(v,rule)=&gt;true|'msg'</span></div>
            <input value={rule.validator ?? ''} onChange={(e) => upd(i, { validator: e.target.value || undefined })} placeholder="(v)=>v>0||'必须>0'" style={miniInput} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!rule.required} onChange={(e) => upd(i, { required: e.target.checked })} style={{ width: 10, height: 10 }} />
            触发必填
          </label>
        </div>
      ))}
      <button onClick={addRule} style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer', textAlign: 'left' }}>
        + 添加规则
      </button>
    </div>
  )
}

function ReactionEditor({ reactions, onChange }: { reactions: FormFieldReaction[]; onChange: (r: FormFieldReaction[]) => void }) {
  const add = () => onChange([...reactions, { watch: '' }])
  const remove = (i: number) => onChange(reactions.filter((_, idx) => idx !== i))
  const upd = (i: number, p: Partial<FormFieldReaction>) => onChange(reactions.map((r, idx) => idx === i ? { ...r, ...p } : r))
  const updState = (i: number, branch: 'fulfill' | 'otherwise', key: string, val: unknown) => {
    const r = reactions[i]
    const existing = r[branch]?.state ?? {}
    upd(i, { [branch]: { ...r[branch], state: { ...existing, [key]: val === '' ? undefined : val } } })
  }
  const stateVal = (r: FormFieldReaction, branch: 'fulfill' | 'otherwise', key: string): unknown =>
    (r[branch]?.state as Record<string, unknown> | undefined)?.[key] ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {reactions.map((r, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '8px', position: 'relative',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <button onClick={() => remove(i)} style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>监听字段键 (watch)</div>
            <input value={r.watch} onChange={(e) => upd(i, { watch: e.target.value })} placeholder="other_field_key" style={miniInput} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>触发条件 <span style={{ opacity: 0.6 }}>($deps[0])=&gt;bool，空=非空即触发</span></div>
            <input value={r.when ?? ''} onChange={(e) => upd(i, { when: e.target.value || undefined })} placeholder="$deps[0]==='是'" style={miniInput} />
          </div>
          {(['fulfill', 'otherwise'] as const).map((branch) => (
            <div key={branch} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 6px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>{branch === 'fulfill' ? '✓ 触发时' : '✗ 否则'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>显示</div>
                  <select
                    value={stateVal(r, branch, 'visible') as string}
                    onChange={(e) => updState(i, branch, 'visible', e.target.value === '' ? undefined : e.target.value === 'true')}
                    style={{ ...miniInput, cursor: 'pointer' }}
                  >
                    <option value="">不变</option>
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>必填</div>
                  <select
                    value={stateVal(r, branch, 'required') as string}
                    onChange={(e) => updState(i, branch, 'required', e.target.value === '' ? undefined : e.target.value === 'true')}
                    style={{ ...miniInput, cursor: 'pointer' }}
                  >
                    <option value="">不变</option>
                    <option value="true">必填</option>
                    <option value="false">非必填</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>赋值 <span style={{ opacity: 0.6 }}>JS表达式，$deps[0]=监听值</span></div>
                <input
                  value={stateVal(r, branch, 'value') as string}
                  onChange={(e) => updState(i, branch, 'value', e.target.value || undefined)}
                  placeholder="$deps[0]+'_suffix'"
                  style={miniInput}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
      <button onClick={add} style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer', textAlign: 'left' }}>
        + 添加联动
      </button>
    </div>
  )
}

const HAS_OPTIONS = new Set(['form-select', 'form-radio', 'form-checkbox'])

function FormFieldConfigSection({ el, onUpdate }: { el: CanvasElement; onUpdate: (k: keyof CanvasElement, v: unknown) => void }) {
  const [tab, setTab] = useState<'props' | 'validate' | 'reactions'>('props')
  const isSubmit = el.type === 'form-submit'

  const tabSt = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '4px 0', fontSize: 11, border: 'none', cursor: 'pointer',
    background: active ? 'var(--bg-panel)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
        <button style={tabSt(tab === 'props')} onClick={() => setTab('props')}>属性</button>
        {!isSubmit && <button style={tabSt(tab === 'validate')} onClick={() => setTab('validate')}>校验</button>}
        {!isSubmit && <button style={tabSt(tab === 'reactions')} onClick={() => setTab('reactions')}>联动</button>}
      </div>

      {/* 属性 tab */}
      {tab === 'props' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row label="表单组 ID">
            <Inp val={el.formGroupId ?? ''} onChange={(v) => onUpdate('formGroupId', v || undefined)} placeholder="form1" />
          </Row>
          {!isSubmit && (
            <>
              <Row label="字段键">
                <Inp val={el.formFieldKey ?? ''} onChange={(v) => onUpdate('formFieldKey', v || undefined)} placeholder="field_key" />
              </Row>
              <Row label="标签">
                <Inp val={el.formFieldLabel ?? ''} onChange={(v) => onUpdate('formFieldLabel', v || undefined)} placeholder="字段标签" />
              </Row>
              <Row label="占位符">
                <Inp val={el.formFieldPlaceholder ?? ''} onChange={(v) => onUpdate('formFieldPlaceholder', v || undefined)} placeholder="请输入…" />
              </Row>
              <Row label="默认值">
                <Inp val={el.formFieldDefaultValue ?? ''} onChange={(v) => onUpdate('formFieldDefaultValue', v || undefined)} />
              </Row>
              {HAS_OPTIONS.has(el.type) && (
                <Row label="选项">
                  <Inp val={el.formFieldOptions ?? ''} onChange={(v) => onUpdate('formFieldOptions', v || undefined)} placeholder="A,B,C" />
                </Row>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!el.formFieldRequired} onChange={(e) => onUpdate('formFieldRequired', e.target.checked)} style={{ width: 12, height: 12 }} />
                必填
              </label>
            </>
          )}
          {isSubmit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>提交目标</div>
              <Row label="应用 ID">
                <Inp val={el.formSubmitAppId ?? ''} type="number" onChange={(v) => onUpdate('formSubmitAppId', v ? Number(v) : undefined)} placeholder="App.id" />
              </Row>
              <Row label="Webhook ID">
                <Inp val={el.formSubmitWebhookId ?? ''} type="number" onChange={(v) => onUpdate('formSubmitWebhookId', v ? Number(v) : undefined)} placeholder="Webhook.id" />
              </Row>
              <Row label="附加参数">
                <Inp val={el.formSubmitParamJson ?? ''} onChange={(v) => onUpdate('formSubmitParamJson', v || undefined)} placeholder='{"key":"val"}' />
              </Row>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                  提交前脚本 <span style={{ opacity: 0.6 }}>async(data)=&gt;...</span>
                </div>
                <textarea
                  value={el.formBeforeScript ?? ''}
                  onChange={(e) => onUpdate('formBeforeScript', e.target.value || undefined)}
                  placeholder={'// return data;    继续提交\n// return false;   取消\n// throw \'reason\'; 中止并提示'}
                  rows={5}
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none',
                    fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 校验 tab */}
      {tab === 'validate' && !isSubmit && (
        <RuleEditor
          rules={el.formFieldRules ?? []}
          onChange={(r) => onUpdate('formFieldRules', r.length ? r : undefined)}
        />
      )}

      {/* 联动 tab */}
      {tab === 'reactions' && !isSubmit && (
        <ReactionEditor
          reactions={el.formFieldReactions ?? []}
          onChange={(r) => onUpdate('formFieldReactions', r.length ? r : undefined)}
        />
      )}
    </div>
  )
}

// ── Layout Config Section ─────────────────────────────────────────────────────

function LayoutConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const project = useEditorStore((s) => s.project)
  const canvasList = Object.values(project.canvases)

  if (el.type === 'layout-carousel') {
    const slides = el.layoutSlides ?? 3
    const slideCanvases = el.layoutSlideCanvases ?? []

    const setSlideCanvas = (i: number, canvasId: number) => {
      const next = [...slideCanvases]
      next[i] = canvasId
      onUpdate('layoutSlideCanvases', next)
    }

    return (
      <Section title="轮播配置">
        <Row label="幻灯片数">
          <Inp val={slides} type="number" onChange={(v) => onUpdate('layoutSlides', Math.max(1, Number(v)))} />
        </Row>
        <Row label="切换间隔(ms)">
          <Inp val={el.layoutInterval ?? 3000} type="number" onChange={(v) => onUpdate('layoutInterval', Number(v))} placeholder="0=手动" />
        </Row>
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>幻灯片绑定画布</div>
          {Array.from({ length: slides }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, flexShrink: 0 }}>第 {i + 1} 页</span>
              <select
                value={slideCanvases[i] ?? ''}
                onChange={(e) => setSlideCanvas(i, Number(e.target.value))}
                style={selectStyle}
              >
                <option value="">— 不绑定 —</option>
                {canvasList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Section>
    )
  }

  if (el.type === 'layout-tabs') {
    const labels = el.layoutTabLabels ?? ['Tab 1', 'Tab 2', 'Tab 3']
    const tabCanvases = el.layoutTabCanvases ?? []

    const setTabLabel = (i: number, label: string) => {
      const next = [...labels]
      next[i] = label
      onUpdate('layoutTabLabels', next)
    }
    const setTabCanvas = (i: number, canvasId: number) => {
      const next = [...tabCanvases]
      next[i] = canvasId
      onUpdate('layoutTabCanvases', next)
    }
    const addTab = () => onUpdate('layoutTabLabels', [...labels, `Tab ${labels.length + 1}`])
    const removeTab = (i: number) => {
      onUpdate('layoutTabLabels', labels.filter((_, idx) => idx !== i))
      onUpdate('layoutTabCanvases', tabCanvases.filter((_, idx) => idx !== i))
    }

    return (
      <Section title="标签页配置">
        {labels.map((label, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <Inp val={label} onChange={(v) => setTabLabel(i, v)} placeholder={`Tab ${i + 1}`} />
              <button type="button" onClick={() => removeTab(i)} style={{ fontSize: 10, padding: '2px 6px' }}>删</button>
            </div>
            <select value={tabCanvases[i] ?? ''} onChange={(e) => setTabCanvas(i, Number(e.target.value))} style={selectStyle}>
              <option value="">— 不绑定 —</option>
              {canvasList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ))}
        <button type="button" onClick={addTab} style={{ fontSize: 10, marginTop: 4 }}>+ 添加标签</button>
      </Section>
    )
  }

  if (el.type === 'layout-collapse') {
    return (
      <Section title="折叠面板配置">
        <Row label="标题">
          <Inp val={el.layoutCollapseTitle ?? ''} onChange={(v) => onUpdate('layoutCollapseTitle', v)} placeholder="折叠标题" />
        </Row>
        <Row label="默认展开">
          <Toggle checked={el.layoutCollapseExpanded !== false} onChange={(v) => onUpdate('layoutCollapseExpanded', v)} label={el.layoutCollapseExpanded !== false ? '展开' : '折叠'} />
        </Row>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>绑定画布</div>
          <select
            value={el.layoutCollapseCanvasId ?? ''}
            onChange={(e) => onUpdate('layoutCollapseCanvasId', e.target.value ? Number(e.target.value) : undefined)}
            style={selectStyle}
          >
            <option value="">— 不绑定 —</option>
            {canvasList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Section>
    )
  }

  if (el.type === 'layout-modal') {
    return (
      <Section title="弹窗配置">
        <Row label="标题">
          <Inp val={el.layoutModalTitle ?? ''} onChange={(v) => onUpdate('layoutModalTitle', v)} placeholder="弹窗标题" />
        </Row>
        <Row label="显示关闭">
          <Toggle checked={el.layoutShowClose !== false} onChange={(v) => onUpdate('layoutShowClose', v)} label={el.layoutShowClose !== false ? '显示' : '隐藏'} />
        </Row>
        <Row label="默认显示">
          <Toggle checked={!!el.layoutModalDefaultVisible} onChange={(v) => onUpdate('layoutModalDefaultVisible', v)} label={el.layoutModalDefaultVisible ? '显示' : '隐藏'} />
        </Row>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>绑定画布（弹窗内容）</div>
          <select
            value={el.layoutModalCanvasId ?? ''}
            onChange={(e) => onUpdate('layoutModalCanvasId', e.target.value ? Number(e.target.value) : undefined)}
            style={selectStyle}
          >
            <option value="">— 不绑定 —</option>
            {canvasList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 2 }}>
          预览/发布时的初始状态。编辑模式下可通过图层面板眼睛图标切换显示。
        </div>
      </Section>
    )
  }
  return null
}

// ── Event Editor Section ──────────────────────────────────────────────────────

const EVENT_ACTIONS: { value: ElementEvent['action']; label: string }[] = [
  { value: 'open-modal',      label: '打开弹窗' },
  { value: 'close-modal',     label: '关闭弹窗' },
  { value: 'navigate-canvas', label: '跳转画布' },
  { value: 'navigate',        label: '打开链接' },
  { value: 'popup',           label: '弹出窗口' },
  { value: 'script',          label: '执行脚本' },
  { value: 'trigger-workflow', label: '触发工作流' },
]

function EventEditorSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const project = useEditorStore((s) => s.project)
  const scadaId = useEditorStore((s) => s.scadaId)
  const addWorkflow = useEditorStore((s) => s.addWorkflow)
  const navigate = useNavigate()
  const canvasList = Object.values(project.canvases)
  const modalElements = Object.values(project.canvases)
    .flatMap((c) => c.elements)
    .filter((e) => e.type === 'layout-modal')
  const workflows = project.workflows ?? []

  // 与该元素相关的工作流：以其为 component 触发源，或被 trigger-workflow 引用
  const linkedWorkflows = workflows.filter((w) => {
    if (w.source?.kind === 'component' && w.source.elementId === el.id) return true
    return (el.events ?? []).some((ev) => ev.action === 'trigger-workflow' && ev.workflowId === w.id)
  })

  const createComponentWorkflow = () => {
    const wf: ScadaWorkflow = {
      id: generateId(),
      name: `${el.name || el.type} 工作流`,
      scope: 'canvas',
      canvasId: project.activeCanvasId,
      source: { kind: 'component', elementId: el.id, event: 'click' },
      actions: [],
      graph: { nodes: [], edges: [] },
      enabled: true,
    }
    addWorkflow(wf)
    if (scadaId) navigate(`/workflow/${scadaId}`)
  }

  const events: ElementEvent[] = el.events ?? []

  const setEvent = (i: number, patch: Partial<ElementEvent>) => {
    const next = events.map((ev, idx) => idx === i ? { ...ev, ...patch } : ev)
    onUpdate('events', next)
  }

  const addEvent = () => {
    onUpdate('events', [...events, { trigger: 'click', action: 'open-modal', target: '' }])
  }

  const removeEvent = (i: number) => {
    onUpdate('events', events.filter((_, idx) => idx !== i))
  }

  const targetInput = (ev: ElementEvent, i: number) => {
    if (ev.action === 'open-modal' || ev.action === 'close-modal') {
      return (
        <select value={ev.target ?? ''} onChange={(e) => setEvent(i, { target: e.target.value })} style={selectStyle}>
          <option value="">— 选择弹窗 —</option>
          {modalElements.map((m) => (
            <option key={m.id} value={m.id}>{m.layoutModalTitle || m.name || m.id}</option>
          ))}
        </select>
      )
    }
    if (ev.action === 'navigate-canvas') {
      return (
        <select value={ev.target ?? ''} onChange={(e) => setEvent(i, { target: e.target.value })} style={selectStyle}>
          <option value="">— 选择画布 —</option>
          {canvasList.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      )
    }
    if (ev.action === 'script') {
      return (
        <Inp val={ev.script ?? ''} onChange={(v) => setEvent(i, { script: v })} placeholder="alert('hello')" />
      )
    }
    if (ev.action === 'trigger-workflow') {
      return (
        <select value={ev.workflowId ?? ''} onChange={(e) => setEvent(i, { workflowId: e.target.value })} style={selectStyle}>
          <option value="">— 选择工作流 —</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name || w.id}</option>
          ))}
        </select>
      )
    }
    return (
      <Inp val={ev.target ?? ''} onChange={(v) => setEvent(i, { target: v })} placeholder="https://..." />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map((ev, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 7px', marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>事件 {i + 1}</span>
            <button onClick={() => removeEvent(i)} style={{ ...btnStyle, color: 'var(--danger)' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>触发</div>
              <select value={ev.trigger} onChange={(e) => setEvent(i, { trigger: e.target.value as ElementEvent['trigger'] })} style={selectStyle}>
                <option value="click">点击</option>
                <option value="dblclick">双击</option>
                <option value="hover">悬停</option>
                <option value="condition">条件满足</option>
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <div style={labelStyle}>动作</div>
              <select value={ev.action} onChange={(e) => setEvent(i, { action: e.target.value as ElementEvent['action'], target: '' })} style={selectStyle}>
                {EVENT_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={labelStyle}>目标</div>
            {targetInput(ev, i)}
          </div>
          <div>
            <div style={labelStyle}>
              条件 <span style={{ opacity: 0.6 }}>
                {ev.trigger === 'condition' ? '(v，空=始终触发)' : '(可选，v)'}
              </span>
            </div>
            <Inp
              val={ev.condition ?? ''}
              onChange={(v) => setEvent(i, { condition: v || undefined })}
              placeholder={ev.trigger === 'condition' ? 'v > 80' : '留空=无条件'}
            />
          </div>
        </div>
      ))}
      <button onClick={addEvent} style={{
        width: '100%', padding: '5px 0', cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px dashed var(--border-accent)',
        borderRadius: 'var(--radius-sm)', fontSize: 11,
      }}>
        + 添加事件
      </button>

      {/* 工作流绑定 */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>工作流</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{linkedWorkflows.length} 个关联</span>
        </div>
        {linkedWorkflows.map((w) => (
          <div key={w.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 7px', marginBottom: 3, borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.name || w.id}
              <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--text-muted)' }}>
                {w.source?.kind === 'component' ? '组件源' : '引用'}
              </span>
            </span>
            <button
              onClick={() => { if (scadaId) navigate(`/workflow/${scadaId}`) }}
              style={{ ...btnStyle, color: 'var(--accent)', fontSize: 9 }}
            >编辑</button>
          </div>
        ))}
        <button onClick={createComponentWorkflow} style={{
          width: '100%', padding: '5px 0', cursor: 'pointer', marginTop: 3,
          background: 'var(--bg-surface)', color: 'var(--text-secondary)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-sm)', fontSize: 11,
        }}>
          + 新建组件工作流
        </button>
      </div>
    </div>
  )
}

// ── 4-Tab 属性面板 ────────────────────────────────────────────────────────────

type PropTab = 'basic' | 'data' | 'events' | 'animation'

const PROP_TABS: { id: PropTab; label: string }[] = [
  { id: 'basic', label: '基础' },
  { id: 'data', label: '数据' },
  { id: 'events', label: '事件' },
  { id: 'animation', label: '动画' },
]

function TabBar({ active, onChange }: { active: PropTab; onChange: (t: PropTab) => void }) {
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)', flexShrink: 0,
    }}>
      {PROP_TABS.map((tab) => {
        const on = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: on ? 700 : 500,
              letterSpacing: '0.04em',
              color: on ? 'var(--accent)' : 'var(--text-muted)',
              background: on ? 'var(--bg-panel)' : 'transparent',
              borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'color var(--duration-fast), border-color var(--duration-fast)',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function patchPointBinding(
  el: CanvasElement,
  onUpdate: (key: string, value: unknown) => void,
  patch: Partial<PointBinding>,
) {
  const mode = patch.mode ?? el.pointBinding?.mode ?? 'point'
  onUpdate('pointBinding', { ...el.pointBinding, mode, ...patch })
}

function DataBindingTabContent({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const mode = (el.pointBinding?.mode ?? 'point') as DataBindingMode

  if (el.type === 'table') {
    return (
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!el.tableStriped}
              onChange={(e) => onUpdate('tableStriped', e.target.checked)} style={{ width: 12, height: 12 }} />
            斑马纹
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={el.tableBordered !== false}
              onChange={(e) => onUpdate('tableBordered', e.target.checked)} style={{ width: 12, height: 12 }} />
            边框
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>每页</span>
            <Inp val={el.tablePageSize ?? 0} type="number"
              onChange={(v) => onUpdate('tablePageSize', Number(v))} placeholder="0=不分页" />
          </div>
        </div>
        <TableConfigSection el={el} onUpdate={onUpdate} />
        <Row label="数据来源">
          <select
            value={el.tableDataBinding?.mode ?? 'static'}
            onChange={(e) => onUpdate('tableDataBinding', { ...el.tableDataBinding, mode: e.target.value })}
            style={selectStyle}
          >
            <option value="static">静态数据</option>
            <option value="interface">数据接口</option>
          </select>
        </Row>
        {(el.tableDataBinding?.mode ?? 'static') === 'interface' && (
          <>
            <Row label="接口ID">
              <Inp
                val={el.tableDataBinding?.interfaceId ?? ''}
                type="number"
                onChange={(v) => onUpdate('tableDataBinding', { ...el.tableDataBinding, interfaceId: Number(v) })}
                placeholder="DataInterface.id"
              />
            </Row>
            <Row label="参数JSON">
              <Inp
                val={el.tableDataBinding?.paramJson ?? ''}
                onChange={(v) => onUpdate('tableDataBinding', { ...el.tableDataBinding, paramJson: v })}
                placeholder='{"key":"val"}'
              />
            </Row>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              接口返回数组自动填充行；对象取 <code style={{ fontFamily: 'var(--font-mono)' }}>data</code> 字段
            </div>
          </>
        )}
        {(el.tableDataBinding?.mode ?? 'static') === 'static' && (
          <>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>
              JSON 数组，键对应列字段
            </div>
            <textarea
              value={JSON.stringify(el.tableData ?? [], null, 2)}
              onChange={(e) => {
                try { onUpdate('tableData', JSON.parse(e.target.value)) } catch { /* ignore */ }
              }}
              rows={6}
              style={{
                width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 7px',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </>
        )}

        {/* 表格事件配置 */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            表格事件
          </div>

          <Row label="行点击">
            <button
              onClick={() => {
                const event = el.tableRowClickEvent ?? { trigger: 'click', action: 'script', script: '// row, rowIndex 可用\nconsole.log(row, rowIndex)' }
                onUpdate('tableRowClickEvent', event)
              }}
              style={{
                padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                background: el.tableRowClickEvent ? 'var(--accent-muted)' : 'var(--bg-surface)',
                color: el.tableRowClickEvent ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              }}
            >
              {el.tableRowClickEvent ? '已配置' : '+ 添加'}
            </button>
            {el.tableRowClickEvent && (
              <button
                onClick={() => onUpdate('tableRowClickEvent', undefined)}
                style={{
                  padding: '3px 6px', fontSize: 10, cursor: 'pointer', marginLeft: 4,
                  background: 'var(--danger-muted)', color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
                }}
              >×</button>
            )}
          </Row>

          {el.tableRowClickEvent && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>
                脚本（可访问 row, rowIndex）
              </div>
              <textarea
                value={el.tableRowClickEvent.script ?? ''}
                onChange={(e) => onUpdate('tableRowClickEvent', { ...el.tableRowClickEvent!, script: e.target.value })}
                rows={3}
                placeholder="console.log(row, rowIndex)"
                style={{
                  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 7px',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <Row label="单元格点击">
            <button
              onClick={() => {
                const event = el.tableCellClickEvent ?? { trigger: 'click', action: 'script', script: '// row, rowIndex, column, cellValue 可用\nconsole.log(column, cellValue)' }
                onUpdate('tableCellClickEvent', event)
              }}
              style={{
                padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                background: el.tableCellClickEvent ? 'var(--accent-muted)' : 'var(--bg-surface)',
                color: el.tableCellClickEvent ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              }}
            >
              {el.tableCellClickEvent ? '已配置' : '+ 添加'}
            </button>
            {el.tableCellClickEvent && (
              <button
                onClick={() => onUpdate('tableCellClickEvent', undefined)}
                style={{
                  padding: '3px 6px', fontSize: 10, cursor: 'pointer', marginLeft: 4,
                  background: 'var(--danger-muted)', color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
                }}
              >×</button>
            )}
          </Row>

          {el.tableCellClickEvent && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>
                脚本（可访问 row, rowIndex, column, cellValue）
              </div>
              <textarea
                value={el.tableCellClickEvent.script ?? ''}
                onChange={(e) => onUpdate('tableCellClickEvent', { ...el.tableCellClickEvent!, script: e.target.value })}
                rows={3}
                placeholder="if (column === 'status') { alert(cellValue) }"
                style={{
                  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 7px',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
            提示：列表头点击可通过单元格事件 + 判断行索引实现
          </div>
        </div>
      </div>
    )
  }

  const modeOptions: { value: DataBindingMode; label: string }[] = [
    { value: 'point', label: '数据点 (STOMP)' },
    { value: 'static', label: '静态值' },
    { value: 'simulation', label: '模拟点位' },
    { value: 'interface', label: '数据接口' },
    { value: 'trend', label: '趋势图' },
  ]
  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Row label="绑定模式">
        <select
          value={mode}
          onChange={(e) => patchPointBinding(el, onUpdate, { mode: e.target.value as DataBindingMode })}
          style={selectStyle}
        >
          {modeOptions.filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>

      {mode === 'point' && (
        <Row label="点位键">
          <Inp
            val={el.pointBinding?.pointKey ?? el.pointBinding?.linkName ?? ''}
            placeholder="pump1.speed"
            onChange={(v) => patchPointBinding(el, onUpdate, { pointKey: v, linkName: v })}
          />
        </Row>
      )}

      {mode === 'simulation' && (
        <>
          <Row label="模拟键">
            <Inp
              val={el.pointBinding?.simLinkName ?? ''}
              placeholder="pump1.speed"
              onChange={(v) => patchPointBinding(el, onUpdate, { simLinkName: v })}
            />
          </Row>
          <Row label="设备码">
            <Inp
              val={el.pointBinding?.simDeviceCode ?? ''}
              placeholder="可选"
              onChange={(v) => patchPointBinding(el, onUpdate, { simDeviceCode: v })}
            />
          </Row>
        </>
      )}

      {mode === 'static' && (
        <div className="prop-row">
          <span className="prop-label">静态 JSON</span>
          <textarea
            value={JSON.stringify(el.pointBinding?.staticData ?? {}, null, 2)}
            onChange={(e) => {
              try {
                patchPointBinding(el, onUpdate, { staticData: JSON.parse(e.target.value) })
              } catch { /* ignore */ }
            }}
            rows={4}
            style={{
              width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
              fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 7px',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {mode === 'interface' && (
        <>
          <Row label="接口编码">
            <Inp
              val={el.pointBinding?.ifaceCode ?? ''}
              placeholder="sensor-data"
              onChange={(v) => patchPointBinding(el, onUpdate, { ifaceCode: v })}
            />
          </Row>
          <Row label="轮询(ms)">
            <Inp
              val={el.pointBinding?.ifaceRefreshMs ?? 0}
              type="number"
              onChange={(v) => patchPointBinding(el, onUpdate, { ifaceRefreshMs: Number(v) })}
              placeholder="0=不轮询"
            />
          </Row>
        </>
      )}

      {mode === 'trend' && (
        <>
          <Row label="趋势键">
            <Inp
              val={(el.pointBinding?.trendKeys ?? []).join(', ')}
              placeholder="tag1, tag2"
              onChange={(v) => patchPointBinding(el, onUpdate, {
                trendKeys: v.split(',').map((s) => s.trim()).filter(Boolean),
              })}
            />
          </Row>
          <Row label="保留点数">
            <Inp
              val={el.pointBinding?.trendMaxPoints ?? 200}
              type="number"
              onChange={(v) => patchPointBinding(el, onUpdate, { trendMaxPoints: Number(v) })}
            />
          </Row>
        </>
      )}

      <Row label="转换式">
        <Inp
          val={el.pointBinding?.transform ?? ''}
          placeholder="v * 0.01"
          onChange={(v) => patchPointBinding(el, onUpdate, { transform: v })}
        />
      </Row>

      <div style={{
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '6px 8px',
      }}>
        图表多系列绑定、接口字段映射等高级配置请使用画布<strong>右键 → 数据绑定</strong>抽屉。
      </div>
    </div>
  )
}

function AnimationEditorSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const anim: ElementAnimation = el.animation ?? { type: 'none' }

  const setAnim = (patch: Partial<ElementAnimation>) => {
    onUpdate('animation', { ...anim, ...patch })
  }

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Row label="动画类型">
        <select
          value={anim.type}
          onChange={(e) => setAnim({ type: e.target.value as ElementAnimation['type'] })}
          style={selectStyle}
        >
          <option value="none">无</option>
          <option value="rotate">旋转</option>
          <option value="blink">闪烁</option>
          <option value="flow">流动</option>
        </select>
      </Row>
      {anim.type !== 'none' && (
        <>
          <Row label="时长(ms)">
            <Inp
              val={anim.duration ?? 1000}
              type="number"
              onChange={(v) => setAnim({ duration: Number(v) })}
            />
          </Row>
          <Row label="触发条件">
            <Inp
              val={anim.condition ?? ''}
              placeholder="例如 v > 80"
              onChange={(v) => setAnim({ condition: v })}
            />
          </Row>
        </>
      )}
      <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        预览/发布页按条件表达式（v）与绑定点位驱动 rotate / blink / flow 动画。
      </div>
    </div>
  )
}

/* ── Group binding section (对象模板) ── */
function GroupBindingSection({
  el, allElements, onUpdate, onUngroup,
}: {
  el: CanvasElement
  allElements: CanvasElement[]
  onUpdate: (key: string, value: unknown) => void
  onUngroup: () => void
}) {
  const [autoScanResult, setAutoScanResult] = useState<{
    params: import('@/types').GroupParamSpec[]
    byElement: Record<string, Array<{ location: string; paramName: string }>>
  } | null>(null)

  const groupBinding = el.groupBinding ?? {}
  const useVirtualLayout = !!groupBinding.virtualLayout
  const itemAlias = groupBinding.itemAlias || 'item'

  // 解析当前 value/path 以取得首个样本 item（用于参数类型推断）
  const sampleItem: unknown = useMemo(() => {
    if (groupBinding.source === 'static') {
      const raw = groupBinding.value
      let v: unknown = raw
      if (typeof raw === 'string') {
        try { v = JSON.parse(raw) } catch { v = raw }
      }
      if (Array.isArray(v)) return v[0]
      return v
    }
    // point / interface 时无法静态获取样本，留空（类型推断留 any）
    return undefined
  }, [groupBinding.source, groupBinding.value])

  const reExtract = () => {
    const params = scanElementsForTemplateParams(allElements, itemAlias, sampleItem)
    // 同时记录每个参数被哪些子元素 / 哪些位置使用
    const byElement: Record<string, Array<{ location: string; paramName: string }>> = {}
    for (const p of params) {
      const locs: Array<{ location: string; paramName: string }> = []
      for (const child of allElements) {
        if (child.id === el.id) continue
        if (child.text && child.text.includes(`{{${itemAlias}.${p.name}}}`)) {
          locs.push({ location: `${child.name || child.id}.text`, paramName: p.name })
        }
        if (child.pointBinding?.textTemplate?.includes(`{{${itemAlias}.${p.name}}}`)) {
          locs.push({ location: `${child.name || child.id}.textTemplate`, paramName: p.name })
        }
      }
      byElement[p.name] = locs
    }
    setAutoScanResult({ params, byElement })
  }

  const applyAutoExtractedParams = () => {
    if (!autoScanResult) reExtract()
    const params = autoScanResult?.params ?? scanElementsForTemplateParams(allElements, itemAlias, sampleItem)
    // 合并：保留用户已有但自动扫描未发现的；保留字段类型；保留 description
    const existing = new Map((groupBinding.params ?? []).map((p) => [p.name, p]))
    const merged = params.map((p) => {
      const prev = existing.get(p.name)
      return prev
        ? { ...p, description: prev.description, required: prev.required, default: prev.default }
        : p
    })
    onUpdate('groupBinding', { ...groupBinding, params: merged })
  }

  const updateParam = (idx: number, patch: Partial<import('@/types').GroupParamSpec>) => {
    const next = [...(groupBinding.params ?? [])]
    next[idx] = { ...next[idx], ...patch }
    onUpdate('groupBinding', { ...groupBinding, params: next })
  }

  const removeParam = (idx: number) => {
    const next = [...(groupBinding.params ?? [])]
    next.splice(idx, 1)
    onUpdate('groupBinding', { ...groupBinding, params: next })
  }

  const addParam = () => {
    const next = [...(groupBinding.params ?? [])]
    next.push({ name: '', type: 'string', usedIn: [] })
    onUpdate('groupBinding', { ...groupBinding, params: next })
  }

  const updateVirtualLayout = (patch: Partial<import('@/types').VirtualLayoutConfig>) => {
    const current = groupBinding.virtualLayout ?? { display: 'flex' as const }
    const next: import('@/types').VirtualLayoutConfig = { ...current, ...patch }
    onUpdate('groupBinding', { ...groupBinding, virtualLayout: next })
  }

  const clearVirtualLayout = () => {
    const next = { ...groupBinding }
    delete next.virtualLayout
    onUpdate('groupBinding', next)
  }

  const enableVirtualLayout = () => {
    onUpdate('groupBinding', {
      ...groupBinding,
      virtualLayout: { display: 'flex', gap: 8, padding: 0 },
    })
  }

  return (
    <Section title="组合" accent>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        包含 {el.children?.length ?? 0} 个子元素
      </div>
      <Row label="对象模板">
        <Toggle
          checked={groupBinding.enabled ?? false}
          onChange={(enabled) => onUpdate('groupBinding', {
            ...(groupBinding ?? {}),
            enabled,
            source: groupBinding.source ?? 'static',
            layout: groupBinding.layout ?? 'grid',
          })}
          label={groupBinding.enabled ? '已启用' : '关闭'}
        />
      </Row>
      {groupBinding.enabled && (
        <>
          <Row label="对象来源">
            <select
              value={groupBinding.source ?? 'static'}
              onChange={(e) => onUpdate('groupBinding', { ...groupBinding, source: e.target.value as 'static' | 'point' | 'interface' })}
            >
              <option value="static">静态 JSON</option>
              <option value="point">点位路径</option>
              <option value="interface">接口结果</option>
            </select>
          </Row>
          {groupBinding.source === 'static' ? (
            <Row label="对象/数组 JSON">
              <Inp
                val={typeof groupBinding.value === 'string' ? groupBinding.value : JSON.stringify(groupBinding.value ?? [])}
                onChange={(value) => onUpdate('groupBinding', { ...groupBinding, value })}
                placeholder='[{"name":"设备 A"}]'
              />
            </Row>
          ) : (
            <Row label="数组路径">
              <Inp
                val={groupBinding.path ?? ''}
                onChange={(path) => onUpdate('groupBinding', { ...groupBinding, path })}
                placeholder="items"
              />
            </Row>
          )}
          <Row label="实例别名">
            <Inp
              val={groupBinding.itemAlias ?? 'item'}
              onChange={(itemAlias) => onUpdate('groupBinding', { ...groupBinding, itemAlias })}
            />
          </Row>

          {/* 虚拟 div 布局 */}
          <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: useVirtualLayout ? 6 : 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>虚拟 div 容器</span>
              {useVirtualLayout ? (
                <button
                  onClick={clearVirtualLayout}
                  style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer', background: 'transparent', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: 3 }}
                >关闭</button>
              ) : (
                <button
                  onClick={enableVirtualLayout}
                  style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 3 }}
                >启用</button>
              )}
            </div>
            {useVirtualLayout && groupBinding.virtualLayout && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Row label="布局">
                  <select
                    value={groupBinding.virtualLayout.display}
                    onChange={(e) => updateVirtualLayout({ display: e.target.value as 'flex' | 'grid' | 'flow' })}
                  >
                    <option value="flex">Flex</option>
                    <option value="grid">Grid</option>
                    <option value="flow">Flow（多列换行）</option>
                  </select>
                </Row>
                {groupBinding.virtualLayout.display === 'flex' && (
                  <>
                    <Row label="方向">
                      <select
                        value={groupBinding.virtualLayout.flexDirection ?? 'row'}
                        onChange={(e) => updateVirtualLayout({ flexDirection: e.target.value as 'row' | 'row-reverse' | 'column' | 'column-reverse' })}
                      >
                        <option value="row">横向</option>
                        <option value="row-reverse">横向反向</option>
                        <option value="column">纵向</option>
                        <option value="column-reverse">纵向反向</option>
                      </select>
                    </Row>
                    <Row label="换行">
                      <select
                        value={groupBinding.virtualLayout.flexWrap ?? 'nowrap'}
                        onChange={(e) => updateVirtualLayout({ flexWrap: e.target.value as 'nowrap' | 'wrap' | 'wrap-reverse' })}
                      >
                        <option value="nowrap">不换行</option>
                        <option value="wrap">换行</option>
                        <option value="wrap-reverse">反向换行</option>
                      </select>
                    </Row>
                    <Row label="主轴对齐">
                      <select
                        value={groupBinding.virtualLayout.justifyContent ?? 'flex-start'}
                        onChange={(e) => updateVirtualLayout({ justifyContent: e.target.value as 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' })}
                      >
                        <option value="flex-start">起始</option>
                        <option value="flex-end">末端</option>
                        <option value="center">居中</option>
                        <option value="space-between">两端</option>
                        <option value="space-around">环绕</option>
                        <option value="space-evenly">均匀</option>
                      </select>
                    </Row>
                    <Row label="交叉对齐">
                      <select
                        value={groupBinding.virtualLayout.alignItems ?? 'stretch'}
                        onChange={(e) => updateVirtualLayout({ alignItems: e.target.value as 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch' })}
                      >
                        <option value="flex-start">起始</option>
                        <option value="flex-end">末端</option>
                        <option value="center">居中</option>
                        <option value="baseline">基线</option>
                        <option value="stretch">拉伸</option>
                      </select>
                    </Row>
                  </>
                )}
                {(groupBinding.virtualLayout.display === 'grid' || groupBinding.virtualLayout.display === 'flow') && (
                  <>
                    <Row label="列数">
                      <Inp
                        val={groupBinding.virtualLayout.columns ?? 1}
                        type="number"
                        onChange={(v) => updateVirtualLayout({ columns: Math.max(1, Number(v)) })}
                      />
                    </Row>
                    <Row label="列宽">
                      <Inp
                        val={groupBinding.virtualLayout.columnWidth ?? ''}
                        onChange={(v) => updateVirtualLayout({ columnWidth: v || undefined })}
                        placeholder="1fr"
                      />
                    </Row>
                    <Row label="行高">
                      <Inp
                        val={groupBinding.virtualLayout.rowHeight ?? ''}
                        onChange={(v) => updateVirtualLayout({ rowHeight: v || undefined })}
                        placeholder="auto"
                      />
                    </Row>
                  </>
                )}
                <Row label="间距">
                  <Inp
                    val={groupBinding.virtualLayout.gap ?? 0}
                    type="number"
                    onChange={(v) => updateVirtualLayout({ gap: Number(v) })}
                  />
                </Row>
                <Row label="内边距">
                  <Inp
                    val={groupBinding.virtualLayout.padding ?? 0}
                    type="number"
                    onChange={(v) => updateVirtualLayout({ padding: Number(v) })}
                  />
                </Row>
                <PairRow
                  l1="容器宽" v1={typeof groupBinding.virtualLayout.customWidth === 'string' ? 1 : 1}
                  l2="容器高" v2={1}
                  on1={(v) => updateVirtualLayout({
                    widthMode: v === '0' ? 'auto' : 'custom',
                    customWidth: v === '0' ? undefined : String(v),
                  })}
                  on2={(v) => updateVirtualLayout({
                    heightMode: v === '0' ? 'auto' : 'custom',
                    customHeight: v === '0' ? undefined : String(v),
                  })}
                />
              </div>
            )}
          </div>

          {!useVirtualLayout && (
            <>
              <Row label="布局">
                <select
                  value={groupBinding.layout ?? 'grid'}
                  onChange={(e) => onUpdate('groupBinding', { ...groupBinding, layout: e.target.value as 'grid' | 'horizontal' | 'vertical' })}
                >
                  <option value="grid">网格</option>
                  <option value="horizontal">横向</option>
                  <option value="vertical">纵向</option>
                </select>
              </Row>
              <PairRow
                l1="列数" v1={groupBinding.columns ?? 1}
                l2="最大实例" v2={groupBinding.maxInstances ?? 100}
                on1={(columns) => onUpdate('groupBinding', { ...groupBinding, columns: Math.max(1, Number(columns)) })}
                on2={(maxInstances) => onUpdate('groupBinding', { ...groupBinding, maxInstances: Math.max(1, Number(maxInstances)) })}
              />
            </>
          )}

          {/* 参数提取 */}
          <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>对象参数（自动提取）</span>
              <button
                onClick={() => {
                  reExtract()
                  applyAutoExtractedParams()
                }}
                style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 3 }}
              >扫描并应用</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 }}>
              扫描组合内子元素的 <code>{'{{item.xxx}}'}</code> 占位符与 <code>{'${...}'}</code> 表达式，
              自动列出可作为对象参数的字段。可手动调整字段映射（paramFieldMap）让源对象字段名与模板占位符对齐。
            </div>
            {(groupBinding.params ?? []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(groupBinding.params ?? []).map((p, idx) => (
                  <div key={`${p.name}-${idx}`} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      value={p.name}
                      onChange={(e) => updateParam(idx, { name: e.target.value })}
                      placeholder="字段名"
                      style={{ flex: 2, height: 24, padding: '0 6px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 3 }}
                    />
                    <select
                      value={p.type ?? 'string'}
                      onChange={(e) => updateParam(idx, { type: e.target.value as 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any' })}
                      style={{ flex: 1, height: 24, fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 3 }}
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="integer">integer</option>
                      <option value="boolean">boolean</option>
                      <option value="object">object</option>
                      <option value="array">array</option>
                      <option value="any">any</option>
                    </select>
                    <input
                      value={p.description ?? ''}
                      onChange={(e) => updateParam(idx, { description: e.target.value })}
                      placeholder="描述"
                      style={{ flex: 2, height: 24, padding: '0 6px', fontSize: 10, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 3 }}
                    />
                    <button
                      onClick={() => removeParam(idx)}
                      style={{ height: 24, padding: '0 6px', cursor: 'pointer', background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 3, fontSize: 10 }}
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={addParam}
                  style={{ fontSize: 10, padding: '3px 0', cursor: 'pointer', background: 'transparent', color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: 3 }}
                >+ 添加参数</button>
              </div>
            )}

            {/* 字段映射 */}
            {(groupBinding.params ?? []).length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>字段映射（paramFieldMap）</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                  模板中的 <code>{'{{item.xxx}}'}</code> 与源数据字段名不一致时，在这里把 xxx 映射到真实字段。
                </div>
                {(groupBinding.params ?? []).map((p) => {
                  const mapped = groupBinding.paramFieldMap?.[p.name] ?? p.name
                  return (
                    <div key={`map-${p.name}`} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>{`{{item.${p.name}}}`}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
                      <input
                        value={mapped}
                        onChange={(e) => {
                          const next = { ...(groupBinding.paramFieldMap ?? {}) }
                          if (!e.target.value || e.target.value === p.name) {
                            delete next[p.name]
                          } else {
                            next[p.name] = e.target.value
                          }
                          onUpdate('groupBinding', { ...groupBinding, paramFieldMap: Object.keys(next).length ? next : undefined })
                        }}
                        placeholder={p.name}
                        style={{ flex: 2, height: 22, padding: '0 6px', fontSize: 10, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {/* 运行时参数覆盖 */}
            {(groupBinding.params ?? []).length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>参数覆盖（paramOverrides）</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                  对所有实例统一设置参数值（可用于默认值或测试）。运行时按 JSON 字符串解析。
                </div>
                {(groupBinding.params ?? []).map((p) => {
                  const v = groupBinding.paramOverrides?.[p.name]
                  const vStr = v === undefined ? '' : JSON.stringify(v)
                  return (
                    <div key={`ov-${p.name}`} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>{p.name}</span>
                      <input
                        value={vStr}
                        onChange={(e) => {
                          const next = { ...(groupBinding.paramOverrides ?? {}) }
                          if (!e.target.value) {
                            delete next[p.name]
                          } else {
                            try { next[p.name] = JSON.parse(e.target.value) }
                            catch { next[p.name] = e.target.value }
                          }
                          onUpdate('groupBinding', { ...groupBinding, paramOverrides: Object.keys(next).length ? next : undefined })
                        }}
                        placeholder="默认空"
                        style={{ flex: 3, height: 22, padding: '0 6px', fontSize: 10, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 扫描结果预览（仅本次会话） */}
          {autoScanResult && autoScanResult.params.length > 0 && (
            <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(99,102,241,0.08)', borderRadius: 4, border: '1px solid rgba(99,102,241,0.3)' }}>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 4 }}>本次扫描到 {autoScanResult.params.length} 个可参数化字段</div>
              {autoScanResult.params.map((p) => (
                <div key={p.name} style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <code>{`{{${itemAlias}.${p.name}}}`}</code> ({p.type}) — {(autoScanResult.byElement[p.name] ?? []).map((l) => l.location).join(' / ') || '未引用'}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button
        onClick={onUngroup}
        style={{
          width: '100%', padding: '5px 0', cursor: 'pointer',
          background: 'var(--warning-muted)', color: 'var(--warning)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 'var(--radius-sm)', fontSize: 11,
          marginTop: 6,
        }}
      >
        解组 (Ctrl+Shift+G)
      </button>
    </Section>
  )
}

function ElementBasicTabContent({ el, onUpdate, onUngroup, canvas }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
  onUngroup: () => void
  canvas?: { elements: CanvasElement[] }
}) {
  // 条件样式表达式自动补全的数据源
  const condExtDataKeys = Object.keys(el.extData ?? {})
  const condElementNames = (canvas?.elements ?? [])
    .filter((e) => e.id !== el.id && e.name)
    .map((e) => e.name)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {el.type === 'group' && (
        <GroupBindingSection
          el={el}
          allElements={canvas?.elements ?? []}
          onUpdate={onUpdate}
          onUngroup={onUngroup}
        />
      )}

      <Section title="位置 / 尺寸">
        <Row label="显示">
          <Toggle
            checked={el.visible}
            onChange={(v) => onUpdate('visible', v)}
            label={el.visible ? '可见' : '隐藏'}
          />
        </Row>
        <PairRow l1="X" v1={el.x} l2="Y" v2={el.y}
          on1={(v) => onUpdate('x', Number(v))}
          on2={(v) => onUpdate('y', Number(v))} />
        <PairRow l1="宽度" v1={el.width} l2="高度" v2={el.height}
          on1={(v) => onUpdate('width', Number(v))}
          on2={(v) => onUpdate('height', Number(v))} />
        <PairRow l1="旋转°" v1={el.rotation} l2="透明度" v2={el.opacity ?? 1}
          on1={(v) => onUpdate('rotation', Number(v))}
          on2={(v) => onUpdate('opacity', Number(v))} />
        <Row label="禁止选中">
          <Toggle
            checked={el.selectable === false}
            onChange={(v) => onUpdate('selectable', v ? false : true)}
            label={el.selectable === false ? '已禁止' : '可选中'}
          />
        </Row>
      </Section>

      <Section title="样式">
        <Row label="名称"><Inp val={el.name} onChange={(v) => onUpdate('name', v)} /></Row>
        <Row label="填充">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ColorPicker val={el.fill && el.fill !== 'transparent' ? el.fill : '#1a2a3a'} onChange={(v) => onUpdate('fill', v)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!el.fill || el.fill === 'transparent' || el.fill === ''}
                onChange={(e) => onUpdate('fill', e.target.checked ? '' : '#1a2a3a')}
                style={{ width: 12, height: 12 }}
              />
              透明
            </label>
          </div>
        </Row>
        <Row label="描边"><ColorPicker val={el.stroke || '#000000'} onChange={(v) => onUpdate('stroke', v)} /></Row>
      </Section>

      <Section title="扩展数据" defaultOpen={false}>
        <ExtDataEditor
          extData={el.extData ?? {}}
          onChange={(extData) => onUpdate('extData', extData)}
          allElements={canvas?.elements ?? []}
          currentElId={el.id}
        />
      </Section>

      <Section title="条件样式" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4, padding: 6, background: 'var(--bg-surface)', borderRadius: 3 }}>
            根据表达式动态设置颜色。规则按顺序评估，首个匹配的规则生效。
            <br />
            可用变量：<code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>v</code>=绑定值，
            <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>text</code>=显示文本，
            <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>ext.key</code>=扩展数据，
            <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>el('名称','extData.key')</code>=其他组件
          </div>

          {(el.type === 'text' || el.type === 'button' || el.type.startsWith('form-')) && (
            <ConditionalColorRulesEditor
              rules={el.conditionalStyles?.fontColor ?? []}
              onChange={(rules) => {
                const updated = { ...(el.conditionalStyles ?? {}), fontColor: rules }
                onUpdate('conditionalStyles', updated)
              }}
              propertyLabel="文本颜色"
              extDataKeys={condExtDataKeys}
              elementNames={condElementNames}
            />
          )}

          <ConditionalColorRulesEditor
            rules={el.conditionalStyles?.fill ?? []}
            onChange={(rules) => {
              const updated = { ...(el.conditionalStyles ?? {}), fill: rules }
              onUpdate('conditionalStyles', updated)
            }}
            propertyLabel="填充色"
            extDataKeys={condExtDataKeys}
            elementNames={condElementNames}
          />

          <ConditionalColorRulesEditor
            rules={el.conditionalStyles?.stroke ?? []}
            onChange={(rules) => {
              const updated = { ...(el.conditionalStyles ?? {}), stroke: rules }
              onUpdate('conditionalStyles', updated)
            }}
            propertyLabel="边框色"
            extDataKeys={condExtDataKeys}
            elementNames={condElementNames}
          />
        </div>
      </Section>

      {el.type.startsWith('echarts-') && (
        <ChartConfigSection el={el} onUpdate={onUpdate} />
      )}

      {(el.type === 'layout-carousel' || el.type === 'layout-modal' || el.type === 'layout-tabs' || el.type === 'layout-collapse') && (
        <LayoutConfigSection el={el} onUpdate={onUpdate} />
      )}

      {el.type === 'alarm-light' && (
        <Section title="报警灯">
          <Row label="正常色"><ColorPicker val={el.alarmNormalColor || '#22c55e'} onChange={(v) => onUpdate('alarmNormalColor', v)} /></Row>
          <Row label="预警色"><ColorPicker val={el.alarmWarningColor || '#f59e0b'} onChange={(v) => onUpdate('alarmWarningColor', v)} /></Row>
          <Row label="报警色"><ColorPicker val={el.alarmDangerColor || '#ef4444'} onChange={(v) => onUpdate('alarmDangerColor', v)} /></Row>
          <PairRow
            l1="预警阈值" v1={el.alarmThresholdWarning ?? 70} l2="报警阈值" v2={el.alarmThresholdDanger ?? 90}
            on1={(v) => onUpdate('alarmThresholdWarning', Number(v))} on2={(v) => onUpdate('alarmThresholdDanger', Number(v))}
          />
          <Row label="闪烁(ms)"><Inp val={el.alarmBlinkMs ?? 500} type="number" onChange={(v) => onUpdate('alarmBlinkMs', Number(v))} /></Row>
          <Row label="声音报警">
            <Toggle checked={!!el.alarmSoundEnabled} onChange={(v) => onUpdate('alarmSoundEnabled', v)} label={el.alarmSoundEnabled ? '开启' : '关闭'} />
          </Row>
          <Row label="标签">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Inp val={el.text || ''} onChange={(v) => onUpdate('text', v)} placeholder="报警" />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    const current = el.text || ''
                    const ref = '{{ext:key}}'
                    onUpdate('text', current + ref)
                  }}
                  style={{
                    flex: 1, padding: '2px 0', fontSize: 10,
                    background: 'var(--bg-surface)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
                  }}
                >+ 本组件</button>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      const current = el.text || ''
                      const ref = `{{el:${e.target.value}:key}}`
                      onUpdate('text', current + ref)
                    }
                    e.target.value = ''
                  }}
                  style={{
                    flex: 1, height: 22, fontSize: 10, padding: '0 4px',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', borderRadius: 3,
                  }}
                >
                  <option value="">+ 其他组件...</option>
                  {(canvas?.elements ?? [])
                    .filter((e) => e.id !== el.id)
                    .map((e) => (
                      <option key={e.id} value={e.name}>{e.name}</option>
                    ))}
                </select>
              </div>
            </div>
          </Row>
        </Section>
      )}

      {(el.type === 'text' || el.type === 'button') && (
        <Section title="文本">
          <Row label="内容">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Inp val={el.text || ''} onChange={(v) => onUpdate('text', v)} placeholder="输入文字" />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    const current = el.text || ''
                    const ref = '{{ext:key}}'
                    onUpdate('text', current + ref)
                  }}
                  style={{
                    flex: 1, padding: '2px 0', fontSize: 10,
                    background: 'var(--bg-surface)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
                  }}
                >+ 本组件引用</button>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      const current = el.text || ''
                      const ref = `{{el:${e.target.value}:key}}`
                      onUpdate('text', current + ref)
                    }
                    e.target.value = ''
                  }}
                  style={{
                    flex: 1, height: 22, fontSize: 10, padding: '0 4px',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', borderRadius: 3,
                  }}
                >
                  <option value="">+ 引用其他组件...</option>
                  {(canvas?.elements ?? [])
                    .filter((e) => e.id !== el.id)
                    .map((e) => (
                      <option key={e.id} value={e.name}>{e.name}</option>
                    ))}
                </select>
              </div>
            </div>
          </Row>
          <PairRow
            l1="字号" v1={el.fontSize ?? 14} l2="行高" v2={el.lineHeight ?? 1.5}
            on1={(v) => onUpdate('fontSize', Number(v))} on2={(v) => onUpdate('lineHeight', Number(v))} />
          <Row label="字色"><ColorPicker val={el.fontColor || '#ffffff'} onChange={(v) => onUpdate('fontColor', v)} /></Row>
          <Row label="粗体">
            <Toggle
              checked={el.fontWeight === 'bold'}
              onChange={(v) => onUpdate('fontWeight', v ? 'bold' : 'normal')}
              label={el.fontWeight === 'bold' ? '粗体' : '常规'} />
          </Row>
        </Section>
      )}

      {(el.type === 'text' || el.type === 'button') && (
        <DateTimeConfigSection el={el} onUpdate={onUpdate} />
      )}

      {(el.type === 'image-bg' || el.type === 'image-widget' ||
        el.type === 'image-decoration' || el.type === 'image-border-box') && (
        <ImageResourceSection imageUrl={el.imageUrl} onUpdate={(v) => onUpdate('imageUrl', v)} />
      )}

      {el.type.startsWith('form-') && (
        <Section title="表单配置" defaultOpen>
          <FormFieldConfigSection el={el} onUpdate={onUpdate} />
        </Section>
      )}
    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  width: 20, height: 20, padding: 0, cursor: 'pointer',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 3, fontSize: 10, color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em',
}
const selectStyle: React.CSSProperties = {
  width: '100%', height: 26,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
  fontSize: 11, padding: '0 4px', outline: 'none',
}

export default function PropertiesPanel() {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const selectedIds = store.selectedIds
  const [activeTab, setActiveTab] = useState<PropTab>('basic')

  // multi-select: show batch panel when 2+ selected
  const isMulti = selectedIds.length >= 2
  const selectedEl = !isMulti ? canvas?.elements.find((e) => selectedIds.includes(e.id)) : undefined

  useEffect(() => {
    setActiveTab('basic')
  }, [selectedEl?.id])

  const update = (key: string, value: unknown) => {
    if (selectedEl) store.updateElement(selectedEl.id, { [key]: value })
  }

  const updateBatch = (key: string, value: unknown) => {
    selectedIds.forEach((id) => store.updateElement(id, { [key]: value }))
  }

  const updateCanvas = (key: string, value: unknown) => {
    if (canvas) store.updateCanvas(canvas.id, { [key]: value })
  }

  return (
    <div
      className="scada-scroll"
      style={{
        width: 'var(--panel-r-w)',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* ── Multi-select batch panel ── */}
      {isMulti ? (
        <>
          <div style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              批量属性
            </span>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-base)',
              padding: '2px 5px', borderRadius: 3, border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}>
              {selectedIds.length} 个元素
            </span>
          </div>
          <Section title="填充 / 描边">
            <Row label="填充"><ColorPicker val="#000000" onChange={(v) => updateBatch('fill', v)} /></Row>
            <Row label="描边"><ColorPicker val="#000000" onChange={(v) => updateBatch('stroke', v)} /></Row>
            <Row label="透明度">
              <Inp val={1} type="number" onChange={(v) => updateBatch('opacity', Number(v))} />
            </Row>
          </Section>
          <Section title="组合操作" accent>
            <button
              onClick={() => { pushHistory(store.project); store.groupSelected() }}
              style={{
                width: '100%', padding: '6px 0', cursor: 'pointer',
                background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-sm)', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              组合 (Ctrl+G)
            </button>
          </Section>
          <div style={{ padding: '10px', marginTop: 'auto' }}>
            <button
              onClick={() => { pushHistory(store.project); store.deleteElements(selectedIds); store.clearSelection() }}
              style={{
                width: '100%', padding: '6px 0',
                background: 'var(--danger-muted)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
              删除全部
            </button>
          </div>
        </>

      ) : selectedEl ? (
        <>
          <div style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              元件属性
            </span>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-base)',
              padding: '2px 5px', borderRadius: 3, border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
            }}>
              {selectedEl.type}
            </span>
          </div>

          <TabBar active={activeTab} onChange={setActiveTab} />

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'basic' && (
              <ElementBasicTabContent
                el={selectedEl}
                onUpdate={update}
                onUngroup={() => { pushHistory(store.project); store.ungroup(selectedEl.id) }}
                canvas={canvas}
              />
            )}
            {activeTab === 'data' && (
              <DataBindingTabContent el={selectedEl} onUpdate={update} />
            )}
            {activeTab === 'events' && (
              <div style={{ padding: '8px 10px' }}>
                <EventEditorSection el={selectedEl} onUpdate={update} />
              </div>
            )}
            {activeTab === 'animation' && (
              <AnimationEditorSection el={selectedEl} onUpdate={update} />
            )}
          </div>

          {/* Delete */}
          <div style={{ padding: '10px 10px', marginTop: 'auto' }}>
            <button
              onClick={() => { pushHistory(store.project); store.deleteElements([selectedEl.id]); store.clearSelection() }}
              style={{
                width: '100%', padding: '6px 0',
                background: 'var(--danger-muted)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-muted)' }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              删除元件
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Canvas properties */}
          <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              画布属性
            </span>
          </div>

          {canvas ? (
            <Section title="画布设置" accent>
              <PairRow l1="宽度" v1={canvas.width} l2="高度" v2={canvas.height}
                on1={(v) => updateCanvas('width', Number(v))}
                on2={(v) => updateCanvas('height', Number(v))} />
              <Row label="自适应">
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    value={canvas.adaptiveMode ?? 'none'}
                    onChange={(e) => updateCanvas('adaptiveMode', e.target.value)}
                    style={{
                      flex: 1, height: 22, fontSize: 11,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                      padding: '0 4px', outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="none">固定尺寸</option>
                    <option value="fit">适应内容</option>
                    <option value="screen">屏幕自适应</option>
                  </select>
                  <button
                    title="立即按内容边界调整画布尺寸"
                    onClick={() => store.fitCanvasToContent(canvas.id)}
                    style={{
                      height: 22, padding: '0 6px', fontSize: 10,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--accent)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >适配</button>
                </div>
              </Row>
              {/* 自适应模式说明 */}
              {canvas.adaptiveMode && canvas.adaptiveMode !== 'none' && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>
                  {canvas.adaptiveMode === 'fit' && '画布将在预览时自动调整为元素实际边界大小'}
                  {canvas.adaptiveMode === 'screen' && '画布将在预览时填充整个屏幕，无边距'}
                </div>
              )}
              <Row label="背景色"><ColorPicker val={canvas.backgroundColor} onChange={(v) => { updateCanvas('backgroundColor', v); updateCanvas('background', v) }} /></Row>
              <Row label="网格"><Toggle checked={canvas.showGrid} onChange={(v) => updateCanvas('showGrid', v)} label={canvas.showGrid ? '显示' : '隐藏'} /></Row>
              <Row label="吸附"><Toggle checked={canvas.snapToGrid} onChange={(v) => updateCanvas('snapToGrid', v)} label={canvas.snapToGrid ? '开启' : '关闭'} /></Row>
              <Row label="格距"><Inp val={canvas.gridSize} onChange={(v) => updateCanvas('gridSize', Number(v))} type="number" /></Row>

              {/* 自动横屏配置 */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.04em' }}>
                  自动横屏
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['mobile', 'tablet', 'desktop'] as const).map((device) => {
                    const autoLandscape = canvas.autoLandscape ?? []
                    const checked = autoLandscape.includes(device)
                    const labels = { mobile: '手机', tablet: '平板', desktop: '电脑' }
                    return (
                      <label
                        key={device}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '4px 6px', borderRadius: 'var(--radius-sm)',
                          background: checked ? 'var(--accent-muted)' : 'transparent',
                          border: `1px solid ${checked ? 'var(--border-accent)' : 'var(--border)'} `,
                          transition: 'all var(--duration-fast)',
                        }}
                        onMouseEnter={(e) => {
                          if (!checked) e.currentTarget.style.background = 'var(--bg-elevated)'
                        }}
                        onMouseLeave={(e) => {
                          if (!checked) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...autoLandscape, device]
                              : autoLandscape.filter((d) => d !== device)
                            updateCanvas('autoLandscape', next.length ? next : undefined)
                          }}
                          style={{
                            width: 14, height: 14, cursor: 'pointer',
                            accentColor: 'var(--accent)',
                          }}
                        />
                        <span style={{ fontSize: 11, color: checked ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {labels[device]}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
                  勾选的设备类型下，预览和发布页面将自动横屏显示（旋转 90°）
                </div>
              </div>
            </Section>
          ) : (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
              点击画布上的元件<br />在此编辑属性
            </div>
          )}
        </>
      )}
    </div>
  )
}
