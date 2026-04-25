import { useEditorStore } from '@/store/editorStore'
import type { DrawingTool } from '@/types'

const icons: Record<string, string> = {
  select:  'M5 3l14 9-7 2-3 7L5 3Z',
  rect:    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z',
  circle:  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  ellipse: 'M12 19c-4.97 0-9-3.13-9-7s4.03-7 9-7 9 3.13 9 7-4.03 7-9 7Z',
  line:    'M5 19L19 5',
  text:    'M4 7V5h16v2M9 5v14m6-14v14M9 19h6',
  button:  'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z',
  image:   'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5ZM3 15l5-5 4 4 3-3 6 6',
}

const labels: Record<string, string> = {
  select: '选择', rect: '矩形', circle: '圆', ellipse: '椭圆',
  line: '直线', text: '文本', button: '按钮', image: '图片',
}

const shortcut: Record<string, string> = {
  select: 'V', rect: 'R', circle: 'C', ellipse: 'E',
  line: 'L', text: 'T', button: 'B', image: 'I',
}

const tools: DrawingTool[] = ['select', 'rect', 'circle', 'ellipse', 'line', 'text', 'button', 'image']

export default function Toolbar() {
  const { activeTool, setTool } = useEditorStore()

  return (
    <div style={{
      width: 'var(--toolbar-w)',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '6px 4px',
      gap: 2,
      flexShrink: 0,
    }}>
      {tools.map((tool, i) => {
        const isActive = activeTool === tool
        return (
          <div key={tool} style={{ width: '100%', display: 'contents' }}>
            {i === 1 && (
              <div style={{
                width: 28, height: 1,
                background: 'var(--border)',
                margin: '3px auto',
              }} />
            )}
            <button
              title={`${labels[tool]}  [${shortcut[tool]}]`}
              onClick={() => setTool(tool)}
              className={`tool-btn focus-accent${isActive ? ' active' : ''}`}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={icons[tool]} />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
