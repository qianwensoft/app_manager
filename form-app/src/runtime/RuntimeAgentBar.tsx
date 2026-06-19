import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScanLine } from 'lucide-react'

type AndroidBridge = {
  scanBarcode?: () => void
  getScanMode?: () => string
  toast?: (msg: string) => void
}

export default function RuntimeAgentBar() {
  const bridge = useMemo(() => {
    if (typeof window === 'undefined') return null
    return (window as Window & { AndroidBridge?: AndroidBridge }).AndroidBridge ?? null
  }, [])

  if (!bridge?.scanBarcode) return null
  // 硬件扫码模式：仅用扫码枪广播，隐藏摄像头扫码悬浮按钮
  if (bridge.getScanMode?.() === 'hardware') return null

  return (
    <div className="runtime-agent-bar">
      <Button
        variant="default"
        size="icon"
        className="runtime-scan-fab h-14 w-14 rounded-full shadow-lg"
        aria-label="扫码"
        onClick={() => bridge.scanBarcode?.()}
      >
        <ScanLine className="h-6 w-6" />
      </Button>
    </div>
  )
}
