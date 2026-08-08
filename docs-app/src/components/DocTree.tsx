import { useState } from 'react'
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

interface TreeItemProps {
  node: DocumentNode
  depth: number
  selectedId: number | null
  onSelect: (n: DocumentNode) => void
}

function TreeItem({ node, depth, selectedId, onSelect }: TreeItemProps) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = !!node.children && node.children.length > 0

  return (
    <div>
      <div
        className={'tree-node' + (selectedId === node.id ? ' selected' : '')}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => {
          onSelect(node)
          if (hasChildren) setOpen((o) => !o)
        }}
      >
        <span className="caret">
          {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {docIcon(node, open)}
        <span className="label">{node.name}</span>
      </div>
      {open &&
        node.children?.map((c) => (
          <TreeItem key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
        ))}
    </div>
  )
}

interface DocTreeProps {
  nodes: DocumentNode[]
  selectedId: number | null
  onSelect: (n: DocumentNode) => void
}

export default function DocTree({ nodes, selectedId, onSelect }: DocTreeProps) {
  if (!nodes.length) {
    return <div className="empty-hint" style={{ marginTop: 40, fontSize: 13 }}>暂无文档</div>
  }
  return (
    <>
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </>
  )
}
