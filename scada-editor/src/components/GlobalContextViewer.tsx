import { useState, useMemo } from 'react'

interface Props {
  /** 全局上下文快照（含 components 键） */
  global: Record<string, unknown>
  /** 组件快照映射（名称/id → 快照） */
  components: Record<string, unknown>
  /** 写入全局上下文（点分路径）。提供后「全局键」页支持编辑/新增 */
  onWrite?: (path: string, value: unknown) => void
  /** 受控开关：提供后由外部（EditorHeader 按钮）控制开合，内部悬浮按钮隐藏 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** JSON 树节点：可折叠展示对象/数组，叶子值高亮；editable 时叶子可就地编辑 */
function TreeNode({ name, value, depth, path, onEdit, openDepth = 1 }: {
  name: string; value: unknown; depth: number
  path: string; onEdit?: (path: string, raw: string) => void
  /** 初始展开深度：depth < openDepth 时默认展开（搜索时可传更大值） */
  openDepth?: number
}) {
  const isObject = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(depth < openDepth)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const validate = (raw: string) => {
    setText(raw)
    const t = raw.trim()
    if (t && (t.startsWith('{') || t.startsWith('['))) {
      try {
        JSON.parse(t)
        setError('')
      } catch {
        setError('JSON 格式错误')
      }
    } else {
      setError('')
    }
  }

  if (!isObject) {
    if (editing && onEdit) {
      return (
        <div style={{ paddingLeft: depth * 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{name}:</span>
            <input
              autoFocus
              value={text}
              onChange={(e) => validate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !error) { onEdit(path, text); setEditing(false) }
                if (e.key === 'Escape') setEditing(false)
              }}
              onBlur={() => { if (!error) { onEdit(path, text); setEditing(false) } else setEditing(false) }}
              style={{
                flex: 1, height: 18, padding: '0 4px', fontSize: 11,
                background: 'var(--bg-base)', border: '1px solid ' + (error ? 'var(--danger)' : 'var(--border-accent)'),
                color: 'var(--text-primary)', borderRadius: 3, outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          {error && <div style={{ paddingLeft: 60, fontSize: 9, color: 'var(--danger)' }}>{error}</div>}
        </div>
      )
    }
    return (
      <div style={{ paddingLeft: depth * 12, display: 'flex', gap: 6, lineHeight: '18px' }}>
        <span style={{ color: 'var(--text-muted)' }}>{name}:</span>
        <span
          style={{ color: valueColor(value), cursor: onEdit ? 'text' : 'default' }}
          onClick={onEdit ? () => { setText(leafToInput(value)); setError(''); setEditing(true) } : undefined}
          title={onEdit ? '点击编辑（支持 JSON）' : undefined}
        >
          {formatLeaf(value)}
        </span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          paddingLeft: depth * 12, cursor: 'pointer', display: 'flex', gap: 4,
          color: 'var(--text-secondary)', lineHeight: '18px', userSelect: 'none',
        }}
      >
        <span style={{ width: 10, display: 'inline-block', color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ color: 'var(--accent)' }}>{name}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </div>
      {open && entries.map(([k, v]) => (
        <TreeNode
          key={k}
          name={k}
          value={v}
          depth={depth + 1}
          path={path ? `${path}.${k}` : k}
          onEdit={Array.isArray(value) ? undefined : onEdit}
          openDepth={openDepth}
        />
      ))}
    </div>
  )
}

function valueColor(v: unknown): string {
  if (typeof v === 'number') return '#e6a23c'
  if (typeof v === 'boolean') return '#c678dd'
  if (v === null || v === undefined) return 'var(--text-muted)'
  return '#98c379'
}

function formatLeaf(v: unknown): string {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return `"${v}"`
  return String(v)
}

/** 叶子值转为编辑框初值（字符串不带引号，其余原样） */
function leafToInput(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return String(v)
}

/** 解析用户输入：尝试 JSON（数字/布尔/数组/对象），失败则当作字符串 */
function parseInput(raw: string): unknown {
  const t = raw.trim()
  if (t === '') return ''
  try {
    return JSON.parse(t)
  } catch {
    return raw
  }
}

/**
 * 深度匹配：键名或任意层级的值（含嵌套对象/数组）命中查询串即返回 true。
 * 用于「内容 + key」搜索，超过 20000 字符的序列化结果会截断以控成本。
 */
function deepMatch(key: string, value: unknown, q: string): boolean {
  if (key.toLowerCase().includes(q)) return true
  try {
    const json = JSON.stringify(value)
    if (json && json.length <= 20000) return json.toLowerCase().includes(q)
    // 超大对象退化为浅层键匹配，避免卡顿
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).some((k) => k.toLowerCase().includes(q))
    }
  } catch {
    /* 循环引用等：仅键名匹配 */
  }
  return false
}

