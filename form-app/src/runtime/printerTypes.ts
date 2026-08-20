/**
 * 打印模板与指令类型。
 * 页面级 config_json.printers[] 存储模板；字段级 PrintButton 绑定模板 id。
 */

export type PrintProtocol = 'cpcl' | 'escpos' | 'tspl'
export type PrintGenSide = 'agent' | 'frontend'

/** 结构化打印指令行 */
export type PrintOp =
  | { op: 'text'; text: string; align?: 'left' | 'center' | 'right'; size?: number; bold?: boolean }
  | { op: 'barcode'; format?: 'code128' | 'code39' | 'ean13' | 'ean8'; data: string; height?: number }
  | { op: 'qrcode'; data: string; size?: number }
  | { op: 'line' }
  | { op: 'feed'; lines?: number }
  | { op: 'cut' }
  | { op: 'image'; base64: string }

export interface PrinterTemplate {
  id: string
  name: string
  protocol: PrintProtocol
  /** 协议字节生成位置：agent（默认）= 端上生成；frontend = 前端原始指令透传 */
  gen_side?: PrintGenSide
  /** 纸张规格（标签机相关）；缺省视为连续纸，沿用打印机默认尺寸 */
  paper?: PaperSpec
  /** 布局模式：flow=顺序流（默认，兼容存量）| canvas=坐标自由布局 | raw=原始协议模板 */
  layout_mode?: PrintLayoutMode
  /** layout_mode=flow（默认）时的结构化顺序指令；文本/数据支持 {{字段名}} 占位 */
  content?: PrintOp[]
  /** layout_mode=canvas 时的坐标元素 */
  elements?: PrintElement[]
  /** layout_mode=raw（或旧 gen_side=frontend）时的原始协议模板（支持 {{字段名}} 占位） */
  raw_template?: string
  /** 调试用：上次选择的在线设备 ID。仅保存，不参与打印逻辑。 */
  debug_device_id?: string
  /** 调试用：样例数据（按占位名键值）。仅保存，再次打开时自动填入调试面板。 */
  debug_sample?: Record<string, string>
}

/** 布局模式 */
export type PrintLayoutMode = 'flow' | 'canvas' | 'raw'

/** 坐标布局元素（canvas 模式）。坐标/尺寸单位 mm，左上角为原点。 */
export interface PrintElement {
  id: string
  type: 'text' | 'barcode' | 'qrcode' | 'line' | 'rect'
  x_mm: number
  y_mm: number
  /** 文本内容 / 条码二维码数据（支持 {{字段名}} 占位） */
  text?: string
  data?: string
  /** 文本字号（点阵倍率近似，1~4），加粗，旋转角度 */
  font_size?: number
  bold?: boolean
  rotate?: 0 | 90 | 180 | 270
  /** 条码格式与高度（mm） */
  format?: 'code128' | 'code39' | 'ean13' | 'ean8'
  height_mm?: number
  /** 二维码倍率（1~10） */
  cell?: number
  /** 线/框：宽（mm）、线宽（mm）；rect 另用 height_mm 作为框高 */
  width_mm?: number
  thickness_mm?: number
  /** 打印条件：按表单参数判定本元素是否参与打印；缺省或 field 为空表示始终打印 */
  print_when?: PrintCondition
}

/** 元素打印条件运算符 */
export type PrintCondOp =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'len_eq' | 'len_gt' | 'len_lt'
  | 'empty' | 'not_empty' | 'contains'

/** 元素打印条件：取 field 对应参数值，与 value 按 op 比较，成立才打印该元素 */
export interface PrintCondition {
  /** 参数字段名（同 {{字段}} 占位名） */
  field: string
  op: PrintCondOp
  /** 比较值；empty/not_empty 时忽略 */
  value?: string
}

/** 纸张类型：连续小票纸 / 标签纸 */
export type PaperType = 'continuous' | 'label'

export interface PaperSpec {
  type: PaperType
  /** 标签纸宽（mm），如 40*50 中的 40 */
  width_mm?: number
  /** 标签纸高（mm），如 40*50 中的 50 */
  height_mm?: number
  /** 标签间距（mm），默认 2 */
  gap_mm?: number
  /** 打印机分辨率（dpi）：坐标布局 mm→dots 换算依据。常见 203/300，默认 203 */
  dpi?: number
  /** 整体原点偏移（mm）：补偿打印机物理起点/标签校准误差，作用于 canvas 所有元素坐标 */
  offset_x_mm?: number
  offset_y_mm?: number
  /**
   * CPCL 文本字体名，缺省 GBUNSG24.CPF（简体中文）。
   * ZR138 需安装对应中文字体；不同字体包可在打印机上确认后覆盖。
   */
  cpcl_font?: string
  /**
   * TSPL 文本字体名，缺省 CHNGB.BF2（简体中文 GBK）。
   * 不同机型内置字体名不同，如繁体机用 TSS24.BF2，英文机用 0/4/ROMAN.TTF 等。
   */
  tspl_font?: string
  /** 纸张旋转角度：90° 时宽高互换（如 50×40→40×50），同时所有坐标元素的内容也旋转。默认 0（不旋转） */
  rotate?: 0 | 90 | 180 | 270
}
