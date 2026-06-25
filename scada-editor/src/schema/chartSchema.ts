// ── Chart Schema ──────────────────────────────────────────────────────────────
// 每种 echarts 图表类型的数据绑定字段（bindingFields）和样式配置字段（styleFields）。
// BindingDrawer 和 PropertiesPanel 均由此 schema 驱动，ChartWidget 消费 chartConfig。

export interface BindingFieldDef {
  /** 唯一标识，用于映射到 seriesKeys[seriesIndex] 或 chartCategoryKey */
  key: string
  /** series → seriesKeys[seriesIndex]（多 key 逗号分隔）
   *  category → chartCategoryKey（单 key）
   *  single → seriesKeys[seriesIndex][0]（单 key） */
  kind: 'series' | 'category' | 'single'
  /** 当 kind=series/single 时，对应 chartSeriesKeys 的下标 */
  seriesIndex?: number
  label: string
  placeholder: string
  hint?: string
  /** kind=series 时是否允许多个 key（逗号分隔） */
  multi?: boolean
  optional?: boolean
}

export interface StyleFieldDef {
  key: string
  label: string
  type: 'color' | 'number' | 'text' | 'boolean' | 'select'
  default: unknown
  options?: { label: string; value: string }[]
  hint?: string
  group?: string  // 分组标题（相同 group 的字段归在一起）
}

export interface ChartSchemaDef {
  label: string
  bindingFields: BindingFieldDef[]
  styleFields: StyleFieldDef[]
}

// ── 共用 style fields ──────────────────────────────────────────────────────────
const commonStyleFields: StyleFieldDef[] = [
  { key: 'title',      label: '标题',   type: 'text',    default: '',            group: '标题' },
  { key: 'titleColor', label: '标题色', type: 'color',   default: '#cccccc',     group: '标题' },
  { key: 'titleSize',  label: '标题字号', type: 'number', default: 12,           group: '标题' },
  { key: 'bgColor',    label: '背景色', type: 'color',   default: 'transparent', group: '背景',
    hint: '输入 transparent 表示透明' },
]

const axisStyleFields: StyleFieldDef[] = [
  { key: 'xAxisColor',     label: 'X 轴色',   type: 'color',  default: '#444444', group: '坐标轴' },
  { key: 'yAxisColor',     label: 'Y 轴色',   type: 'color',  default: '#444444', group: '坐标轴' },
  { key: 'splitLineColor', label: '分割线色', type: 'color',  default: '#2a2a3e', group: '坐标轴' },
  { key: 'showLegend',     label: '显示图例', type: 'boolean', default: false,    group: '坐标轴' },
]

const gridStyleFields: StyleFieldDef[] = [
  { key: 'gridTop',    label: '上边距', type: 'number', default: 30, group: '边距' },
  { key: 'gridBottom', label: '下边距', type: 'number', default: 30, group: '边距' },
  { key: 'gridLeft',   label: '左边距', type: 'number', default: 40, group: '边距' },
  { key: 'gridRight',  label: '右边距', type: 'number', default: 10, group: '边距' },
]

