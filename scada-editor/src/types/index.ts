import type { ScadaWorkflow, WorkflowLib } from './workflow'

export * from './workflow'

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
  groupBinding?: GroupBinding
  // 数据绑定
  pointBinding?: PointBinding
  // 日期时间显示（text / button 元件，开启后按 dateTime.format 渲染）
  dateTime?: DateTimeConfig
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
  layoutTabLabels?: string[]     // tabs: tab titles
  layoutTabCanvases?: number[]   // tabs: canvas ID per tab
  layoutActiveTab?: number       // tabs: current tab index
  layoutCollapseTitle?: string   // collapse: header title
  layoutCollapseExpanded?: boolean // collapse: expanded state
  layoutCollapseCanvasId?: number  // collapse: embedded canvas
  alarmNormalColor?: string
  alarmWarningColor?: string
  alarmDangerColor?: string
  alarmThresholdWarning?: number
  alarmThresholdDanger?: number
  alarmBlinkMs?: number
  alarmSoundEnabled?: boolean
  // 扩展属性
  properties?: Record<string, unknown>
  // 扩展数据：key-value 字符串，用于组件间数据引用
  // 引用语法：{{ext:key}} 引用本组件，{{el:元素名:extKey}} 或 {{el:id:extKey}} 引用其他组件
  extData?: Record<string, string>
  // 条件样式规则：根据表达式动态设置颜色
  conditionalStyles?: ConditionalStyles
  // Table widget fields
  tableColumns?: TableColumn[]
  tableData?: Record<string, unknown>[]
  tableDataBinding?: { mode: 'static' | 'interface'; interfaceId?: number; paramJson?: string }
  tableStriped?: boolean
  tableBordered?: boolean
  tablePageSize?: number
  // Table events: script 中可访问的变量
  // - row: 当前行数据对象 Record<string, unknown>
  // - rowIndex: 行索引 number
  // - column: 列 key string (仅 cell/columnHeader)
  // - cellValue: 单元格值 unknown (仅 cell)
  tableRowClickEvent?: ElementEvent        // 行点击事件
  tableCellClickEvent?: ElementEvent       // 单元格点击事件
  tableColumnHeaderEvents?: Record<string, ElementEvent>  // 列表头点击事件，key 为列的 key
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

/**
 * 对象模板（Group 间重复渲染“对象”）配置。
 *
 * - 传统 fixed-cell 布局（layout/columns/gapX/gapY）仍保留，向后兼容；
 * - 新的虚拟 div 布局（virtualLayout = flex | grid | flow）将所有展开实例放入一个
 *   CSS 容器，由 display:flex / display:grid 控制排列方式；同时支持
 *   wrap / justify / align / 自动列数 等。
 * - params / overrideParams 允许把组内文本/扩展/extData 上出现的任意
 *   {{}} 占位符（不限类别）抽取为对象参数，再在渲染时通过 `${item.xxx}` 注入
 *   表达式作用域完成替换。
 */
export interface GroupParamSpec {
  /** 参数名（与 item.xxx 中 xxx 一致） */
  name: string
  /** 参数类型（从实例样本推导或用户指定） */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any'
  /** 描述（用户可填） */
  description?: string
  /** 是否必填（默认为 false） */
  required?: boolean
  /** 默认值（当真实 item 中缺字段时使用） */
  default?: unknown
  /** 原始样本值（用于辅助 UI 展示） */
  sample?: unknown
  /** 该参数在哪些位置被引用（text / textTemplate / extData / expression） */
  usedIn?: Array<'text' | 'textTemplate' | 'extData' | 'expression' | 'bindingValue' | 'pointBinding'>
}

