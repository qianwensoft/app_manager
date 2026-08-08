import { Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

// Callout 和 Toggle 块的自定义渲染和交互
export function calloutTogglePlugin() {
  return new Plugin({
    props: {
      nodeViews: {
        // Callout 节点视图：添加图标
        callout(node, view, getPos) {
          const dom = document.createElement('div')
          dom.className = `callout callout-${node.attrs.type}`
          dom.setAttribute('data-type', node.attrs.type)

          const icon = document.createElement('div')
          icon.className = 'callout-icon'
          
          // 根据类型渲染不同图标
          const iconMap: any = {
            info: Info,
            warning: AlertTriangle,
            error: AlertCircle,
            success: CheckCircle,
          }
          
          const IconComponent = iconMap[node.attrs.type] || Info
          const root = createRoot(icon)
          root.render(createElement(IconComponent, { size: 20 }))

          const content = document.createElement('div')
          content.className = 'callout-content'

          dom.appendChild(icon)
          dom.appendChild(content)

          return {
            dom,
            contentDOM: content,
            update(updatedNode) {
              if (updatedNode.type.name !== 'callout') return false
              dom.className = `callout callout-${updatedNode.attrs.type}`
              dom.setAttribute('data-type', updatedNode.attrs.type)
              
              // 更新图标
              const NewIconComponent = iconMap[updatedNode.attrs.type] || Info
              root.render(createElement(NewIconComponent, { size: 20 }))
              
              return true
            },
            destroy() {
              root.unmount()
            },
          }
        },

        // Toggle 节点视图：添加折叠/展开交互
        toggle_item(node, view, getPos) {
          const dom = document.createElement('details')
          dom.className = 'toggle-item'
          if (node.attrs.open) {
            dom.setAttribute('open', '')
          }

          // 监听折叠/展开事件
          dom.addEventListener('toggle', () => {
            if (typeof getPos === 'function') {
              const pos = getPos()
              if (pos !== undefined) {
                const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  open: dom.open,
                })
                view.dispatch(tr)
              }
            }
          })

          // summary 和 content 由子节点渲染
          return {
            dom,
            contentDOM: dom,
            update(updatedNode) {
              if (updatedNode.type.name !== 'toggle_item') return false
              if (updatedNode.attrs.open !== dom.open) {
                if (updatedNode.attrs.open) {
                  dom.setAttribute('open', '')
                } else {
                  dom.removeAttribute('open')
                }
              }
              return true
            },
          }
        },
      },
    },
  })
}
