import * as React from 'react'
import { cn } from '@/lib/utils'

interface DialogContextValue { open: boolean; setOpen: (v: boolean) => void }
const DialogContext = React.createContext<DialogContextValue>({ open: false, setOpen: () => {} })

interface DialogProps {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  children: React.ReactNode
}

function Dialog({ open: ctrl, onOpenChange, children }: DialogProps) {
  const [internal, setInternal] = React.useState(false)
  const open = ctrl ?? internal
  const setOpen = (v: boolean) => { setInternal(v); onOpenChange?.(v) }

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
}

function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogContext)
  if (asChild && React.isValidElement(children))
    return React.cloneElement(children as React.ReactElement<any>, { onClick: () => setOpen(true) })
  return <span onClick={() => setOpen(true)}>{children}</span>
}

function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = React.useContext(DialogContext)
  if (!open) return null
  return (
    <>
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 shadow-[var(--shadow-lg)]',
          className
        )}
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        {...props}
      >
        {children}
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          aria-label="关闭"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 space-y-1', className)} {...props} />
}
function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[var(--text-lg)] font-semibold text-[var(--text-primary)]', className)} {...props} />
}
function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[var(--text-sm)] text-[var(--text-muted)]', className)} {...props} />
}
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
}

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