/** 虚拟 div 容器布局配置 */
export interface VirtualLayoutConfig {
  /**
   * 布局方式：
   * - flex   横向或纵向 flex（direction 决定）
   * - grid   CSS Grid（columns / columnsAutoFit 决定）
   * - flow   多行/多列自动换行（columns 决定每行最大项数）
   */
  display: 'flex' | 'grid' | 'flow'
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch'
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'stretch'
  /** grid / flow 列数；grid 模式下 1 表示按容器宽度均分 */
  columns?: number
  /** grid 模式下 auto-fit/auto-fill 配置 */
  columnsAutoFit?: { minWidth: number; maxColumns?: number }
  /** 行高/列宽（CSS grid/flex 具体值，例如 '120px' / '1fr'） */
  columnWidth?: string
  rowHeight?: string
  /** 行间距 / 列间距 px */
  gap?: number
  rowGap?: number
  columnGap?: number
  /** 容器内边距 px */
  padding?: number
  /** 容器大小：'auto' = 使用组自身 width/height；'hug' = 收缩到内容；'fill' = 铺满父 */
  widthMode?: 'auto' | 'hug' | 'fill' | string
  heightMode?: 'auto' | 'hug' | 'fill' | string
  /** 自定义 width/height CSS 值（与 widthMode 配合） */
  customWidth?: string
  customHeight?: string
  /** 容器背景色（可选） */
  background?: string
  /** 容器边框（可选） */
  border?: string
  /** 容器圆角（可选） */
  borderRadius?: number
  /** 是否显示滚动条 */
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll'
}

export interface GroupBinding {
  enabled?: boolean
  source?: 'static' | 'point' | 'interface'
  /**
   * 绑定的原始数据：
   * - source=static 时支持 JSON 对象（单实例）或 JSONArray（按布局展开）；
   * - source=point/interface 时指向 pointData 中的路径；允许解析为对象数组或单对象。
   */
  value?: unknown
  path?: string
  itemAlias?: string
  keyPath?: string
  maxInstances?: number

  /** 旧版固定 cell 布局（保留，向后兼容） */
  layout?: 'horizontal' | 'vertical' | 'grid'
  columns?: number
  gapX?: number
  gapY?: number
  emptyBehavior?: 'hide' | 'template'

  /** 新版虚拟 div 布局（启用后将替代上述 layout/columns/gapX/gapY） */
  virtualLayout?: VirtualLayoutConfig

  /**
   * 参数契约：从组合内子元素的 {{}} 占位符与 ${...} 表达式中自动提取的
   * 字段列表（与 item.xxx 路径一致）。用户在属性面板中可勾选/编辑。
   */
  params?: GroupParamSpec[]

  /**
   * 参数在源对象中的覆盖映射：
   * - key   = GroupParamSpec.name（即 item.xxx 中的 xxx）
   * - value = 源对象中的实际字段路径（默认就是 name）
   * 例如：源数据中叫 `deviceName` 而模板里写 `{{item.name}}`，
   * 可配置 { name: 'deviceName' } 把字段名映射过去。
   */
  paramFieldMap?: Record<string, string>

  /**
   * paramsFieldMap 的运行期合并结果：用户键入的 sourceValue 优先级更高。
   * （供运行时 / 预览读取；不应当反向写回 GroupBinding.paramFieldMap。）
   */
  paramOverrides?: Record<string, unknown>
}

export type ElementType =
  | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
  | 'text' | 'image' | 'button' | 'radio' | 'checkbox' | 'table'
  | 'form-input' | 'form-number' | 'form-select' | 'form-textarea' | 'form-date' | 'form-switch' | 'form-submit'
  | 'form-radio' | 'form-checkbox' | 'form-rate' | 'form-slider' | 'form-grid'
  | 'echarts-bar' | 'echarts-line' | 'echarts-pie' | 'echarts-gauge'
  | 'echarts-scatter' | 'echarts-heatmap' | 'echarts-trend'
  | 'echarts-stacked-bar' | 'echarts-horizontal-bar' | 'echarts-area'
  | 'echarts-radar' | 'echarts-funnel'
  | 'dynamic-pipe'
  | 'image-bg' | 'image-widget' | 'image-decoration' | 'image-border-box'
  | 'layout-carousel' | 'layout-modal' | 'layout-tabs' | 'layout-collapse'
  | 'alarm-light'
  | 'group' | 'custom'

// 对齐类型
export type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export type DataBindingMode = 'point' | 'static' | 'simulation' | 'interface' | 'trend'

