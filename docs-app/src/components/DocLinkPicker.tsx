import { useState } from 'react'
import { Search, FileText, Hash } from 'lucide-react'
import type { DocumentNode, DocumentAnchor } from '../api/types'

interface DocLinkPickerProps {
  nodes: DocumentNode[]
  onSelect: (node: DocumentNode, anchor?: DocumentAnchor) => void
  onClose: () => void
}

// DocLinkPicker：选择文档节点 + 可选锚点的弹窗组件
export default function DocLinkPicker({ nodes, onSelect, onClose }: DocLinkPickerProps) {
  const [query, setQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<DocumentNode | null>(null)

  // 平铺所有节点（含深度）用于搜索
  const flatNodes = flattenNodesForSearch(nodes, 0)
  const filtered = query.trim()
    ? flatNodes.filter((item) => item.node.name.toLowerCase().includes(query.toLowerCase()))
    : flatNodes

  // 解析选中节点的锚点列表
  const anchors: DocumentAnchor[] = selectedNode?.config_json
    ? (() => {
        try {
          const cfg = JSON.parse(selectedNode.config_json)
          return cfg.anchors || []
        } catch {
          return []
        }
      })()
    : []

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal doc-link-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">插入文档链接</div>
        <div className="modal-body">
          <div className="doc-link-picker-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索文档..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="doc-link-picker-body">
            <div className="doc-link-picker-list">
              {filtered.length === 0 && <div className="empty-hint">无匹配文档</div>}
              {filtered.map((item) => (
                <div
                  key={item.node.id}
                  className={'doc-link-picker-item' + (selectedNode?.id === item.node.id ? ' selected' : '')}
                  style={{ paddingLeft: 12 + item.depth * 16 }}
                  onClick={() => setSelectedNode(item.node)}
                  onDoubleClick={() => {
                    onSelect(item.node)
                    onClose()
                  }}
                >
                  <FileText size={14} />
                  <span>{item.node.name}</span>
                </div>
              ))}
            </div>
            {selectedNode && anchors.length > 0 && (
              <div className="doc-link-picker-anchors">
                <div className="doc-link-picker-anchors-title">锚点定位</div>
                <div className="doc-link-picker-anchor-list">
                  {anchors.map((anchor) => (
                    <div
                      key={anchor.id}
                      className="doc-link-picker-anchor-item"
                      style={{ paddingLeft: 12 + anchor.level * 12 }}
                      onClick={() => {
                        onSelect(selectedNode, anchor)
                        onClose()
                      }}
                    >
                      <Hash size={12} />
                      <span>{anchor.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          {selectedNode && (
            <button
              className="btn primary"
              onClick={() => {
                onSelect(selectedNode)
                onClose()
              }}
            >
              插入
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function flattenNodesForSearch(
  nodes: DocumentNode[],
  depth: number,
  out: { node: DocumentNode; depth: number }[] = [],
): { node: DocumentNode; depth: number }[] {
  for (const n of nodes) {
    if (n.node_type === 'doc') {
      out.push({ node: n, depth })
    }
    if (n.children) flattenNodesForSearch(n.children, depth + 1, out)
  }
  return out
}
