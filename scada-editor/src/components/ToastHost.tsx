import { useCallback, useRef, useState } from 'react'

export interface ToastItem {
  id: number
  message: string
}

/**
 * 轻量 toast：返回 { toast, node }。
 * toast(msg) 追加一条，3s 后自动移除；node 渲染在页面顶层。
 */
export function useToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const toast = useCallback((message: string) => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const node = (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'rgba(20,20,28,0.92)',
            color: '#fff',
            fontSize: 13,
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.12)',
            maxWidth: 420,
            wordBreak: 'break-word',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )

  return { toast, node }
}
