// SCADA element schemas

import type { PointBinding, ElementAnimation, ElementEvent } from './binding'

export type ElementType =
  | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'
  | 'echarts-bar' | 'echarts-line' | 'echarts-pie' | 'echarts-gauge'
  | 'dynamic-valve' | 'dynamic-pump' | 'dynamic-tank' | 'dynamic-pipe'
  | 'custom'

export interface CanvasElement {
  id: string
  type: ElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  locked: boolean
  zIndex: number
  // style
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  // text
  text?: string
  fontSize?: number
  fontColor?: string
  fontFamily?: string
  textAlign?: 'left' | 'center' | 'right'
  // image
  imageUrl?: string
  // data binding
  pointBinding?: PointBinding
  // animation
  animation?: ElementAnimation
  // interaction events
  events?: ElementEvent[]
  // type-specific extended properties (chart options, dynamic widget config, etc.)
  properties?: Record<string, unknown>
}

/** Tool modes available in the editor drawing toolbar */
export type DrawingTool =
  | 'select' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'

/** Editor UI state (not persisted in canvas_data) */
export interface EditorState {
  activeTool: DrawingTool
  selectedElementIds: string[]
  zoom: number
  panOffset: { x: number; y: number }
  showGrid: boolean
  showRuler: boolean
  isDirty: boolean
}
