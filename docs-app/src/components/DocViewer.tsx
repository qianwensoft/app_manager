import type { DocumentNode } from '../api/types'
import MarkdownEditor from './viewers/MarkdownEditor'
import OnlyOfficeViewer from './viewers/OnlyOfficeViewer'
import FormAppViewer from './viewers/FormAppViewer'
import { PdfViewer, ImageViewer, VideoViewer, DownloadOnlyViewer } from './viewers/SimpleViewers'

interface DocViewerProps {
  node: DocumentNode
  canEdit: boolean
  onSelectionChange?: (text: string) => void
}

// 按节点类型 / DocType 分发到对应渲染器。
// 所有节点（含 folder）都可承载内容：folder 无上传文件时默认进入 Markdown 协同编辑。
export default function DocViewer({ node, canEdit, onSelectionChange }: DocViewerProps) {
  if (node.node_type === 'form_app') {
    return <FormAppViewer node={node} />
  }

  // 二进制类文档（Office/PDF/图片/视频）依赖已上传的文件；无文件时才提示上传。
  const BINARY_TYPES = ['word', 'excel', 'ppt', 'pdf', 'image', 'video']
  if (BINARY_TYPES.includes(node.doc_type) && !node.storage_path) {
    return (
      <div className="viewer-center">
        <div className="empty-hint" style={{ marginTop: 0 }}>该文档尚无文件，请先上传。</div>
      </div>
    )
  }

  switch (node.doc_type) {
    case 'word':
    case 'excel':
    case 'ppt':
      return <OnlyOfficeViewer nodeId={node.id} />
    case 'pdf':
      return <PdfViewer nodeId={node.id} />
    case 'image':
      return <ImageViewer nodeId={node.id} name={node.name} />
    case 'video':
      return <VideoViewer nodeId={node.id} />
    default:
      // markdown / 空 / 未知类型：默认进入协同 Markdown 编辑器，右侧始终可编辑。
      return <MarkdownEditor nodeId={node.id} canEdit={canEdit} onSelectionChange={onSelectionChange} />
  }
}
