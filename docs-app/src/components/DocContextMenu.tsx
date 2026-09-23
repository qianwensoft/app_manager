import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Copy, Trash2 } from 'lucide-react'
import type { DocumentNode } from '../api/types'

export interface DocContextMenuAction {
  /** 操作唯一 id（用于事件 key） */
  id: string
  /** 显示文案 */
  label: string
  /** lucide-react icon */
  icon: React.ReactNode
  /** 鼠标点击时触发 */
  onClick: () => void
  /** 禁用（灰显且不响应） */
  disabled?: boolean
  /** 危险操作（红色高亮） */
  danger?: boolean
}

interface DocContextMenuProps {
  /** 当前右键命中的节点 */
  node: DocumentNode
  /** 屏幕坐标（由 onContextMenu 事件 clientX/Y 传入） */
  x: number
  y: number
  /** 由父组件提供的可用操作列表 */
  actions: DocContextMenuAction[]
  /** 关闭回调（点击空白 / Esc / 选中某项后） */
  onClose: () => void
}

// DocContextMenu：文档树右键菜单。
// 行为：
//   - 点击菜单项 → 触发 onClick + 自动关闭
//   - 点击菜单外 / 按 Esc → 关闭
//   - 视口边界保护：菜单溢出右/下边缘时自动左/上贴边
export default function DocContextMenu({ node, x, y, actions, onClose }: DocContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x, y })

  // 视口边界保护：菜单弹出后立即测量尺寸，若超出右/下边界则左/上贴边。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = x
    let ny = y
    if (x + rect.width > vw - 8) nx = Math.max(8, vw - rect.width - 8)
    if (y + rect.height > vh - 8) ny = Math.max(8, vh - rect.height - 8)
    setPos({ x: nx, y: ny })
  }, [x, y])

  // 全局点击 + Esc 关闭
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // mousedown 比 click 更早触发，避免点菜单项时被外部 click 监听抢先后再关闭
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="doc-context-menu"
      style={{ left: pos.x, top: pos.y }}
      // 阻止冒泡，否则 ProjectDocsPage 上的其它 listener 可能误触发
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
      aria-label={`节点「${node.name}」的操作菜单`}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={'menu-item' + (a.danger ? ' danger' : '')}
          disabled={a.disabled}
          onClick={() => {
            if (a.disabled) return
            a.onClick()
            onClose()
          }}
        >
          <span className="menu-icon">{a.icon}</span>
          <span className="menu-label">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// 常用 icon 导出，便于父组件直接引用而不必各自 import
export const MenuIcons = {
  Pencil: <Pencil size={14} />,
  Plus: <Plus size={14} />,
  Copy: <Copy size={14} />,
  Trash: <Trash2 size={14} />,
}
