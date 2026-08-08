import { useEffect, useReducer, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import { EditorState, type Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules'
import { gapCursor } from 'prosemirror-gapcursor'
import { dropCursor } from 'prosemirror-dropcursor'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from 'y-prosemirror'
import {
  Bold, Italic, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Link2, Undo2, Redo2,
  CheckSquare, Table, Info
} from 'lucide-react'
import { notionSchema, notionMarkdownParser, notionMarkdownSerializer } from '../../schema/notionSchema'
import { slashMenuPlugin, closeSlashMenu, type SlashMenuState } from '../../plugins/slashMenuPlugin'
import { taskListPlugin, taskListInputRules, toggleTaskCommand } from '../../plugins/taskListPlugin'
import { tablePlugins } from '../../plugins/tablePlugin'
import { dragHandlePlugin } from '../../plugins/dragHandlePlugin'
import { calloutTogglePlugin } from '../../plugins/calloutTogglePlugin'
import SlashMenu from './SlashMenu'
import FloatingMenu from './FloatingMenu'
import DragHandle from './DragHandle'
import BlockContextMenu from './BlockContextMenu'
import DocLinkPicker from '../DocLinkPicker'
import type { DocumentNode, DocumentAnchor } from '../../api/types'

// buildInputRules 提供常见 Markdown 快捷输入（# 标题、> 引用、- 列表、``` 代码块 等）。
function buildInputRules() {
  const rules = [...smartQuotes, ellipsis, emDash]
  // > 引用
  if (notionSchema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, notionSchema.nodes.blockquote))
  }
  // 1. 有序列表
  if (notionSchema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        notionSchema.nodes.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1],
      ),
    )
  }
  // - / + / * 无序列表
  if (notionSchema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, notionSchema.nodes.bullet_list))
  }
  // ``` 代码块
  if (notionSchema.nodes.code_block) {
    rules.push(textblockTypeInputRule(/^```$/, notionSchema.nodes.code_block))
  }
  // # ~ ###### 标题
  if (notionSchema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, notionSchema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
    )
  }
  return inputRules({ rules })
}

// markActive 判断当前选区是否含指定 mark。
function markActive(state: EditorState, type: any): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

// blockActive 判断当前块是否为指定 type/attrs。
function blockActive(state: EditorState, type: any, attrs: Record<string, any> = {}): boolean {
  const { $from, to, node } = state.selection as any
  if (node) return node.hasMarkup(type, attrs)
  return to <= $from.end() && $from.parent.hasMarkup(type, attrs)
}

export interface ProseMirrorEditorProps {
  ydoc: Y.Doc
  provider: WebsocketProvider
  // 每个 RichText 块使用独立 XmlFragment（key），实现块级协同。
  fragmentKey: string
  canEdit: boolean
  // 首次为空时用于注入的 Markdown 种子（来自后端已保存内容）。
  initialMarkdown?: string
  // 内容变化时回调最新 Markdown（供上层组合保存）。
  onMarkdownChange?: (fragmentKey: string, markdown: string) => void
  onSelectionChange?: (text: string) => void
  // 文档节点树（用于文档链接选择器）
  docNodes?: DocumentNode[]
}

// ProseMirrorEditor：使用 notionSchema 的协同富文本编辑器，集成 Notion 风格特性。
export default function ProseMirrorEditor({
  ydoc,
  provider,
  fragmentKey,
  canEdit,
  initialMarkdown,
  onMarkdownChange,
  onSelectionChange,
  docNodes = [],
}: ProseMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [, forceToolbar] = useReducer((x) => x + 1, 0)
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState>({ active: false, pos: 0, query: '' })
  const [showDocLinkPicker, setShowDocLinkPicker] = useState(false)

  useEffect(() => {
    if (!hostRef.current) return
    const yXmlFragment = ydoc.getXmlFragment(fragmentKey)

    const plugins = [
      // y-prosemirror 三件套：同步、光标 awareness、基于 Yjs 的撤销/重做。
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(provider.awareness),
      yUndoPlugin(),
      // Notion 特性插件
      slashMenuPlugin((state) => setSlashMenuState(state)),
      taskListPlugin(),
      taskListInputRules(),
      ...tablePlugins(),
      dragHandlePlugin(),
      calloutTogglePlugin(),
      // 键盘快捷键
      keymap({
        'Mod-z': yUndo,
        'Mod-y': yRedo,
        'Mod-Shift-z': yRedo,
        'Mod-b': toggleMark(notionSchema.marks.strong),
        'Mod-i': toggleMark(notionSchema.marks.em),
        'Mod-`': toggleMark(notionSchema.marks.code),
        'Mod-Enter': (state, dispatch) => toggleTaskCommand(view),
        Enter: splitListItem(notionSchema.nodes.list_item),
        'Shift-Tab': liftListItem(notionSchema.nodes.list_item),
        Tab: sinkListItem(notionSchema.nodes.list_item),
      }),
      keymap(baseKeymap),
      buildInputRules(),
      dropCursor(),
      gapCursor(),
    ]

    const state = EditorState.create({ schema: notionSchema, plugins })
    const viewHolder: { current: EditorView | null } = { current: null }
    const view = new EditorView(hostRef.current, {
      state,
      editable: () => canEdit,
      dispatchTransaction(tr) {
        const cur = viewHolder.current
        if (!cur) return
        const newState = cur.state.apply(tr)
        cur.updateState(newState)
        forceToolbar()
        if (tr.docChanged && onMarkdownChange) {
          onMarkdownChange(fragmentKey, notionMarkdownSerializer.serialize(newState.doc))
        }
        if (tr.selectionSet && onSelectionChange) {
          const { from, to } = newState.selection
          onSelectionChange(from === to ? '' : newState.doc.textBetween(from, to, ' '))
        }
      },
    })
    viewHolder.current = view
    viewRef.current = view

    // 种子注入：等待短暂同步窗口，若 fragment 仍为空则用后端 Markdown 注入，避免多端重复。
    let seedTimer: number | undefined
    const trySeed = () => {
      if (!initialMarkdown) return
      if (yXmlFragment.length === 0) {
        const parsed = notionMarkdownParser.parse(initialMarkdown)
        if (parsed) {
          const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, parsed.content)
          view.dispatch(tr.setMeta('addToHistory', false))
        }
      }
    }
    seedTimer = window.setTimeout(trySeed, 400)
    const onSynced = () => { window.clearTimeout(seedTimer); seedTimer = window.setTimeout(trySeed, 50) }
    provider.on('sync', onSynced)

    return () => {
      window.clearTimeout(seedTimer)
      provider.off('sync', onSynced)
      view.destroy()
      viewRef.current = null
    }
  }, [ydoc, provider, fragmentKey, canEdit])

  // run 执行编辑命令并保持焦点。
  function run(cmd: Command) {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, view.dispatch, view)
    view.focus()
  }

  function toggleHeading(level: number) {
    return () => {
      const view = viewRef.current
      if (!view) return
      const isH = blockActive(view.state, notionSchema.nodes.heading, { level })
      run(isH
        ? setBlockType(notionSchema.nodes.paragraph)
        : setBlockType(notionSchema.nodes.heading, { level }))
    }
  }

  function insertLink() {
    if (docNodes.length > 0) {
      // 使用文档链接选择器
      setShowDocLinkPicker(true)
    } else {
      // 回退到简单 URL 输入
      const view = viewRef.current
      if (!view) return
      const href = window.prompt('链接地址 URL')
      if (!href) return
      run(toggleMark(notionSchema.marks.link, { href }))
    }
  }

  function handleDocLinkSelect(node: DocumentNode, anchor?: DocumentAnchor) {
    const view = viewRef.current
    if (!view) return
    // 构造链接：/d/:code 或 /d/:code#anchor-id
    let href = `/d/${encodeURIComponent(node.code)}`
    if (anchor) {
      href += `#${anchor.id}`
    }
    run(toggleMark(notionSchema.marks.link, { href }))
  }

  function insertDivider() {
    const view = viewRef.current
    if (!view || !notionSchema.nodes.horizontal_rule) return
    const hr = notionSchema.nodes.horizontal_rule.create()
    view.dispatch(view.state.tr.replaceSelectionWith(hr).scrollIntoView())
    view.focus()
  }

  function insertTaskList() {
    const view = viewRef.current
    if (!view) return
    const taskItem = notionSchema.nodes.task_item.create(
      { checked: false },
      notionSchema.nodes.paragraph.create()
    )
    const taskList = notionSchema.nodes.task_list.create(null, taskItem)
    view.dispatch(view.state.tr.replaceSelectionWith(taskList))
    view.focus()
  }

  function insertTable() {
    const view = viewRef.current
    if (!view) return
    const { table, table_row, table_cell } = notionSchema.nodes
    const cells = []
    for (let i = 0; i < 3; i++) {
      cells.push(table_cell.create(null, notionSchema.nodes.paragraph.create()))
    }
    const rows = []
    for (let i = 0; i < 3; i++) {
      rows.push(table_row.create(null, cells))
    }
    const tableNode = table.create(null, rows)
    view.dispatch(view.state.tr.replaceSelectionWith(tableNode))
    view.focus()
  }

  function insertCallout(type: 'info' | 'warning' | 'error' | 'success') {
    return () => {
      const view = viewRef.current
      if (!view) return
      const callout = notionSchema.nodes.callout.create(
        { type },
        notionSchema.nodes.paragraph.create()
      )
      view.dispatch(view.state.tr.replaceSelectionWith(callout))
      view.focus()
    }
  }

  const st = viewRef.current?.state
  const is = (fn: () => boolean) => (st ? fn() : false)

  return (
    <div className="pm-editor">
      {canEdit && (
        <div className="pm-toolbar">
          <button type="button" className={'pm-tb' + (is(() => markActive(st!, notionSchema.marks.strong)) ? ' active' : '')} title="加粗 (Ctrl+B)" onMouseDown={(e) => { e.preventDefault(); run(toggleMark(notionSchema.marks.strong)) }}><Bold size={15} /></button>
          <button type="button" className={'pm-tb' + (is(() => markActive(st!, notionSchema.marks.em)) ? ' active' : '')} title="斜体 (Ctrl+I)" onMouseDown={(e) => { e.preventDefault(); run(toggleMark(notionSchema.marks.em)) }}><Italic size={15} /></button>
          <button type="button" className={'pm-tb' + (is(() => markActive(st!, notionSchema.marks.code)) ? ' active' : '')} title="行内代码" onMouseDown={(e) => { e.preventDefault(); run(toggleMark(notionSchema.marks.code)) }}><Code size={15} /></button>
          <span className="pm-sep" />
          <button type="button" className={'pm-tb' + (is(() => blockActive(st!, notionSchema.nodes.heading, { level: 1 })) ? ' active' : '')} title="标题 1" onMouseDown={(e) => { e.preventDefault(); toggleHeading(1)() }}><Heading1 size={15} /></button>
          <button type="button" className={'pm-tb' + (is(() => blockActive(st!, notionSchema.nodes.heading, { level: 2 })) ? ' active' : '')} title="标题 2" onMouseDown={(e) => { e.preventDefault(); toggleHeading(2)() }}><Heading2 size={15} /></button>
          <button type="button" className={'pm-tb' + (is(() => blockActive(st!, notionSchema.nodes.heading, { level: 3 })) ? ' active' : '')} title="标题 3" onMouseDown={(e) => { e.preventDefault(); toggleHeading(3)() }}><Heading3 size={15} /></button>
          <span className="pm-sep" />
          <button type="button" className="pm-tb" title="无序列表" onMouseDown={(e) => { e.preventDefault(); run(wrapInList(notionSchema.nodes.bullet_list)) }}><List size={15} /></button>
          <button type="button" className="pm-tb" title="有序列表" onMouseDown={(e) => { e.preventDefault(); run(wrapInList(notionSchema.nodes.ordered_list)) }}><ListOrdered size={15} /></button>
          <button type="button" className="pm-tb" title="任务列表" onMouseDown={(e) => { e.preventDefault(); insertTaskList() }}><CheckSquare size={15} /></button>
          <button type="button" className={'pm-tb' + (is(() => blockActive(st!, notionSchema.nodes.blockquote)) ? ' active' : '')} title="引用" onMouseDown={(e) => { e.preventDefault(); run(wrapIn(notionSchema.nodes.blockquote)) }}><Quote size={15} /></button>
          <span className="pm-sep" />
          <button type="button" className="pm-tb" title="表格" onMouseDown={(e) => { e.preventDefault(); insertTable() }}><Table size={15} /></button>
          <button type="button" className="pm-tb" title="信息提示" onMouseDown={(e) => { e.preventDefault(); insertCallout('info')() }}><Info size={15} /></button>
          <button type="button" className="pm-tb" title="链接" onMouseDown={(e) => { e.preventDefault(); insertLink() }}><Link2 size={15} /></button>
          <button type="button" className="pm-tb" title="分割线" onMouseDown={(e) => { e.preventDefault(); insertDivider() }}><Minus size={15} /></button>
          <span className="pm-sep" />
          <button type="button" className="pm-tb" title="撤销 (Ctrl+Z)" onMouseDown={(e) => { e.preventDefault(); viewRef.current && yUndo(viewRef.current.state) }}><Undo2 size={15} /></button>
          <button type="button" className="pm-tb" title="重做 (Ctrl+Y)" onMouseDown={(e) => { e.preventDefault(); viewRef.current && yRedo(viewRef.current.state) }}><Redo2 size={15} /></button>
        </div>
      )}
      <div className="pm-host" ref={hostRef} />
      
      {/* Notion 风格交互组件 */}
      {canEdit && slashMenuState.active && viewRef.current && (
        <SlashMenu
          view={viewRef.current}
          pos={slashMenuState.pos}
          query={slashMenuState.query}
          onClose={() => closeSlashMenu(viewRef.current!)}
        />
      )}
      {canEdit && <FloatingMenu view={viewRef.current} />}
      {canEdit && <DragHandle view={viewRef.current} />}
      {canEdit && <BlockContextMenu view={viewRef.current} />}
      {showDocLinkPicker && docNodes.length > 0 && (
        <DocLinkPicker
          nodes={docNodes}
          onSelect={handleDocLinkSelect}
          onClose={() => setShowDocLinkPicker(false)}
        />
      )}
    </div>
  )
}
