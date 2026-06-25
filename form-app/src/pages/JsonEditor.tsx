/**
 * 通用 JSON 代码编辑器（CodeMirror 6），用于 PageDesignerPage 的「JSON 逃生舱」。
 * 受控组件：value + onChange。JSON 语法高亮 + 基础编辑能力。
 */
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json as jsonLang } from '@codemirror/lang-json'

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid #d9d9d9', borderRadius: '4px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { padding: '8px 0' },
  '&.cm-focused': { outline: '2px solid #91caff', outlineOffset: 0 },
})

interface JsonEditorProps {
  value: string
  onChange: (v: string) => void
  minHeight?: number
}

export default function JsonEditor({ value, onChange, minHeight = 360 }: JsonEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const updatingFromParent = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!rootRef.current || viewRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value || '',
        extensions: [
          editorTheme,
          basicSetup,
          jsonLang(),
          EditorView.theme({ '.cm-content': { minHeight: `${minHeight}px` } }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || updatingFromParent.current) return
            onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: rootRef.current,
    })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部值变化同步到编辑器（撤回/重做/重新加载时）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    const next = value ?? ''
    if (cur === next) return
    updatingFromParent.current = true
    view.dispatch({ changes: { from: 0, to: cur.length, insert: next } })
    updatingFromParent.current = false
  }, [value])

  return <div ref={rootRef} style={{ width: '100%' }} />
}
