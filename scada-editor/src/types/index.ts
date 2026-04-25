// 画布元素基础类型
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
  // 样式
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  borderRadius?: number
  // 文本
  text?: string
  fontSize?: number
  fontColor?: string
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  // 图片 / 静态资源
  imageUrl?: string
  // 边框图片（image-border-box 专用）
  borderImageConfig?: {
    width: string
    outset?: string
    slice: string
    repeat: string
  }
  // 组合：子元素 ID 列表（type === 'group' 时使用）
  children?: string[]
  // 数据绑定
  pointBinding?: PointBinding
  // 动画
  animation?: ElementAnimation
  // 事件
  events?: ElementEvent[]
  // 扩展属性
  properties?: Record<string, unknown>
}

export type ElementType =
  | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'
  | 'echarts-bar' | 'echarts-line' | 'echarts-pie' | 'echarts-gauge'
  | 'echarts-scatter' | 'echarts-heatmap'
  | 'dynamic-valve' | 'dynamic-pump' | 'dynamic-tank' | 'dynamic-pipe'
  | 'image-bg' | 'image-widget' | 'image-decoration' | 'image-border-box'
  | 'group' | 'custom'

// 对齐类型
export type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export interface PointBinding {
  pointKey: string
  deviceCode: string
  linkName?: string
  transform?: string
  chartSeriesKeys?: string[][]
  chartCategoryKey?: string
}

export interface ElementAnimation {
  type: 'rotate' | 'blink' | 'flow' | 'none'
  duration?: number
  condition?: string
}

export interface ElementEvent {
  trigger: 'click' | 'dblclick' | 'hover'
  action: 'navigate' | 'popup' | 'script'
  target?: string
  script?: string
}

// 画布数据
export interface CanvasData {
  id: number
  name: string
  width: number
  height: number
  background: string
  backgroundColor: string
  backgroundImage?: string
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  gridColor: string
  showRuler: boolean
  elements: CanvasElement[]
  zoom: number
  viewport: { x: number; y: number; width: number; height: number }
  adaptiveMode?: 'none' | 'scale' | 'fit'
}

// ScadaInfo（对应后端模型）
export interface ScadaInfo {
  id: number
  group_id?: number
  scada_name: string
  scada_code: string
  description?: string
  canvas_data?: string  // JSON string of CanvasProject
  preview_image?: string
  publish_status: number
  share_token?: string
  content_version: number
  created_at: string
  updated_at: string
}

export interface ScadaSimPoint {
  id: number
  scada_code: string
  link_name: string
  enabled: boolean
  mode: 'random' | 'random_walk' | 'sine' | 'ramp' | 'constant'
  interval_ms: number
  params_json: string
  created_at: string
  updated_at: string
}

export interface ScadaGroup {
  id: number
  parent_id?: number
  name: string
  description?: string
  sort_order: number
  children?: ScadaGroup[]
}

// 完整项目数据（存入 canvas_data）
export interface CanvasProject {
  version: number
  canvases: Record<number, CanvasData>
  activeCanvasId: number
  canvasGroups: CanvasGroupNode[]
}

export interface CanvasGroupNode {
  id: number
  name: string
  type: 'folder' | 'panel' | 'panelSet'
  children?: CanvasGroupNode[]
}

// 编辑器状态
export type DrawingTool =
  | 'select' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'

export interface EditorState {
  activeTool: DrawingTool
  selectedElementIds: string[]
  zoom: number
  panOffset: { x: number; y: number }
  showGrid: boolean
  showRuler: boolean
  isDirty: boolean
}
