import { getToken } from '../../api/client'
import type { DocumentNode } from '../../api/types'

// 表单应用节点：iframe 嵌入 form-app runtime。ConfigJSON 解析 form_code / open_mode。
export default function FormAppViewer({ node }: { node: DocumentNode }) {
  let formCode = ''
  let openMode = 'iframe'
  try {
    const cfg = node.config_json ? JSON.parse(node.config_json) : {}
    formCode = cfg.form_code || ''
    openMode = cfg.open_mode || 'iframe'
  } catch {
    /* ignore */
  }

  if (!formCode) {
    return (
      <div className="viewer-center">
        <div className="empty-hint" style={{ marginTop: 0 }}>未配置表单应用（form_code）。</div>
      </div>
    )
  }

  const url = `/form-app/runtime/${encodeURIComponent(formCode)}?_token=${encodeURIComponent(getToken())}`

  if (openMode === 'blank') {
    return (
      <div className="viewer-center">
        <a className="btn primary" href={url} target="_blank" rel="noreferrer">
          在新标签页打开表单
        </a>
      </div>
    )
  }
  return <iframe className="viewer-frame" src={url} title={node.name} />
}