// ── Schema 定义 ────────────────────────────────────────────────────────────────
export const chartSchema: Record<string, ChartSchemaDef> = {

  'echarts-bar': {
    label: '柱状图',
    bindingFields: [
      {
        key: 'series0', kind: 'series', seriesIndex: 0, multi: true,
        label: '系列 1 数据键', placeholder: 'val_a, val_b, val_c',
        hint: '多个 key 逗号分隔，每个 key 对应一根柱子的值',
      },
      {
        key: 'series1', kind: 'series', seriesIndex: 1, multi: true,
        label: '系列 2 数据键（可选）', placeholder: 'val_d, val_e, val_f',
        optional: true,
      },
      {
        key: 'series2', kind: 'series', seriesIndex: 2, multi: true,
        label: '系列 3 数据键（可选）', placeholder: 'val_g, val_h',
        optional: true,
      },
      {
        key: 'category', kind: 'category',
        label: '分类轴标签键', placeholder: 'categories_key',
        hint: '对应数据中的字符串数组，如 ["A","B","C"]',
        optional: true,
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '系列颜色', type: 'text', default: '#4a9eff,#27ae60,#e67e22',
        group: '系列', hint: '多系列用逗号分隔，如 #4a9eff,#27ae60' },
      { key: 'barBorderRadius', label: '柱子圆角', type: 'number', default: 2, group: '系列' },
      { key: 'barMaxWidth', label: '柱子最大宽', type: 'number', default: 40, group: '系列' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-line': {
    label: '折线图',
    bindingFields: [
      {
        key: 'series0', kind: 'series', seriesIndex: 0, multi: true,
        label: '系列 1 数据键', placeholder: 'val_a, val_b, val_c',
        hint: '多个 key 逗号分隔，每个 key 对应折线上的一个点',
      },
      {
        key: 'series1', kind: 'series', seriesIndex: 1, multi: true,
        label: '系列 2 数据键（可选）', placeholder: 'val_d, val_e',
        optional: true,
      },
      {
        key: 'category', kind: 'category',
        label: '分类轴标签键', placeholder: 'time_labels_key',
        hint: '对应数据中的字符串数组',
        optional: true,
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '系列颜色', type: 'text', default: '#4a9eff,#27ae60',
        group: '系列', hint: '多系列用逗号分隔' },
      { key: 'smooth',    label: '平滑曲线', type: 'boolean', default: true,  group: '系列' },
      { key: 'areaStyle', label: '面积填充', type: 'boolean', default: true,  group: '系列' },
      { key: 'lineWidth', label: '线宽',     type: 'number',  default: 2,     group: '系列' },
      { key: 'showSymbol', label: '显示节点', type: 'boolean', default: false, group: '系列' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-pie': {
    label: '饼图',
    bindingFields: [
      {
        key: 'series0', kind: 'series', seriesIndex: 0, multi: true,
        label: '数据值键列表', placeholder: 'val_a, val_b, val_c',
        hint: '每个 key 对应一个扇区的数值',
      },
      {
        key: 'category', kind: 'category',
        label: '扇区名称键', placeholder: 'names_key',
        hint: '对应字符串数组，作为各扇区名称；不填则用 key 名',
        optional: true,
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'colors', label: '扇区颜色', type: 'text',
        default: '#4a9eff,#27ae60,#e67e22,#8e44ad,#e74c3c',
        group: '样式', hint: '逗号分隔，按顺序分配给各扇区' },
      { key: 'radius',    label: '半径',     type: 'text',    default: '65%',  group: '样式' },
      { key: 'innerRadius', label: '内半径（环形）', type: 'text', default: '0%', group: '样式',
        hint: '设为 40% 以上变为环形图' },
      { key: 'showLabel', label: '显示标签', type: 'boolean', default: true,   group: '样式' },
      { key: 'labelColor', label: '标签色',  type: 'color',   default: '#aaaaaa', group: '样式' },
      { key: 'roseType',  label: '玫瑰图',   type: 'boolean', default: false,  group: '样式' },
    ],
  },

  'echarts-gauge': {
    label: '仪表盘',
    bindingFields: [
      {
        key: 'value', kind: 'single', seriesIndex: 0,
        label: '当前值键', placeholder: 'gauge_value',
        hint: '对应实时数值，如温度、压力等',
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'min',          label: '最小值',   type: 'number', default: 0,          group: '量程' },
      { key: 'max',          label: '最大值',   type: 'number', default: 100,         group: '量程' },
      { key: 'unit',         label: '单位',     type: 'text',   default: '',          group: '量程' },
      { key: 'pointerColor', label: '指针颜色', type: 'color',  default: '#4a9eff',   group: '样式' },
      { key: 'detailColor',  label: '数值颜色', type: 'color',  default: '#eeeeee',   group: '样式' },
      { key: 'detailSize',   label: '数值字号', type: 'number', default: 14,          group: '样式' },
      { key: 'axisLineWidth', label: '轴线宽度', type: 'number', default: 8,          group: '样式' },
      { key: 'axisLineColors', label: '颜色段',  type: 'text',
        default: '0.3:#27ae60,0.7:#e67e22,1:#c0392b',
        group: '样式', hint: '格式：阈值:颜色，逗号分隔，阈值为 0~1 比例' },
    ],
  },

  'echarts-scatter': {
    label: '散点图',
    bindingFields: [
      {
        key: 'series0', kind: 'series', seriesIndex: 0, multi: true,
        label: 'X 轴数据键列表', placeholder: 'x_a, x_b, x_c',
        hint: '每个 key 对应一个点的 X 坐标值',
      },
      {
        key: 'series1', kind: 'series', seriesIndex: 1, multi: true,
        label: 'Y 轴数据键列表', placeholder: 'y_a, y_b, y_c',
        hint: '与 X 轴键一一对应',
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'dotColor', label: '点颜色', type: 'color',  default: '#4a9eff', group: '样式' },
      { key: 'dotSize',  label: '点大小', type: 'number', default: 8,         group: '样式' },
      { key: 'dotOpacity', label: '点透明度', type: 'number', default: 0.8,   group: '样式',
        hint: '0~1' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-heatmap': {
    label: '热力图',
    bindingFields: [
      {
        key: 'series0', kind: 'series', seriesIndex: 0, multi: true,
        label: 'X 轴分类键列表', placeholder: 'x_cat_a, x_cat_b',
        hint: '每个 key 对应 X 轴的一个分类标签值',
      },
      {
        key: 'series1', kind: 'series', seriesIndex: 1, multi: true,
        label: 'Y 轴分类键列表', placeholder: 'y_cat_a, y_cat_b',
        hint: '每个 key 对应 Y 轴的一个分类标签值',
      },
      {
        key: 'series2', kind: 'series', seriesIndex: 2, multi: true,
        label: '热力值键列表', placeholder: 'heat_val_a, heat_val_b',
        hint: '与 X/Y 键一一对应的数值',
      },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'colorLow',  label: '低值颜色', type: 'color', default: '#313695', group: '颜色映射' },
      { key: 'colorHigh', label: '高值颜色', type: 'color', default: '#a50026', group: '颜色映射' },
      { key: 'showVisualMap', label: '显示色阶条', type: 'boolean', default: true, group: '颜色映射' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-stacked-bar': {
    label: '堆叠柱状图',
    bindingFields: [
      { key: 'series0', kind: 'series', seriesIndex: 0, multi: true, label: '系列 1', placeholder: 'val_a, val_b' },
      { key: 'series1', kind: 'series', seriesIndex: 1, multi: true, label: '系列 2（可选）', placeholder: 'val_c, val_d', optional: true },
      { key: 'category', kind: 'category', label: '分类轴', placeholder: 'categories_key', optional: true },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '系列颜色', type: 'text', default: '#4a9eff,#27ae60,#e67e22', group: '系列' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-horizontal-bar': {
    label: '横向柱状图',
    bindingFields: [
      { key: 'series0', kind: 'series', seriesIndex: 0, multi: true, label: '数据键', placeholder: 'val_a, val_b, val_c' },
      { key: 'category', kind: 'category', label: '分类轴', placeholder: 'categories_key', optional: true },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '柱子颜色', type: 'text', default: '#4a9eff', group: '系列' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-area': {
    label: '面积图',
    bindingFields: [
      { key: 'series0', kind: 'series', seriesIndex: 0, multi: true, label: '系列 1', placeholder: 'val_a, val_b' },
      { key: 'series1', kind: 'series', seriesIndex: 1, multi: true, label: '系列 2（可选）', placeholder: 'val_c, val_d', optional: true },
      { key: 'category', kind: 'category', label: '分类轴', placeholder: 'time_labels_key', optional: true },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '系列颜色', type: 'text', default: '#4a9eff,#27ae60', group: '系列' },
      { key: 'smooth', label: '平滑曲线', type: 'boolean', default: true, group: '系列' },
      { key: 'lineWidth', label: '线宽', type: 'number', default: 2, group: '系列' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },

  'echarts-radar': {
    label: '雷达图',
    bindingFields: [
      { key: 'series0', kind: 'series', seriesIndex: 0, multi: true, label: '维度值键', placeholder: 'dim_a, dim_b, dim_c' },
      { key: 'category', kind: 'category', label: '维度名称', placeholder: 'dim_names_key', optional: true },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'seriesColors', label: '填充颜色', type: 'text', default: '#4a9eff', group: '样式' },
      { key: 'showArea', label: '填充区域', type: 'boolean', default: true, group: '样式' },
    ],
  },

  'echarts-funnel': {
    label: '漏斗图',
    bindingFields: [
      { key: 'series0', kind: 'series', seriesIndex: 0, multi: true, label: '阶段值键', placeholder: 'step_a, step_b, step_c' },
      { key: 'category', kind: 'category', label: '阶段名称', placeholder: 'step_names_key', optional: true },
    ],
    styleFields: [
      ...commonStyleFields,
      { key: 'colors', label: '阶段颜色', type: 'text', default: '#4a9eff,#27ae60,#e67e22,#8e44ad', group: '样式' },
      { key: 'sort', label: '排序', type: 'select', default: 'descending',
        options: [{ label: '降序', value: 'descending' }, { label: '升序', value: 'ascending' }], group: '样式' },
    ],
  },

  'echarts-trend': {
    label: '趋势图',
    bindingFields: [],
    styleFields: [
      ...commonStyleFields,
      { key: 'smooth',      label: '平滑曲线',   type: 'boolean', default: true,          group: '系列' },
      { key: 'areaStyle',   label: '面积填充',   type: 'boolean', default: false,         group: '系列' },
      { key: 'lineWidth',   label: '线宽',       type: 'number',  default: 2,             group: '系列' },
      { key: 'showSymbol',  label: '显示数据点', type: 'boolean', default: false,         group: '系列' },
      { key: 'showLegend',  label: '显示图例',   type: 'boolean', default: false,         group: '系列' },
      {
        key: 'renderEngine', label: '渲染引擎', type: 'select', default: 'echarts',
        group: '高频模式',
        options: [
          { value: 'echarts',      label: 'ECharts（默认）' },
          { value: 'uplot-canvas', label: 'uPlot Canvas（高频）' },
          { value: 'uplot-webgl',  label: 'uPlot WebGL（超高频）' },
        ],
      },
      { key: 'displayPoints',    label: '显示点数（LTTB）', type: 'number', default: 500,     group: '高频模式', hint: '降采样目标点数，越小越流畅' },
      { key: 'historyCapacity',  label: '历史容量',         type: 'number', default: 100000,  group: '高频模式', hint: '内存 ring buffer 容量（点数）' },
      ...axisStyleFields,
      ...gridStyleFields,
    ],
  },
}

/** 获取图表 schema，不存在时返回 undefined */
export function getChartSchema(type: string): ChartSchemaDef | undefined {
  return chartSchema[type]
}

/** 从 chartConfig 读取某个 styleField 的值，不存在时返回 default */
export function getStyleValue<T>(
  cfg: Record<string, unknown>,
  field: StyleFieldDef,
): T {
  const v = cfg[field.key]
  return (v !== undefined && v !== null ? v : field.default) as T
}
