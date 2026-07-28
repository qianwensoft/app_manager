/**
 * 表达式输入框：CodeMirror 6 + JavaScript，带接口参数表达式作用域的自动补全。
 * 补全项 = 内置访问器/时间/工具函数（BUILTIN_EXPR_COMPLETIONS）
 *        + 全局参数（params.<key> / P('key')）
 *        + 自定义函数（按名）
 *        + 组件名（el('name')）
 */
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { autocompletion, completionKeymap, closeBrackets, type CompletionContext } from '@codemirror/autocomplete'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { BUILTIN_EXPR_COMPLETIONS } from '@/runtime/expression'

export interface ExprScopeInfo {
  /** 全局参数名 */
  paramKeys?: string[]
  /** 自定义函数名 */
  functionNames?: string[]
  /** 组件名（用于 el('name') 提示） */
  elementNames?: string[]
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  scope?: ExprScopeInfo
  height?: number | string
  /** 单行模式：压缩高度、禁用换行 */
  singleLine?: boolean
}

function buildCompletionSource(scope: ExprScopeInfo | undefined) {
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[\w.'"()]*/)
    if (!word) return null
    if (word.from === word.to && !context.explicit) return null
    const options = [
      ...BUILTIN_EXPR_COMPLETIONS.map((c) => ({ label: c.label, detail: c.detail, type: c.type })),
      ...(scope?.paramKeys ?? []).map((k) => ({ label: `params.${k}`, detail: '全局参数', type: 'variable' as const })),
      ...(scope?.functionNames ?? []).map((n) => ({ label: `${n}()`, detail: '自定义函数', type: 'function' as const })),
      ...(scope?.elementNames ?? []).map((n) => ({ label: `el('${n}')`, detail: '组件值', type: 'function' as const })),
    ]
    return { from: word.from, options, validFor: /^[\w.'"()]*$/ }
  }
}

export default function ExpressionInput({ value, onChange, placeholder, scope, height = 60, singleLine = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  const effectiveHeight = singleLine ? 32 : height

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        bracketMatching(),
        closeBrackets(),
        javascript(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // 用函数包一层读取 scopeRef.current，保证补全始终用最新作用域
        autocompletion({ override: [(ctx) => buildCompletionSource(scopeRef.current)(ctx)] }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        singleLine ? [] : EditorView.lineWrapping,
        EditorView.theme({
          '&': { fontSize: '12px', minHeight: typeof effectiveHeight === 'number' ? `${effectiveHeight}px` : effectiveHeight },
          '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)', overflow: singleLine ? 'hidden' : 'auto' },
          '.cm-content': { caretColor: 'var(--accent)', minHeight: typeof effectiveHeight === 'number' ? `${effectiveHeight}px` : effectiveHeight },
          '&.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      // Null the ref first so the [value] effect can't dispatch onto a
      // view that is being torn down (row deletion / remount races).
      viewRef.current = null
      try { view.destroy() } catch { /* view already detached */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleLine])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    try {
      const cur = view.state.doc.toString()
      if (cur !== value) {
        view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
      }
    } catch { /* view mid-teardown; ignore stale sync */ }
  }, [value])

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        position: 'relative',
      }}
    >
      {!value && placeholder && (
        <div style={{
          position: 'absolute', top: 4, left: 8, fontSize: 12,
          color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1,
          fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap',
        }}>
          {placeholder}
        </div>
      )}
      <div ref={hostRef} />
    </div>
  )
}
