import * as React from 'react'
import { cn } from '@/lib/utils'

/* Lightweight dropdown menu — no Radix dependency */

interface DropdownMenuContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}
const Ctx = React.createContext<DropdownMenuContextValue>({ open: false, setOpen: () => {} })

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      <div className="relative inline-flex" ref={ref}>{children}</div>
    </Ctx.Provider>
  )
}

function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { open, setOpen } = React.useContext(Ctx)
  const toggle = () => setOpen(!open)
  if (asChild && React.isValidElement(children))
    return React.cloneElement(children as React.ReactElement<any>, { onClick: toggle })
  return <span onClick={toggle}>{children}</span>
}

function DropdownMenuContent({ children, className, align = 'start', ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' | 'center' }) {
  const { open } = React.useContext(Ctx)
  if (!open) return null

  const alignClass = align === 'end' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'

  return (
    <div
      className={cn(
        'absolute top-full mt-1 min-w-[160px] rounded-md py-1 shadow-[var(--shadow-lg)] z-[var(--z-dropdown)]',
        alignClass, className
      )}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuItem({ children, className, onClick, disabled, ...props }: React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }) {
  const { setOpen } = React.useContext(Ctx)
  return (
    <div
      role="menuitem"
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-[var(--text-sm)] cursor-pointer select-none',
        'text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
        'transition-colors duration-[var(--duration-fast)]',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      onClick={(e) => { onClick?.(e); setOpen(false) }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn('my-1 h-px', className)} style={{ background: 'var(--border)' }} />
}

function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]', className)}>
      {children}
    </div>
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel }
