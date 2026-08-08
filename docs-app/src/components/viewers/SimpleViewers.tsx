import { downloadUrl } from '../../api/documents'

// PDF：用浏览器内置 PDF 渲染（iframe 指向带 token 的下载 URL）。
export function PdfViewer({ nodeId }: { nodeId: number }) {
  return <iframe className="viewer-frame" src={downloadUrl(nodeId)} title="pdf" />
}

// 图片：居中展示，支持点击原图下载。
export function ImageViewer({ nodeId, name }: { nodeId: number; name: string }) {
  return (
    <div className="viewer-center">
      <img src={downloadUrl(nodeId)} alt={name} />
    </div>
  )
}

// 视频：原生 video 播放。
export function VideoViewer({ nodeId }: { nodeId: number }) {
  return (
    <div className="viewer-center">
      <video src={downloadUrl(nodeId)} controls />
    </div>
  )
}

// 其它类型：仅提供下载。
export function DownloadOnlyViewer({ nodeId, name }: { nodeId: number; name: string }) {
  return (
    <div className="viewer-center">
      <div style={{ textAlign: 'center' }}>
        <p className="empty-hint" style={{ marginTop: 0 }}>该文件类型暂不支持在线预览。</p>
        <a className="btn primary" href={downloadUrl(nodeId)} download={name}>
          下载文件
        </a>
      </div>
    </div>
  )
}
