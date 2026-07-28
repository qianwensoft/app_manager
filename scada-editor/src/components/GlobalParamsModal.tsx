import { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { GlobalParam, CustomFunctionDef } from '@/types'

interface Props {
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 28, background: 'var(--bg-base)',
  border: '1px solid var(--border)', color: 'var(--text-primary)',
  padding: '0 8px', borderRadius: 'var(--radius-sm)', fontSize: 12,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)',
}

const btn = (accent = false): React.CSSProperties => ({
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  background: accent ? 'var(--accent)' : 'var(--bg-surface)',
  color: accent ? '#fff' : 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
})

export default function GlobalParamsModal({ onClose }: Props) {
  const project = useEditorStore((s) => s.project)
  const setGlobalParams = useEditorStore((s) => s.setGlobalParams)
  const setCustomFunctions = useEditorStore((s) => s.setCustomFunctions)

  const [tab, setTab] = useState<'params' | 'functions'>('params')
  const [params, setParams] = useState<GlobalParam[]>(() => project.globalParams ?? [])
  const [fns, setFns] = useState<CustomFunctionDef[]>(() => project.customFunctions ?? [])

  const save = () => {
    setGlobalParams(params.filter((p) => p.key.trim()))
    setCustomFunctions(fns.filter((f) => f.name.trim()))
    onClose()
  }

  const addParam = () => setParams((prev) => [...prev, { key: '', type: 'string', value: '' }])
  const updateParam = (idx: number, patch: Partial<GlobalParam>) =>
    setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  const removeParam = (idx: number) => setParams((prev) => prev.filter((_, i) => i !== idx))

  const addFn = () => setFns((prev) => [...prev, { name: '', args: [], body: '' }])
  const updateFn = (idx: number, patch: Partial<CustomFunctionDef>) =>
    setFns((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  const removeFn = (idx: number) => setFns((prev) => prev.filter((_, i) => i !== idx))

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '92vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>全局参数 / 自定义函数</span>
          <button onClick={onClose} style={{ ...btn(), padding: '2px 8px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0' }}>
          {(['params', 'functions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...btn(tab === t),
                borderColor: tab === t ? 'var(--accent)' : 'var(--border)',
              }}
            >{t === 'params' ? '全局参数' : '自定义函数'}</button>
          ))}
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {tab === 'params' ? (
            <ParamsTab
              params={params}
              onAdd={addParam}
              onUpdate={updateParam}
              onRemove={removeParam}
            />
          ) : (
            <FunctionsTab
              fns={fns}
              onAdd={addFn}
              onUpdate={updateFn}
              onRemove={removeFn}
            />
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={btn()}>取消</button>
          <button onClick={save} style={btn(true)}>保存</button>
        </div>
      </div>
    </div>
  )
}

function ParamsTab({ params, onAdd, onUpdate, onRemove }: {
  params: GlobalParam[]
  onAdd: () => void
  onUpdate: (idx: number, patch: Partial<GlobalParam>) => void
  onRemove: (idx: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        全局参数可在接口参数「表达式」中通过 <code>params.键名</code> 或 <code>P('键名')</code> 引用。
      </div>
      {params.map((p, idx) => (
        <div key={idx} style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center',
        }}>
          <input
            style={inputStyle}
            value={p.key}
            placeholder="键名（标识符）"
            onChange={(e) => onUpdate(idx, { key: e.target.value })}
          />
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={p.type}
            onChange={(e) => onUpdate(idx, { type: e.target.value as GlobalParam['type'] })}
          >
            <option value="string">字符串</option>
            <option value="number">数字</option>
            <option value="boolean">布尔</option>
            <option value="json">JSON</option>
          </select>
          <input
            style={inputStyle}
            value={p.value}
            placeholder={p.type === 'json' ? '[1,2] 或 {...}' : '默认值'}
            onChange={(e) => onUpdate(idx, { value: e.target.value })}
          />
          <button onClick={() => onRemove(idx)} style={{
            padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            background: 'var(--danger-muted)', color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
          }}>✕</button>
        </div>
      ))}
      {params.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>暂无全局参数</div>
      )}
      <button onClick={onAdd} style={{
        marginTop: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)',
      }}>+ 添加参数</button>
    </div>
  )
}

function FunctionsTab({ fns, onAdd, onUpdate, onRemove }: {
  fns: CustomFunctionDef[]
  onAdd: () => void
  onUpdate: (idx: number, patch: Partial<CustomFunctionDef>) => void
  onRemove: (idx: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        自定义函数注入表达式作用域，可直接按名调用。函数体内可用内置时间/工具函数与 <code>params</code>。
      </div>
      {fns.map((f, idx) => (
        <div key={idx} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: 10, marginBottom: 10, background: 'var(--bg-base)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input
              style={inputStyle}
              value={f.name}
              placeholder="函数名"
              onChange={(e) => onUpdate(idx, { name: e.target.value })}
            />
            <input
              style={inputStyle}
              value={(f.args ?? []).join(', ')}
              placeholder="形参（逗号分隔）"
              onChange={(e) => onUpdate(idx, { args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
            <button onClick={() => onRemove(idx)} style={{
              padding: '4px 8px', fontSize: 11, cursor: 'pointer',
              background: 'var(--danger-muted)', color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
            }}>✕</button>
          </div>
          <textarea
            style={{
              ...inputStyle, height: 72, padding: 8, resize: 'vertical', lineHeight: 1.5,
            }}
            value={f.body}
            placeholder="return 参数值；如：return today('YYYY-MM-DD') + ' 00:00:00'"
            onChange={(e) => onUpdate(idx, { body: e.target.value })}
          />
        </div>
      ))}
      {fns.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>暂无自定义函数</div>
      )}
      <button onClick={onAdd} style={{
        marginTop: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)',
      }}>+ 添加函数</button>
    </div>
  )
}
