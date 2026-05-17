export interface TableColumn {
  key: string
  title: string
  width?: number
  colSpan?: number  // header merge: how many columns this header spans
  align?: 'left' | 'center' | 'right'
}


// Formily x-reactions style field-level conditional logic
export interface FormFieldReaction {
  // watch: formFieldKey of the field to watch (same formGroupId)
  watch: string
  // when: JS expression evaluated with `$deps[0]` = watched value — return true to trigger
  when?: string
  // fulfill: actions to apply when `when` is true
  fulfill?: {
    state?: {
      visible?: boolean
      required?: boolean
      value?: string     // JS expression with $deps[0]
    }
  }
  // otherwise: actions when `when` is false
  otherwise?: {
    state?: {
      visible?: boolean
      required?: boolean
      value?: string
    }
  }
}

// Formily-style validation rule for a single form field
export interface FormFieldRule {
  type?: 'string' | 'number' | 'email' | 'url' | 'phone' | 'idcard' | 'pattern'
  required?: boolean
  message?: string       // custom error message
  min?: number           // min length (string) or min value (number)
  max?: number           // max length (string) or max value (number)
  pattern?: string       // regex string (used when type='pattern')
  validator?: string     // inline JS: (value, rule) => true | string — return true=pass, string=error
}

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
  selectable?: boolean   // false = cannot be click-selected in editor (e.g. background layers)
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
  // Layout container fields
  layoutSlides?: number          // carousel: number of slides (default 3)
  layoutInterval?: number        // carousel: auto-advance ms (0 = manual), default 3000
  layoutActiveSlide?: number     // carousel: current slide index (runtime state)
  layoutSlideCanvases?: number[] // carousel: canvas ID bound to each slide index
  layoutModalTitle?: string      // modal: title text
  layoutShowClose?: boolean      // modal: show close button (default true)
  layoutModalDefaultVisible?: boolean  // modal: visible by default in preview/publish (default false)
  layoutModalCanvasId?: number   // modal: canvas ID to embed as body content
  // 扩展属性
  properties?: Record<string, unknown>
  // Table widget fields
  tableColumns?: TableColumn[]
  tableData?: Record<string, unknown>[]
  tableDataBinding?: { mode: 'static' | 'interface'; interfaceId?: number; paramJson?: string }
  tableStriped?: boolean
  tableBordered?: boolean
  tablePageSize?: number
  // Form field controls (form-input / form-number / form-select / form-textarea / form-date / form-switch / form-submit)
  formGroupId?: string       // links controls into the same logical form
  formFieldKey?: string      // the data key submitted with the form value
  formFieldLabel?: string    // label shown beside the input
  formFieldPlaceholder?: string
  formFieldRequired?: boolean
  formFieldOptions?: string  // comma-separated list for form-select
  formFieldDefaultValue?: string
  formFieldRules?: FormFieldRule[]   // validation rules (Formily-style)
  formFieldReactions?: FormFieldReaction[]  // x-reactions: conditional logic driven by other fields
  formFieldGridSpan?: number         // form-grid: column span (1-24, default 12)
  // form-submit specific
  formSubmitAppId?: number
  formSubmitWebhookId?: number
  formSubmitParamJson?: string   // extra fixed params merged at submit time
  formBeforeScript?: string      // async (data) => data | false | void — runs before submit; throw to abort
}

export type ElementType =
  | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'
  | 'form-input' | 'form-number' | 'form-select' | 'form-textarea' | 'form-date' | 'form-switch' | 'form-submit'
  | 'form-radio' | 'form-checkbox' | 'form-rate' | 'form-slider' | 'form-grid'
  | 'echarts-bar' | 'echarts-line' | 'echarts-pie' | 'echarts-gauge'
  | 'echarts-scatter' | 'echarts-heatmap' | 'echarts-trend'
  | 'dynamic-pipe'
  | 'image-bg' | 'image-widget' | 'image-decoration' | 'image-border-box'
  | 'layout-carousel' | 'layout-modal'
  | 'group' | 'custom'

