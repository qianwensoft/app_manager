import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const variantClass: Record<BadgeVariant, string> = {
  default: 'tag',
  accent:  'tag tag-accent',
  success: 'tag tag-success',
  warning: 'tag tag-warning',
  danger:  'tag tag-danger',
  info:    'bg-[var(--info-muted)] text-[var(--info)] border border-[rgba(6,182,212,0.3)] inline-flex items-center px-2 py-[1px] rounded-full text-[11px] font-medium',
}

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <span ref={ref} className={cn(variantClass[variant], className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge }
