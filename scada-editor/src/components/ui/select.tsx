import * as React from 'react'
import { cn } from '@/lib/utils'

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-7 w-full rounded px-2.5 text-[var(--text-sm)] text-[var(--text-primary)]',
        'border border-[var(--border)] bg-[var(--bg-surface)]',
        'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'transition-colors duration-[var(--duration-fast)]',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export { Select }
