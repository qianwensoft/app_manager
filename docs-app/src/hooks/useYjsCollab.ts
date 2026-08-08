import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { getToken } from '../api/client'
import { fetchMe, pickUserColor } from '../api/documents'

export interface YjsCollab {
  ydoc: Y.Doc | null
  provider: WebsocketProvider | null
  connected: boolean
  // 兼容旧 CodeMirror 版本：doc.getText('content')
  ytext: Y.Text | null
}

// useYjsCollab 为某文档房间建立 Yjs 协同：复用后端 /ws/yjs/:room（room=doc-<id>）。
// 返回共享的 Y.Doc / provider / 连接状态；组件卸载时销毁。
// ProseMirror 通过 ydoc.getXmlFragment('prosemirror') 绑定协同编辑。
export function useYjsCollab(nodeId: number | null): YjsCollab {
  const [connected, setConnected] = useState(false)
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<WebsocketProvider | null>(null)
  const [ytext, setYtext] = useState<Y.Text | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)

  useEffect(() => {
    if (!nodeId) return
    const doc = new Y.Doc()
    docRef.current = doc
    const room = 'doc-' + nodeId

    // y-websocket 会自动拼接 /:room，并把 params 转成 query（token 用于后端 JWT 校验）。
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsBase = proto + '://' + window.location.host + '/ws/yjs'
    const wsProvider = new WebsocketProvider(wsBase, room, doc, {
      params: { token: getToken() },
      // connect: true（默认值）。y-websocket 内部会自动重连，因此上层不需自管重连。
      connect: true,
    })
    providerRef.current = wsProvider
    wsProvider.on('status', (e: { status: string }) => {
      setConnected(e.status === 'connected')
    })

    // 协同 awareness：把当前用户名 + 颜色写入本地 user 字段，远程光标会自动渲染「名字标签」。
    // 该字段经 awareness CRDT 在所有客户端间广播，断线自动清理。
    ;(async () => {
      try {
        const me = await fetchMe()
        const name = (me?.username || me?.display_name || `user-${me?.id ?? '?'}`).toString()
        const color = pickUserColor(me?.id ? `u:${me.id}` : name)
        // 防御性二次检查：连接已销毁则不再写入（避免给销毁中的 awareness 状态设置字段）。
        if (wsProvider.awareness && providerRef.current === wsProvider) {
          wsProvider.awareness.setLocalStateField('user', { name, color })
        }
      } catch {
        /* 静默：awareness 无 user 字段时远程光标会回退为默认（无标签） */
      }
    })()

    setYdoc(doc)
    setProvider(wsProvider)
    setYtext(doc.getText('content'))

    return () => {
      // 先断开再销毁：避免出现"WebSocket is closed before the connection is established"
      // 警告（频繁切换节点时尤其常见）。
      try {
        wsProvider.awareness?.setLocalState(null)
      } catch {
        // 忽略 awareness 清理异常
      }
      try {
        wsProvider.disconnect()
      } catch {
        // 忽略 disconnect 异常（如已断开）
      }
      wsProvider.destroy()
      doc.destroy()
      docRef.current = null
      providerRef.current = null
      setYdoc(null)
      setProvider(null)
      setYtext(null)
      setConnected(false)
    }
  }, [nodeId])

  return { ydoc, provider, connected, ytext }
}
