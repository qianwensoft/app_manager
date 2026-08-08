import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

// 后端 /docs/onlyoffice/config/:id 返回 { config, public_url }；未启用时 503。
interface DsConfigResp {
  config: Record<string, unknown>
  public_url: string
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, cfg: Record<string, unknown>) => { destroyEditor: () => void }
    }
  }
}

// 动态加载 OnlyOffice api.js（幂等）。
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('OnlyOffice api.js 加载失败'))
    document.body.appendChild(s)
  })
}

export default function OnlyOfficeViewer({ nodeId }: { nodeId: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null)
  const [error, setError] = useState('')
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get<DsConfigResp>(`/docs/onlyoffice/config/${nodeId}`)
        if (cancelled) return
        const scriptUrl = data.public_url.replace(/\/$/, '') + '/web-apps/apps/api/documents/api.js'
        await loadScript(scriptUrl)
        if (cancelled || !window.DocsAPI || !containerRef.current) return
        containerRef.current.innerHTML = '<div id="onlyoffice-editor"></div>'
        editorRef.current = new window.DocsAPI.DocEditor('onlyoffice-editor', data.config)
      } catch (e) {
        if (cancelled) return
        // 503 = 未启用；其它为初始化失败。
        const status = (e as { response?: { status?: number } })?.response?.status
        if (status === 503) {
          setDisabled(true)
        } else {
          setError((e as Error).message || 'OnlyOffice 初始化失败')
        }
      }
    })()
    return () => {
      cancelled = true
      try {
        editorRef.current?.destroyEditor()
      } catch {
        /* ignore */
      }
      editorRef.current = null
    }
  }, [nodeId])

  if (disabled) {
    return (
      <div className="viewer-center">
        <div className="empty-hint" style={{ marginTop: 0 }}>
          OnlyOffice 未启用。请在系统后台配置 Document Server 后开启 Office 在线编辑。
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="viewer-center">
        <div className="empty-hint" style={{ marginTop: 0, color: 'var(--danger)' }}>{error}</div>
      </div>
    )
  }
  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
