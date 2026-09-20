import { downloadUrl, downloadSharedUrl } from '../../api/documents'

// PDF：用浏览器内置 PDF 渲染（分享模式用免登录下载 URL）。
export function PdfViewer({ nodeId, shareMode, shareToken, projectCode }: {
  nodeId: number
  shareMode?: boolean
  shareToken?: string
  projectCode?: string
}) {
  const src = shareMode && shareToken && projectCode
    ? downloadSharedUrl(nodeId, projectCode, shareToken)
    : downloadUrl(nodeId)
  return <iframe className="viewer-frame" src={src} title="pdf" />
}

// 图片：居中展示，支持点击原图下载。
export function ImageViewer({ nodeId, name, shareMode, shareToken, projectCode }: {
  nodeId: number
  name: string
  shareMode?: boolean
  shareToken?: string
  projectCode?: string
}) {
  const src = shareMode && shareToken && projectCode
    ? downloadSharedUrl(nodeId, projectCode, shareToken)
    : downloadUrl(nodeId)
  return (
    <div className="viewer-center">
      <img src={src} alt={name} />
    </div>
  )
}

// 视频：原生 video 播放。
export function VideoViewer({ nodeId, shareMode, shareToken, projectCode }: {
  nodeId: number
  shareMode?: boolean
  shareToken?: string
  projectCode?: string
}) {
  const src = shareMode && shareToken && projectCode
    ? downloadSharedUrl(nodeId, projectCode, shareToken)
    : downloadUrl(nodeId)
  return (
    <div className="viewer-center">
      <video src={src} controls />
    </div>
  )
}

// 其它类型：仅提供下载。
export function DownloadOnlyViewer({ nodeId, name, shareMode, shareToken, projectCode }: {
  nodeId: number
  name: string
  shareMode?: boolean
  shareToken?: string
  projectCode?: string
}) {
  const href = shareMode && shareToken && projectCode
    ? downloadSharedUrl(nodeId, projectCode, shareToken)
    : downloadUrl(nodeId)
  return (
    <div className="viewer-center">
      <div style={{ textAlign: 'center' }}>
        <p className="empty-hint" style={{ marginTop: 0 }}>该文件类型暂不支持在线预览。</p>
        <a className="btn primary" href={href} download={name}>
          下载文件
        </a>
      </div>
    </div>
  )
}
