import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  FileType,
  FileImage,
  FileVideo,
  File as FileIcon,
  LayoutGrid,
} from 'lucide-react'
import type { DocumentNode, DocType } from '../api/types'

function docIcon(node: DocumentNode, open: boolean) {
  const hasChildren = !!node.children && node.children.length > 0
  const hasContent = !!node.doc_type

  // form_app 类型特殊处理
  if (node.node_type === 'form_app') return <LayoutGrid size={15} />

  // 有内容：显示文件类型图标
  if (hasContent) {
    const map: Record<DocType, JSX.Element> = {
      markdown: <FileText size={15} />,
      word: <FileType size={15} />,
      excel: <FileSpreadsheet size={15} />,
      ppt: <FileType size={15} />,
      pdf: <FileType size={15} />,
      image: <FileImage size={15} />,
      video: <FileVideo size={15} />,
      other: <FileIcon size={15} />,
      '': <FileIcon size={15} />,
    }
    return map[node.doc_type] || <FileIcon size={15} />
  }

  // 无内容但有子节点：显示文件夹图标
  if (hasChildren) {
    return open ? <FolderOpen size={15} /> : <Folder size={15} />
  }

  // 空节点：显示普通文件图标
  return <FileIcon size={15} />
}

/** 拖拽时计算出的目标落点（用于可视化和最终落库） */
export type DropZone = 'before' | 'into' | 'after'

interface TreeItemProps {
  node: DocumentNode
  depth: number
  selectedId: number | null
  onSelect: (n: DocumentNode) => void
  /** 右键触发：父组件拿到节点 + 屏幕坐标，用于弹菜单 */
  onContextMenu?: (n: DocumentNode, x: number, y: number) => void
  /** 当前节点是否可作为拖放目标（默认 true；分享模式 / 无编辑权限时禁用） */
  draggable?: boolean
  /** 当前节点是否可作为拖放目标（不允许拖到自身或后代）。srcId 由父组件传入。 */
  canDropHere?: (srcId: number | null, target: DocumentNode) => boolean
  /** 真正发生 drop 时调用：父组件负责调后端 */
  onMove?: (srcId: number, targetId: number, zone: DropZone) => void
  /** 当前节点是否正在被拖动（用于视觉淡化） */
  isDraggingSelf?: boolean
}

/**
 * 单个树节点：
 *   - 左侧点击：选中节点 + 切换展开
 *   - 右键：弹出上下文菜单
 *   - 拖拽：原生 HTML5 dnd；落点分 before/into/after 三档（鼠标 Y 位置决定）
 *     - before：插入到该节点之前（同 parent 内）
 *     - into：把 src 节点变为该节点的子节点（仅当目标是 folder）
 *     - after：插入到该节点之后（同 parent 内）
 */
function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onContextMenu,
  draggable = true,
  canDropHere,
  onMove,
  isDraggingSelf,
}: TreeItemProps) {
  const [open, setOpen] = useState(depth < 1)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const itemRef = useRef<HTMLDivElement | null>(null)
  // 当前 TreeItem 是否正在被拖动（用于自节点高亮淡化）
  const [selfDragging, setSelfDragging] = useState(false)
  const hasChildren = !!node.children && node.children.length > 0
  const isFolder = node.node_type === 'folder' || hasChildren

  // 拖入时根据鼠标 Y 在 item 中的相对位置决定落点档位。
  function handleDragOver(e: React.DragEvent) {
    if (!draggable || !onMove) return
    const types = e.dataTransfer.types
    // 仅响应 docs-app 自身的拖拽（排除浏览器默认的文件拖入等）
    if (!Array.from(types).includes('application/x-docs-node')) return
    const rect = itemRef.current?.getBoundingClientRect()
    if (!rect) return
    const offsetY = e.clientY - rect.top
    const ratio = offsetY / rect.height
    let zone: DropZone
    if (ratio < 0.3) zone = 'before'
    else if (ratio > 0.7) zone = 'after'
    else zone = isFolder ? 'into' : 'after' // 非 folder 节点没有 into 概念
    // 检查是否允许落点（父组件基于「不能拖到自身或自身后代」判断）
    if (canDropHere) {
      // 拖拽过程中无法从 dataTransfer 读 srcId（仅 drop 可读）；
      // 这里用 setData 之前写入的 types 集合做占位判断，真实 srcId 在 drop 时再校验。
      // canDropHere 的默认实现忽略 srcId，只基于 target 自身属性判断；
      // 父子/后代互斥校验在 ProjectDocsPage 的 onMove 里做。
      if (!canDropHere(null, node)) {
        setDropZone(null)
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }
    e.preventDefault() // 必须 preventDefault 才能 drop
    e.dataTransfer.dropEffect = 'move'
    if (dropZone !== zone) setDropZone(zone)
  }

  function handleDragLeave(e: React.DragEvent) {
    // dragleave 会在进入子元素时触发，所以要判断 relatedTarget 是否真的离开了 item
    const related = e.relatedTarget as Node | null
    if (related && itemRef.current?.contains(related)) return
    setDropZone(null)
  }

  function handleDrop(e: React.DragEvent) {
    if (!draggable || !onMove) return
    const srcIdStr = e.dataTransfer.getData('application/x-docs-node')
    if (!srcIdStr) return
    const srcId = parseInt(srcIdStr, 10)
    if (!srcId || srcId === node.id) {
      setDropZone(null)
      return
    }
    // 拖拽到自身/后代时再次校验（canDropHere 不依赖 srcId，故 drop 时再校验）
    if (canDropHere && !canDropHere(srcId, node)) {
      setDropZone(null)
      return
    }
    const zone: DropZone = dropZone || (isFolder ? 'into' : 'after')
    e.preventDefault()
    e.stopPropagation()
    onMove(srcId, node.id, zone)
    setDropZone(null)
  }

  function handleDragStart(e: React.DragEvent) {
    if (!draggable) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('application/x-docs-node', String(node.id))
    e.dataTransfer.effectAllowed = 'move'
    setSelfDragging(true)
  }

  function handleDragEnd() {
    setSelfDragging(false)
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!onContextMenu) return
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(node, e.clientX, e.clientY)
  }

  // 节点被 dropEffect 接受时显示的落点视觉：上方线 / 高亮 / 下方线
  const dropClass =
    dropZone === 'before'
      ? ' drop-before'
      : dropZone === 'after'
      ? ' drop-after'
      : dropZone === 'into'
      ? ' drop-into'
      : ''

  return (
    <div>
      <div
        ref={itemRef}
        className={
          'tree-node' +
          (selectedId === node.id ? ' selected' : '') +
          (selfDragging || isDraggingSelf ? ' dragging-self' : '') +
          dropClass
        }
        style={{ paddingLeft: 10 + depth * 14 }}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          onSelect(node)
          if (hasChildren) setOpen((o) => !o)
        }}
        onContextMenu={handleContextMenu}
      >
        <span className="caret">
          {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {docIcon(node, open)}
        <span className="label">{node.name}</span>
      </div>
      {open &&
        node.children?.map((c) => (
          <TreeItem
            key={c.id}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            draggable={draggable}
            canDropHere={canDropHere}
            onMove={onMove}
          />
        ))}
    </div>
  )
}