// 接口数据源类型：data_iface=平台数据接口 | open_api=外部应用开放接口 | webhook=外部应用 Webhook
export type InterfaceSourceType = 'data_iface' | 'open_api' | 'webhook'

// 参数规范（对应后端 datastack.ParamSpec）
export interface ParamSpec {
  name: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'any'
  required: boolean
  enum?: unknown[]
  min?: number
  max?: number
  pattern?: string
  default?: unknown
}

// 接口字段映射：将接口返回字段映射到图表绑定键或元素属性
export interface InterfaceFieldMapping {
  // 目标：chart 模式下为 'series:0', 'series:1', 'category' 等；普通元素为属性名如 'text', 'fill'
  target: string
  // 来源字段路径（支持点分隔，如 data.value）
  sourceField: string
}

// 接口参数来源：
// - constant  固定值
// - url       URL query 参数
// - context   SCADA 上下文（scadaCode / pointData）
// - point     点位数据路径
// - element   组件属性值（引用其它元件）
// - object    组合对象上下文（组内实例）
// - global    全局参数（项目级 globalParams）
// - expression 表达式（可用全局参数 / 时间函数 / 自定义函数 / 组件值）
export type InterfaceParamSourceType =
  | 'constant' | 'url' | 'context' | 'point' | 'element' | 'object' | 'global' | 'expression'

export interface InterfaceParamBinding {
  source: InterfaceParamSourceType
  value?: unknown
  path?: string
  elementId?: string
  property?: string
  /** source=global：全局参数名 */
  paramName?: string
  /** source=expression：表达式源码（JS 子集，见 runtime/expression.ts） */
  expression?: string
}

// 全局参数（项目级，随 canvas_data 持久化）——可在接口参数表达式中通过 params.<key> / P('key') 引用
export interface GlobalParam {
  /** 唯一键（标识符，用于表达式引用） */
  key: string
  /** 显示名称（可选） */
  label?: string
  /** 值类型（用于表单输入与类型转换） */
  type: 'string' | 'number' | 'boolean' | 'json'
  /** 默认值（字符串形式存储，按 type 解析） */
  value: string
  /** 备注 */
  description?: string
}

// 自定义函数（项目级，随 canvas_data 持久化）——注入到接口参数表达式作用域，可直接按名调用
export interface CustomFunctionDef {
  /** 函数名（标识符，表达式中直接调用） */
  name: string
  /** 形参名列表（逗号分隔或数组） */
  args: string[]
  /** 函数体（JS，return 返回值；可用内置时间/工具函数与 params） */
  body: string
  /** 备注 */
  description?: string
}

export type InterfaceTransportMode = 'polling' | 'stomp'

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

// 条件颜色规则：支持表达式判定动态设置颜色
export interface ConditionalColorRule {
  // 条件表达式（JS 表达式，可访问 v=绑定值、el()=组件值、ext=扩展数据等）
  // 示例：Number(v) > Number(el('xx', 'extData.max'))
  condition: string
  // 满足条件时应用的颜色
  color: string
  // 规则名称（可选，用于界面显示）
  label?: string
}

// 样式条件规则集：针对不同样式属性的条件规则
export interface ConditionalStyles {
  // 文本颜色规则
  fontColor?: ConditionalColorRule[]
  // 填充色规则
  fill?: ConditionalColorRule[]
  // 边框色规则
  stroke?: ConditionalColorRule[]
  // 背景色规则（可扩展）
  backgroundColor?: ConditionalColorRule[]
}

// 日期时间显示配置（挂在 text/button 元件的 dateTime 字段）
// - source=current：显示系统当前时间，按 refreshMs 自动刷新
// - source=data：把绑定数据值解析为时间后格式化显示（自动兼容时间戳/字符串）
export interface DateTimeConfig {
  // 是否启用日期时间渲染（关闭时按普通文本/绑定处理）
  enabled?: boolean
  // 数据来源：current=显示系统当前时间（自动刷新）；data=解析绑定数据（pointBinding）
  source?: 'current' | 'data'
  // 显示格式（token 模板，如 YYYY-MM-DD HH:mm:ss）
  format: string
  // 当 source=data 时，输入值的解析类型（auto 自动兼容时间戳/字符串）
  inputType?: 'auto' | 'unix_s' | 'unix_ms' | 'iso' | 'string'
  // source=current 时的刷新间隔（ms），默认 1000
  refreshMs?: number
  // 无有效值时的占位显示
  fallback?: string
  // 语言：用于星期/月份文字，zh=中文（默认），en=英文
  locale?: 'zh' | 'en'
}

/**
 * 图表系列/分类的数据来源。
 * - key：默认，使用实时数据 Map 中的 key（即 chartSeriesKeys 里的键）。
 * - component：从其他组件快照取值，ref 形如 `<组件名或id>.ext.flow` / `.value` / `.params.max`。
 * - global：从全局上下文取值，ref 形如 `line1.temp` 或任意点分路径。
 * component/global 解析出的值若为数组则整段作为该系列数据；标量则视为单点。
 */
export interface ChartKeySource {
  type: 'key' | 'component' | 'global'
  ref?: string
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
  // 系列名称（与 chartSeriesKeys 平行）。在数据定义中直接配置，优先于样式里的 seriesNames。
  chartSeriesNames?: string[]
  // 系列颜色（与 chartSeriesKeys 平行）。空串=用样式面板的 seriesColors 按序回退。
  chartSeriesColors?: string[]
  // 系列/分类数据来源（与 chartSeriesKeys 平行；缺省=数据键）。
  // 允许直接从其他组件的扩展属性或全局上下文取数组，无需写表达式。
  chartSeriesSources?: ChartKeySource[]
  chartCategorySource?: ChartKeySource

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
  ifaceParamValues?: Record<string, string>  // 向后兼容的固定参数值
  ifaceParamBindings?: Record<string, InterfaceParamBinding> // 参数来源与路径
  ifaceFieldMappings?: InterfaceFieldMapping[]  // 字段映射
  ifaceRefreshMs?: number       // 轮询间隔（ms）
  ifaceTransport?: InterfaceTransportMode // polling=浏览器轮询；stomp=服务端推送

  // === 表格列定义（interface 模式 + table 组件专用）===
  tableColumns?: TableColumn[]  // 表格列定义

  // === 文本模板（interface 模式专用）===
  textTemplate?: string         // 模板字符串，如 "{{name}} - {{status}}"，用于文本组件多字段拼接

  // === 渲染格式化（单点显示，point/simulation 模式有效）===
  formatter?: ValueFormatter
}

export interface ElementAnimation {
  type: 'rotate' | 'blink' | 'flow' | 'none'
  duration?: number
  condition?: string
}

export interface ElementEvent {
  trigger: 'click' | 'dblclick' | 'hover' | 'condition'
  action: 'navigate' | 'popup' | 'script' | 'open-modal' | 'close-modal' | 'navigate-canvas' | 'trigger-workflow'
  /** open-modal / close-modal: modal element ID; navigate-canvas: canvas ID (string); popup: url */
  target?: string
  script?: string
  /** JS 表达式，可用 v（绑定点位值）；空=始终执行 */
  condition?: string
  /** action==='trigger-workflow': 指向 CanvasProject.workflows 中的工作流 id */
  workflowId?: string
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
  adaptiveMode?: 'none' | 'scale' | 'fit' | 'screen'
  // 自动横屏配置：指定哪些设备类型下自动横屏显示
  autoLandscape?: ('mobile' | 'tablet' | 'desktop')[]
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
  /** 工作流定义（全局 + 组件绑定），随项目持久化 */
  workflows?: ScadaWorkflow[]
  /** 脚本可用的外部库清单（URL / 上传） */
  workflowLibs?: WorkflowLib[]
  /** 全局参数（可在接口参数表达式中引用） */
  globalParams?: GlobalParam[]
  /** 自定义函数（注入接口参数表达式作用域） */
  customFunctions?: CustomFunctionDef[]
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
