/**
 * 运行时「页面布局 / 展示」组件（Formily 自定义 void 组件），由布局设计器拖入。
 *
 * 这些组件不绑定字段值（x-component 节点 type 为 'void'），用于把「整个页面」而不仅
 * 是表单字段表达出来：页头、分区容器、分割线、静态图片 / 文本。它们与具体 UI 库无关，
 * 各组件库的组件表都会合并这一份（见 componentLibraries/antd.tsx 的 sharedComponents）。
 *
 * 响应式：尽量用百分比 / flex，不写死像素宽度，保证桌面 antd 与移动 antd-mobile 下
 * 都能自适应排布。
 */
import { type ReactNode, type CSSProperties } from 'react'

// ── 页头 ──────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title?: string
  subtitle?: string
  align?: 'left' | 'center'
  background?: string
  color?: string
}

export function PageHeader(props: PageHeaderProps) {
  const { title = '页面标题', subtitle, align = 'left', background, color } = props
  return (
    <div
      style={{
        padding: '16px 4px',
        textAlign: align,
        background,
        color,
        borderRadius: background ? 8 : undefined,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  )
}

// ── 分区容器 ──────────────────────────────────────────────────────────

interface SectionProps {
  title?: string
  bordered?: boolean
  background?: string
  children?: ReactNode
}

export function Section(props: SectionProps) {
  const { title, bordered = true, background, children } = props
  return (
    <div
      style={{
        border: bordered ? '1px solid #f0f0f0' : undefined,
        borderRadius: 8,
        background: background || '#fff',
        padding: 12,
        marginBottom: 12,
      }}
    >
      {title && (
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      )}
      {children}
    </div>
  )
}

// ── 分割线 ────────────────────────────────────────────────────────────

interface DividerProps {
  text?: string
  dashed?: boolean
}

export function Divider(props: DividerProps) {
  const { text, dashed } = props
  const line: CSSProperties = {
    flex: 1,
    borderTop: `1px ${dashed ? 'dashed' : 'solid'} #e5e7eb`,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
      <span style={line} />
      {text && <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{text}</span>}
      {text && <span style={line} />}
    </div>
  )
}

// ── 静态图片 ──────────────────────────────────────────────────────────

interface StaticImageProps {
  src?: string
  alt?: string
  width?: string | number
  rounded?: boolean
}

export function StaticImage(props: StaticImageProps) {
  const { src, alt = '', width = '100%', rounded } = props
  if (!src) {
    return (
      <div
        style={{
          width,
          height: 120,
          background: '#f5f6fa',
          border: '1px dashed #d9d9d9',
          borderRadius: rounded ? 8 : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#bbb',
          fontSize: 12,
        }}
      >
        图片
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{ width, maxWidth: '100%', borderRadius: rounded ? 8 : 0, display: 'block' }}
    />
  )
}

// ── 静态文本 ──────────────────────────────────────────────────────────

interface StaticTextProps {
  content?: string
  fontSize?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  bold?: boolean
}

export function StaticText(props: StaticTextProps) {
  const { content = '文本', fontSize = 14, color = '#333', align = 'left', bold } = props
  return (
    <div
      style={{
        fontSize,
        color,
        textAlign: align,
        fontWeight: bold ? 600 : 400,
        whiteSpace: 'pre-wrap',
        margin: '4px 0',
      }}
    >
      {content}
    </div>
  )
}
