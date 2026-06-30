import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { mergeAnimStyle } from '@/runtime/animationExecutor'

interface Props {
  el: CanvasElement
  zoom: number
  pointData?: PointDataMap
  liveRows?: Record<string, unknown>[]
  isPreview?: boolean
}

export default function TableWidget({ el, zoom, pointData = {}, liveRows, isPreview = false }: Props) {
  const columns = el.tableColumns ?? []
  const data = liveRows ?? el.tableData ?? []
  const striped = el.tableStriped ?? false
  const bordered = el.tableBordered ?? false
  const fontColor = el.fontColor || '#e0e0e0'
  const fontSize = (el.fontSize ?? 12) * zoom
  const bg = el.fill || 'transparent'
  const borderStyle = bordered ? `1px solid rgba(255,255,255,0.15)` : 'none'

  // Handle row click
  const handleRowClick = (row: Record<string, unknown>, rowIndex: number) => {
    if (!isPreview || !el.tableRowClickEvent) return

    const event = el.tableRowClickEvent
    if (event.action === 'script' && event.script) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('row', 'rowIndex', event.script)
        fn(row, rowIndex)
      } catch (err) {
        console.error('Table row click script error:', err)
      }
    }
  }

  // Handle cell click
  const handleCellClick = (row: Record<string, unknown>, rowIndex: number, column: string, cellValue: unknown) => {
    if (!isPreview || !el.tableCellClickEvent) return

    const event = el.tableCellClickEvent
    if (event.action === 'script' && event.script) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('row', 'rowIndex', 'column', 'cellValue', event.script)
        fn(row, rowIndex, column, cellValue)
      } catch (err) {
        console.error('Table cell click script error:', err)
      }
    }
  }

  const cellStyle = (isHeader: boolean, rowIdx?: number): React.CSSProperties => ({
    padding: `${2 * zoom}px ${6 * zoom}px`,
    border: borderStyle,
    color: isHeader ? '#a0c4ff' : fontColor,
    fontWeight: isHeader ? 600 : 'normal',
    fontSize,
    fontFamily: el.fontFamily || 'sans-serif',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    background: isHeader
      ? 'rgba(74,158,255,0.12)'
      : striped && rowIdx !== undefined && rowIdx % 2 === 1
        ? 'rgba(255,255,255,0.04)'
        : 'transparent',
    textAlign: 'left',
  })

  return (
    <div
      style={mergeAnimStyle(el, pointData, {
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.width * zoom,
        height: el.height * zoom,
        zIndex: el.zIndex,
        background: bg,
        overflow: 'hidden',
        pointerEvents: isPreview ? 'auto' : 'none',
        opacity: el.opacity ?? 1,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      {columns.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', fontSize: 13 * zoom, fontFamily: 'sans-serif',
        }}>
          表格
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            border: bordered ? `1px solid rgba(255,255,255,0.15)` : 'none',
          }}>
            <colgroup>
              {columns.map((col) => (
                <col key={col.key} style={{ width: col.width ? col.width * zoom : undefined }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    colSpan={col.colSpan ?? 1}
                    style={{ ...cellStyle(true), textAlign: col.align ?? 'left' }}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...cellStyle(false, 0), textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                data.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    onClick={() => handleRowClick(row, rowIdx)}
                    style={{ cursor: isPreview && el.tableRowClickEvent ? 'pointer' : 'default' }}
                  >
                    {columns.map((col) => {
                      const cellValue = row[col.key]
                      return (
                        <td
                          key={col.key}
                          onClick={(e) => {
                            if (el.tableCellClickEvent) {
                              e.stopPropagation()
                              handleCellClick(row, rowIdx, col.key, cellValue)
                            }
                          }}
                          style={{
                            ...cellStyle(false, rowIdx),
                            textAlign: col.align ?? 'left',
                            cursor: isPreview && el.tableCellClickEvent ? 'pointer' : 'default',
                          }}
                        >
                          {String(cellValue ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