interface DocTreeProps {
  nodes: DocumentNode[]
  selectedId: number | null
  onSelect: (n: DocumentNode) => void
  /** 右键节点：父组件显示自定义菜单 */
  onContextMenu?: (n: DocumentNode, x: number, y: number) => void
  /** 是否允许拖拽（默认 true；分享模式 / 无编辑权限时禁用） */
  draggable?: boolean
  /**
   * 拖放合法性校验：避免把节点拖到自身或自身的后代。
   * 第二个参数为拖拽源节点 id（dragover 时为 null，drop 时由 DocTree 内部传入真实值）；
   * 父组件应根据 srcId + target 关系判断是否允许落点。
   */
  canDropHere?: (srcId: number | null, target: DocumentNode) => boolean
  /** 拖放完成回调 */
  onMove?: (srcId: number, targetId: number, zone: DropZone) => void
}

export default function DocTree({
  nodes,
  selectedId,
  onSelect,
  onContextMenu,
  draggable = true,
  canDropHere,
  onMove,
}: DocTreeProps) {
  if (!nodes.length) {
    return <div className="empty-hint" style={{ marginTop: 40, fontSize: 13 }}>暂无文档</div>
  }
  return (
    <>
      {nodes.map((n) => (
        <TreeItem
          key={n.id}
          node={n}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          draggable={draggable}
          canDropHere={canDropHere}
          onMove={onMove}
        />
      ))}
    </>
  )
}

/**
 * buildDescendantIdSet：把整棵树展平成 id 集合，用于「不能拖到自身或后代」的判断。
 * 父组件传 srcId + 树根 nodes 进来，本函数返回 src 子树的所有 id。
 */
export function buildDescendantIdSet(nodes: DocumentNode[], rootId: number): Set<number> {
  const out = new Set<number>()
  function walk(n: DocumentNode) {
    if (n.children) {
      for (const c of n.children) {
        out.add(c.id)
        walk(c)
      }
    }
  }
  // 找到 rootId 节点并以其为根
  function find(list: DocumentNode[]): DocumentNode | null {
    for (const n of list) {
      if (n.id === rootId) return n
      if (n.children) {
        const f = find(n.children)
        if (f) return f
      }
    }
    return null
  }
  const root = find(nodes)
  if (root) walk(root)
  return out
}

/**
 * useDragGhostClear：拖拽结束后清空浏览器自带的 ghost preview（Chrome 在跨窗口时偶发残留）。
 * 把 dropEffect 设为 none 即可，无需 state。
 */
export function useDragGhostClear() {
  useEffect(() => {
    function end() {
      // no-op，仅用于触发 Chromium 的 ghost 清理
    }
    window.addEventListener('dragend', end)
    return () => window.removeEventListener('dragend', end)
  }, [])
}
