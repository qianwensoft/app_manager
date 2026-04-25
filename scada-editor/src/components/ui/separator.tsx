import * as React from 'react'
import { cn } from '@/lib/utils'

function Separator({ className, orientation = 'horizontal', ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      className={cn(
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className
      )}
      style={{ background: 'var(--border)' }}
      {...props}
    />
  )
}

export { Separator }
