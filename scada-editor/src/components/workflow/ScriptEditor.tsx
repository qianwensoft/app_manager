/**
 * 脚本编辑器：CodeMirror 6 + JavaScript，带 ctx.* / ctx.utils.* / ctx.libs.* 自动补全。
 * 补全项来自 scriptApi.ctxCompletions（单一来源），额外补充已加载外部库名。
 */
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { autocompletion, completionKeymap, closeBrackets, type CompletionContext } from '@codemirror/autocomplete'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { ctxCompletions } from '@/runtime/workflow/scriptApi'
import { getLoadedLibs } from '@/runtime/workflow/libLoader'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  height?: number | string
}

function ctxCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/[\w.]*/)
  if (!word) return null
  if (word.from === word.to && !context.explicit) return null
  const libNames = Object.keys(getLoadedLibs())
  const options = [
    ...ctxCompletions.map((c) => ({
      label: c.label,
      detail: c.detail,
      type: c.type,
    })),
    ...libNames.map((n) => ({ label: `ctx.libs.${n}`, detail: '外部库', type: 'variable' as const })),
  ]
  return { from: word.from, options, validFor: /^[\w.()]*$/ }
}

export default function ScriptEditor({ value, onChange, placeholder, height = 240 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        closeBrackets(),
        javascript(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        autocompletion({ override: [ctxCompletionSource] }),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        EditorView.theme({
          '&': { fontSize: '12px', height: typeof height === 'number' ? `${height}px` : height },
          '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)', overflow: 'auto' },
          '.cm-content': { caretColor: 'var(--accent)' },
          '&.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化（如切换节点）时同步
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
        position: 'relative',
      }}
    >
      {!value && placeholder && (
        <div style={{
          position: 'absolute', top: 4, left: 40, fontSize: 12,
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