/**
 * 全局上下文查看器：悬浮面板，展示与工作流一致的全局上下文（含所有组件当前参数与扩展属性）。
 * 仅在「加载数据」开启时挂载。可折叠、可搜索、可切换 全局/组件 两个视图。
 * 提供 onWrite 时，「全局键」页支持就地编辑叶子值与新增键（调试/联动用）。
 */
export default function GlobalContextViewer({ global, components, onWrite, open: openProp, onOpenChange }: Props) {
  const controlled = openProp !== undefined
  const [openState, setOpenState] = useState(false)
  const open = controlled ? openProp : openState
  const setOpen = (v: boolean) => {
    if (controlled) onOpenChange?.(v)
    else setOpenState(v)
  }
  const [tab, setTab] = useState<'global' | 'components'>('components')
  const [query, setQuery] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [jsonError, setJsonError] = useState('')

  const filteredComponents = useMemo(() => {
    if (!query.trim()) return components
    const q = query.trim().toLowerCase()
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(components)) {
      if (deepMatch(k, v, q)) out[k] = v
    }
    return out
  }, [components, query])

  // 「全局键」页排除 components（组件快照单独展示且只读），并按查询串做内容+key 过滤
  const globalKeys = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(global)) {
      if (k === 'components') continue
      if (q && !deepMatch(k, v, q)) continue
      out[k] = v
    }
    return out
  }, [global, query])

  const componentCount = Object.keys(components).length

  const handleEdit = (path: string, raw: string) => {
    onWrite?.(path, parseInput(raw))
  }

  const handleAdd = () => {
    const k = newKey.trim()
    if (!k || !onWrite) return
    onWrite(k, parseInput(newVal))
    setNewKey('')
    setNewVal('')
    setJsonError('')
  }

  const validateAndSetVal = (raw: string) => {
    setNewVal(raw)
    const t = raw.trim()
    if (!t || t.startsWith('{') || t.startsWith('[')) {
      try {
        if (t) JSON.parse(t)
        setJsonError('')
      } catch (e) {
        setJsonError('JSON 格式错误')
      }
    } else {
      setJsonError('')
    }
  }

  const formatJson = () => {
    const t = newVal.trim()
    if (!t) return
    try {
      const obj = JSON.parse(t)
      setNewVal(JSON.stringify(obj, null, 2))
      setJsonError('')
    } catch (e) {
      setJsonError('无法格式化：JSON 格式错误')
    }
  }

  if (!open) {
    // 受控模式下，开合由外部按钮（EditorHeader）负责，这里不渲染悬浮按钮
    if (controlled) return null
    return (
      <button
        onClick={() => setOpen(true)}
        title="查看全局上下文（所有组件当前参数与扩展属性）"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 10050,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 12px',
          background: 'var(--accent-muted)', color: 'var(--accent)',
          border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
        </svg>
        全局上下文
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 10050,
        width: 480, maxWidth: 'calc(100vw - 32px)', height: '82vh', maxHeight: '82vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        fontSize: 12,
      }}
    >
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>全局上下文</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>与工作流上下文一致</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          title="收起"
        >
          ×
        </button>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        {([['components', `组件 (${componentCount})`], ['global', '全局键']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, height: 24, borderRadius: 'var(--radius-sm)',
              background: tab === id ? 'var(--accent-muted)' : 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid ' + (tab === id ? 'var(--border-accent)' : 'transparent'),
              fontSize: 11, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', margin: '8px 8px 0' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'components' ? '搜索组件名 / id / 值内容…' : '搜索键名 / 值内容…'}
          style={{
            width: '100%', height: 28, padding: query ? '0 26px 0 8px' : '0 8px',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
            fontSize: 11, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            title="清空"
            style={{
              position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
              width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
              fontSize: 14, lineHeight: 1, padding: 0,
            }}
          >×</button>
        )}
      </div>

      {/* body */}
      <div className="scada-scroll" style={{ flex: 1, overflow: 'auto', padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>
        {tab === 'components' ? (
          Object.keys(filteredComponents).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 8 }}>
              {query.trim() ? '无匹配结果' : '暂无组件'}
            </div>
          ) : (
            Object.entries(filteredComponents).map(([k, v]) => (
              <TreeNode key={`${k}::${query}`} name={k} value={v} depth={0} path="" openDepth={query.trim() ? 4 : 1} />
            ))
          )
        ) : (
          Object.keys(globalKeys).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 8 }}>
              {query.trim() ? '无匹配结果' : '全局上下文暂无自定义键'}
            </div>
          ) : (
            Object.entries(globalKeys).map(([k, v]) => (
              <TreeNode key={`${k}::${query}`} name={k} value={v} depth={0} path={k} onEdit={onWrite ? handleEdit : undefined} openDepth={query.trim() ? 4 : 1} />
            ))
          )
        )}
      </div>

      {/* 全局键：新增/写入 */}
      {tab === 'global' && onWrite && (
        <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="键（支持 a.b.c）"
              style={{
                flex: 1, height: 24, padding: '0 6px', fontSize: 11,
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', outline: 'none',
              }}
            />
            <button
              onClick={formatJson}
              disabled={!newVal.trim()}
              title="格式化 JSON"
              style={{
                height: 24, padding: '0 8px', fontSize: 10, cursor: newVal.trim() ? 'pointer' : 'not-allowed',
                background: 'var(--bg-surface)', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              }}
            >格式化</button>
            <button
              onClick={handleAdd}
              disabled={!newKey.trim() || !!jsonError}
              style={{
                height: 24, padding: '0 10px', fontSize: 11, cursor: (newKey.trim() && !jsonError) ? 'pointer' : 'not-allowed',
                background: (newKey.trim() && !jsonError) ? 'var(--accent-muted)' : 'var(--bg-surface)',
                color: (newKey.trim() && !jsonError) ? 'var(--accent)' : 'var(--text-muted)',
                border: '1px solid ' + ((newKey.trim() && !jsonError) ? 'var(--border-accent)' : 'var(--border)'),
                borderRadius: 'var(--radius-sm)',
              }}
            >写入</button>
          </div>
          <textarea
            value={newVal}
            onChange={(e) => validateAndSetVal(e.target.value)}
            placeholder='值：纯文本 / 数字 / 布尔 / JSON 对象或数组&#10;示例：42  |  "文本"  |  [1,2,3]  |  {"a":1}'
            rows={3}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 11,
              background: 'var(--bg-base)', border: '1px solid ' + (jsonError ? 'var(--danger)' : 'var(--border)'),
              color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', outline: 'none',
              fontFamily: 'var(--font-mono)', resize: 'vertical',
            }}
          />
          {jsonError && (
            <div style={{ fontSize: 10, color: 'var(--danger)' }}>{jsonError}</div>
          )}
        </div>
      )}

      {/* footer hint */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid var(--border)',
        color: 'var(--text-muted)', fontSize: 10, lineHeight: '14px',
      }}>
        表达式中可用：<span style={{ color: 'var(--accent)' }}>C('名', 'value')</span>、
        <span style={{ color: 'var(--accent)' }}>C('名', 'ext.键')</span>、
        <span style={{ color: 'var(--accent)' }}>G('components.名.value')</span>
      </div>
    </div>
  )
}
