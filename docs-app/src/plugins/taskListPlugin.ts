import { Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { notionSchema } from '../schema/notionSchema'
import { inputRules, wrappingInputRule, InputRule } from 'prosemirror-inputrules'

// 点击 checkbox 切换任务状态
export function taskListPlugin() {
  return new Plugin({
    props: {
      handleClickOn(view: EditorView, pos: number, node: any, nodePos: number, event: MouseEvent, direct: boolean) {
        // 检查点击的是否是 checkbox
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
          const $pos = view.state.doc.resolve(nodePos)
          const taskNode = $pos.nodeAfter

          if (taskNode && taskNode.type.name === 'task_item') {
            // 切换 checked 状态
            const tr = view.state.tr.setNodeMarkup(nodePos, undefined, {
              ...taskNode.attrs,
              checked: !taskNode.attrs.checked,
            })
            view.dispatch(tr)
            return true
          }
        }
        return false
      },

      // 自定义 DOM 渲染，添加可交互的 checkbox
      nodeViews: {
        task_item(node, view, getPos) {
          const dom = document.createElement('li')
          dom.className = 'task-item' + (node.attrs.checked ? ' checked' : '')
          dom.setAttribute('data-checked', String(node.attrs.checked))

          const checkbox = document.createElement('input')
          checkbox.type = 'checkbox'
          checkbox.checked = node.attrs.checked
          checkbox.className = 'task-checkbox'
          
          // 点击 checkbox 切换状态
          checkbox.addEventListener('click', (e) => {
            e.preventDefault()
            if (typeof getPos === 'function') {
              const pos = getPos()
              if (pos !== undefined) {
                const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                })
                view.dispatch(tr)
              }
            }
          })

          const content = document.createElement('div')
          content.className = 'task-content'

          dom.appendChild(checkbox)
          dom.appendChild(content)

          return {
            dom,
            contentDOM: content,
            update(updatedNode) {
              if (updatedNode.type.name !== 'task_item') return false
              dom.className = 'task-item' + (updatedNode.attrs.checked ? ' checked' : '')
              dom.setAttribute('data-checked', String(updatedNode.attrs.checked))
              checkbox.checked = updatedNode.attrs.checked
              return true
            },
          }
        },
      },
    },
  })
}

// 任务列表输入规则：- [ ] 和 - [x]
export function taskListInputRules() {
  return inputRules({
    rules: [
      // - [ ] 创建未勾选任务
      new InputRule(/^- \[ \]\s$/, (state, match, start, end) => {
        const { tr } = state
        tr.delete(start, end)
        const taskItem = notionSchema.nodes.task_item.create(
          { checked: false },
          notionSchema.nodes.paragraph.create()
        )
        const taskList = notionSchema.nodes.task_list.create(null, taskItem)
        tr.replaceSelectionWith(taskList)
        return tr
      }),
      // - [x] 创建已勾选任务
      new InputRule(/^- \[x\]\s$/i, (state, match, start, end) => {
        const { tr } = state
        tr.delete(start, end)
        const taskItem = notionSchema.nodes.task_item.create(
          { checked: true },
          notionSchema.nodes.paragraph.create()
        )
        const taskList = notionSchema.nodes.task_list.create(null, taskItem)
        tr.replaceSelectionWith(taskList)
        return tr
      }),
    ],
  })
}

// 键盘快捷键：Cmd+Enter 切换当前任务项
export function toggleTaskCommand(view: EditorView): boolean {
  const { state } = view
  const { $from } = state.selection

  // 查找父级 task_item
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'task_item') {
      const pos = $from.before(d)
      const tr = state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: !node.attrs.checked,
      })
      view.dispatch(tr)
      return true
    }
  }
  return false
}
