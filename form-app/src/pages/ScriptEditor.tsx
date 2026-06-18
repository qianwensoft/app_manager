/**
 * 事件「运行脚本」动作的代码编辑器（CodeMirror 6）。
 * - JavaScript 语法高亮 + 基础编辑能力
 * - ctx.* 成员自动补全（与运行时 ScriptApi 同步）
 *
 * 受控组件：value + onChange。
 */
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { placeholder as cmPlaceholder } from '@codemirror/view'

// ctx API 补全项：label + 插入文本 + 说明（与 eventEngine.ScriptApi 保持一致）
const CTX_MEMBERS: Array<{ label: string; apply: string; detail: string }> = [
  { label: 'scan', apply: 'scan', detail: '触发值（扫码/事件原始值）' },
  { label: 'event', apply: 'event', detail: '事件载荷' },
  { label: 'values', apply: 'values', detail: '当前表单值快照' },
  { label: 'get', apply: "get('')", detail: '读取字段值 get(field)' },
  { label: 'set', apply: "set('', )", detail: '写入字段值 set(field, value)' },
  { label: 'setProp', apply: "setProp('', '', )", detail: '设字段属性 setProp(field, prop, value)' },
  { label: 'callInterface', apply: "await ctx.callInterface('', {})", detail: '调接口（返回 Promise）' },
  { label: 'print', apply: "await ctx.print('')", detail: '打印模板 print(templateId, extra?)' },
  { label: 'navigate', apply: "navigate('', {})", detail: '跳转页面 navigate(pageKey, params?)' },
  { label: 'toast', apply: "toast('')", detail: '顶部提示' },
  { label: 'speak', apply: "speak('')", detail: '语音播报' },
  { label: 'emit', apply: "emit('', {})", detail: '触发自定义事件 emit(name, data?)' },
]

const consoleMethods = [
  { label: 'log', type: 'method', apply: 'log()' },
  { label: 'warn', type: 'method', apply: 'warn()' },
  { label: 'error', type: 'method', apply: 'error()' },
]
const jsonStatic = [
  { label: 'parse', type: 'method', apply: "parse('')" },
  { label: 'stringify', type: 'method', apply: 'stringify(null, null, 2)' },
]

function dotCompletion(before: string, pos: number, prefix: string, options: any[]) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = before.match(new RegExp(`${esc}\\.(\\w*)$`))
  if (!m) return null
  const partial = (m[1] || '').toLowerCase()
  const from = pos - (m[1] || '').length
  const list = options.filter(o => o.label.toLowerCase().startsWith(partial))
  if (!list.length) return null
  return { from, options: list, validFor: /^\w*$/ }
}

const scriptCompletion = javascriptLanguage.data.of({
  autocomplete(context: any) {
    const before = context.state.doc.sliceString(0, context.pos)
    // ctx.<member>
    let r = dotCompletion(
      before, context.pos, 'ctx',
      CTX_MEMBERS.map(m => ({ label: m.label, type: 'property', apply: m.apply, detail: m.detail })),
    )
    if (r) return r
    r = dotCompletion(before, context.pos, 'console', consoleMethods)
    if (r) return r
    r = dotCompletion(before, context.pos, 'JSON', jsonStatic)
    if (r) return r
    // 裸 "ctx" 关键词提示
    const word = context.matchBefore(/\w*/)
    if (word && word.text && 'ctx'.startsWith(word.text.toLowerCase()) && word.from !== word.to) {
      return { from: word.from, options: [{ label: 'ctx', type: 'variable', detail: '运行时上下文 API' }], validFor: /^\w*$/ }
    }
    return null
  },
})

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid #d9d9d9', borderRadius: '4px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { padding: '8px 0' },
  '&.cm-focused': { outline: '2px solid #91caff', outlineOffset: 0 },
})

const PLACEHOLDER = `// 用 ctx 访问运行时能力，例如：
// if (!ctx.get('qty')) {
//   ctx.setProp('qty', 'background', '#fff1f0')
//   ctx.speak('数量为空')
// }
// const r = await ctx.callInterface('check_stock', { code: ctx.scan })
`

interface ScriptEditorProps {
  value: string
  onChange: (v: string) => void
  minHeight?: number
}

export default function ScriptEditor({ value, onChange, minHeight = 180 }: ScriptEditorProps) {
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
          javascript(),
          scriptCompletion,
          cmPlaceholder(PLACEHOLDER),
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

  // 外部值变化同步到编辑器
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
