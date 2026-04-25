import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-7 w-full rounded px-2.5 text-[var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'border border-[var(--border)] bg-[var(--bg-surface)]',
      'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]',
      'disabled:cursor-not-allowed disabled:opacity-40',
      'transition-colors duration-[var(--duration-fast)]',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
