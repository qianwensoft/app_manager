import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

const sideStyle: Record<string, React.CSSProperties> = {
  top:    { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
  bottom: { top: '100%',   left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
  left:   { right: '100%', top: '50%',  transform: 'translateY(-50%)', marginRight: 6 },
  right:  { left: '100%',  top: '50%',  transform: 'translateY(-50%)', marginLeft: 6 },
}

function Tooltip({ content, children, side = 'top', delay = 400, className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()

  const show = () => { timer.current = setTimeout(() => setVisible(true), delay) }
  const hide = () => { clearTimeout(timer.current); setVisible(false) }

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && content && (
        <span
          className={cn(
            'pointer-events-none absolute z-[var(--z-tooltip)] whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium shadow-lg',
            className
          )}
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-strong)',
            ...sideStyle[side],
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export { Tooltip }
