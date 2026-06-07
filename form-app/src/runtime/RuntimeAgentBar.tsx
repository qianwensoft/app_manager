import { useMemo } from 'react'
import { Button } from 'antd'

type AndroidBridge = {
  scanBarcode?: () => void
  toast?: (msg: string) => void
}

export default function RuntimeAgentBar() {
  const bridge = useMemo(() => {
    if (typeof window === 'undefined') return null
    return (window as Window & { AndroidBridge?: AndroidBridge }).AndroidBridge ?? null
  }, [])

  if (!bridge?.scanBarcode) return null

  return (
    <div className="runtime-agent-bar">
      <Button
        type="primary"
        shape="circle"
        size="large"
        className="runtime-scan-fab"
        aria-label="扫码"
        onClick={() => bridge.scanBarcode?.()}
      >
        扫
      </Button>
    </div>
  )
}