// 对齐类型
export type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export type DataBindingMode = 'point' | 'static' | 'simulation' | 'interface' | 'trend'

// 接口数据源类型：data_iface=平台数据接口 | open_api=外部应用开放接口 | webhook=外部应用 Webhook
export type InterfaceSourceType = 'data_iface' | 'open_api' | 'webhook'

// 接口字段映射：将接口返回字段映射到图表绑定键或元素属性
export interface InterfaceFieldMapping {
  // 目标：chart 模式下为 'series:0', 'series:1', 'category' 等；普通元素为属性名如 'text', 'fill'
  target: string
  // 来源字段路径（支持点分隔，如 data.value）
  sourceField: string
}

// 单点数据格式化配置（在 transform 之后执行）
export interface ValueFormatter {
  // 数字：小数精度，-1=不限
  precision?: number
  // 数字：前缀（如 "约"）
  prefix?: string
  // 数字：后缀单位（如 "℃"、"%"、"kPa"）
  unit?: string
  // 字符串替换：将 from 替换为 to（精确匹配）
  strReplace?: { from: string; to: string }[]
  // 阈值文字映射：按范围替换为文字（数字原值匹配）
  rangeMap?: { min: number; max: number; label: string; color?: string }[]
  // 自定义格式模板：含 ${v} 占位符，如 "${v} ℃ (正常)"
  template?: string
}

export interface PointBinding {
  // 绑定模式，默认 point（向后兼容）
  mode?: DataBindingMode

  // === point 模式 ===
  pointKey?: string
  deviceCode?: string
  linkName?: string
  transform?: string
  chartSeriesKeys?: string[][]
  chartCategoryKey?: string

  // === static 模式 ===
  // 存储静态数据，key 对应 chartSeriesKeys 中的 key 或元素属性名
  staticData?: Record<string, unknown>

  // === simulation 模式 ===
  simLinkName?: string          // 对应 ScadaSimPoint.link_name
  simDeviceCode?: string        // 模拟数据订阅的 deviceCode（与 sim point 一致）

  // === trend 模式（多点趋势图）===
  trendKeys?: string[]          // 订阅的 link_name 列表
  trendMaxPoints?: number       // 保留最新 N 个点（默认 200）
  trendTimeWindowSec?: number   // 时间窗口（秒），与 maxPoints 取更严格的一方，0=不限

  // === interface 模式 ===
  ifaceSourceType?: InterfaceSourceType
  ifaceId?: number              // DataInterface.id | OutboundWebhook.id
  ifaceCode?: string            // DataInterface.code（调用时用）
  ifaceAppId?: number           // OutboundWebhook 所属 app id
  ifaceName?: string            // 显示用名称
  ifaceParamValues?: Record<string, string>  // 调用接口的参数
  ifaceFieldMappings?: InterfaceFieldMapping[]  // 字段映射
  ifaceRefreshMs?: number       // 轮询间隔（ms），0=不轮询

  // === 渲染格式化（单点显示，point/simulation 模式有效）===
  formatter?: ValueFormatter
}

export interface ElementAnimation {
  type: 'rotate' | 'blink' | 'flow' | 'none'
  duration?: number
  condition?: string
}

export interface ElementEvent {
  trigger: 'click' | 'dblclick' | 'hover'
  action: 'navigate' | 'popup' | 'script' | 'open-modal' | 'close-modal' | 'navigate-canvas'
  /** open-modal / close-modal: modal element ID; navigate-canvas: canvas ID (string); popup: url */
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

export interface ChartConfig {
  bgColor?: string
  lineWidth?: number
  showLegend?: boolean
  title?: string
  titleColor?: string
  areaStyle?: boolean
  displayPoints?: number
  historyCapacity?: number
  renderEngine?: 'uplot-canvas' | 'uplot-webgl' | 'echarts'
  smooth?: boolean
  showSymbol?: boolean
  xAxisColor?: string
  yAxisColor?: string
  splitLineColor?: string
  gridTop?: number
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
