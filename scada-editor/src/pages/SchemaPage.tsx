import { useState } from 'react'

/* ── Section anchor helper ── */
const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-12 scroll-mt-20">
    <h2 style={{
      fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
      borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <a href={`#${id}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14 }}>#</a>
      {title}
    </h2>
    {children}
  </section>
)

const Code = ({ children }: { children: string }) => (
  <code style={{
    display: 'block', background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '14px 16px', fontFamily: 'var(--font-mono)',
    fontSize: 12, lineHeight: 1.7, color: '#a9dc76', overflowX: 'auto', whiteSpace: 'pre',
  }}>
    {children}
  </code>
)

const Table = ({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) => (
  <div style={{ overflowX: 'auto', marginTop: 12 }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--bg-surface)' }}>
          {headers.map((h, i) => (
            <th key={i} style={{
              padding: '8px 12px', textAlign: 'left', fontWeight: 600,
              color: 'var(--text-muted)', border: '1px solid var(--border)',
              fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
            {row.map((cell, j) => (
              <td key={j} style={{
                padding: '7px 12px', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', verticalAlign: 'top', lineHeight: 1.5,
              }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Tag = ({ children, color = 'var(--accent)' }: { children: string; color?: string }) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    background: color + '1a', color, fontSize: 11, fontFamily: 'var(--font-mono)',
    border: `1px solid ${color}40`,
  }}>{children}</span>
)

const Diff = ({ status }: { status: 'only-new' | 'only-old' | 'both' | 'diff' }) => {
  const map = {
    'only-new': ['仅新版', 'var(--accent)'],
    'only-old': ['仅旧版', 'var(--warning)'],
    both:       ['两者均有', 'var(--success)'],
    diff:       ['结构不同', 'var(--danger)'],
  }
  return <Tag color={map[status][1]}>{map[status][0]}</Tag>
}

/* ── Nav items ── */
const NAV_ITEMS = [
  { id: 'overview',   label: '概览' },
  { id: 'project',    label: 'CanvasProject' },
  { id: 'canvas',     label: 'CanvasData' },
  { id: 'element',    label: 'CanvasElement' },
  { id: 'binding',    label: '数据绑定' },
  { id: 'object-tpl', label: '对象模板' },
  { id: 'animation',  label: '动画' },
  { id: 'event',      label: '事件' },
  { id: 'types',      label: '元素类型' },
  { id: 'diff',       label: 'dbscada 差异' },
  { id: 'roadmap',    label: '路线图' },
]

export default function SchemaPage() {
  const [activeId, setActiveId] = useState('overview')

  const scrollTo = (id: string) => {
    setActiveId(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: 'var(--bg-app)', color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)', fontSize: 13,
    }}>
      {/* ── Left Nav ── */}
      <aside style={{
        width: 200, flexShrink: 0, overflowY: 'auto',
        background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
        padding: '20px 0',
      }}>
        <div style={{ padding: '0 16px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          SCADA Schema
        </div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '6px 16px', fontSize: 12, cursor: 'pointer', border: 'none',
              background: activeId === item.id ? 'var(--accent-muted)' : 'transparent',
              color: activeId === item.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderLeft: `2px solid ${activeId === item.id ? 'var(--accent)' : 'transparent'}`,
              transition: 'all 0.15s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 48px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            SCADA Editor — 全局 Schema 说明
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 640 }}>
            本文档描述 SCADA Editor 的完整数据模型。所有组态数据以 JSON 格式存储在后端 <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>canvas_data</code> 字段中，遵循以下 TypeScript 接口定义。
          </p>
        </div>

        {/* Overview */}
        <Section id="overview" title="数据层次结构">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
            一个组态（ScadaInfo）包含一个 <strong style={{ color: 'var(--accent)' }}>CanvasProject</strong>，其中可有多个画布（CanvasData），每个画布包含多个元素（CanvasElement）。
          </p>
          <Code>{`ScadaInfo (后端数据库记录)
  └── canvas_data: string  ← JSON 序列化的 CanvasProject
        └── CanvasProject
              ├── version: number
              ├── activeCanvasId: number
              ├── canvasGroups: CanvasGroupNode[]
              └── canvases: Record<number, CanvasData>
                    └── CanvasData
                          ├── id, name, width, height
                          ├── background, grid, ruler 配置
                          └── elements: CanvasElement[]
                                └── CanvasElement
                                      ├── 基础属性（id/type/位置/尺寸）
                                      ├── 样式属性（fill/stroke/opacity）
                                      ├── 类型专属属性（text/imageUrl 等）
                                      ├── pointBinding?   ← 数据绑定
                                      ├── animation?      ← 动画配置
                                      └── events?         ← 事件列表`}
          </Code>
        </Section>

        {/* CanvasProject */}
        <Section id="project" title="CanvasProject — 顶层项目">
          <Code>{`interface CanvasProject {
  version:       number                        // Schema 版本，当前为 1
  activeCanvasId:number                        // 当前激活的画布 ID
  canvases:      Record<number, CanvasData>    // 所有画布（以 ID 为 key）
  canvasGroups:  CanvasGroupNode[]             // 画布分组树
}

interface CanvasGroupNode {
  id:       number
  name:     string
  type:     'folder' | 'panel' | 'panelSet'
  children?: CanvasGroupNode[]
}`}
          </Code>
          <Table
            headers={['字段', '类型', '必填', '说明']}
            rows={[
              ['version', 'number', '是', '数据格式版本号，目前固定为 1'],
              ['activeCanvasId', 'number', '是', '当前打开的画布 ID，必须是 canvases 中存在的 key'],
              ['canvases', 'Record<number, CanvasData>', '是', '所有画布的 Map，key 为画布数字 ID'],
              ['canvasGroups', 'CanvasGroupNode[]', '是', '画布的树形分组结构，用于左侧面板树'],
            ]}
          />
        </Section>

        {/* CanvasData */}
        <Section id="canvas" title="CanvasData — 画布">
          <Code>{`interface CanvasData {
  id:              number          // 唯一数字 ID（主画布固定为 100001）
  name:            string          // 画布显示名称
  width:           number          // 画布宽度（px），默认 1920
  height:          number          // 画布高度（px），默认 1080
  background:      string          // 背景色，如 '#1a1a2e'
  backgroundColor: string          // 同 background（兼容字段）
  backgroundImage?: string         // 背景图 URL（暂未实现 UI）
  showGrid:        boolean          // 是否显示网格
  snapToGrid:      boolean          // 是否启用网格吸附
  gridSize:        number           // 网格尺寸（px），默认 10
  gridColor:       string           // 网格线颜色，如 '#2a2a4a'
  showRuler:       boolean          // 是否显示标尺（字段已定义，UI 待实现）
  elements:        CanvasElement[]  // 画布内所有元素
  zoom:            number           // 当前缩放比例（0.1 ~ 4）
  viewport: {                       // 视口（用于平移）
    x:      number
    y:      number
    width:  number
    height: number
  }
}`}
          </Code>
        </Section>

        {/* CanvasElement */}
        <Section id="element" title="CanvasElement — 元素基础结构">
          <Code>{`interface CanvasElement {
  // ── 标识 ──
  id:          string       // 格式: 'el_<timestamp>_<random>'
  type:        ElementType  // 元素类型（见下方类型参考）
  name:        string       // 元素名称（图层面板显示）

  // ── 位置与尺寸 ──
  x:           number       // 左上角 X 坐标（相对画布，px）
  y:           number       // 左上角 Y 坐标（相对画布，px）
  width:       number       // 元素宽度（px）
  height:      number       // 元素高度（px）
  rotation:    number       // 旋转角度（度，0-360）

  // ── 可见性 ──
  visible:     boolean      // 是否可见（图层面板可切换）
  locked:      boolean      // 是否锁定（锁定后不可拖动/选中）
  zIndex:      number       // 层叠顺序（越大越在上方）

  // ── 样式 ──
  fill?:       string       // 填充色（rect/circle/ellipse）
  stroke?:     string       // 描边色
  strokeWidth?:number       // 描边宽度（px）
  opacity?:    number       // 整体透明度（0~1）

  // ── 文本 ──
  text?:       string       // 文本内容（type=text/button）
  fontSize?:   number       // 字号（px）
  fontColor?:  string       // 字体颜色
  fontFamily?: string       // 字体族
  textAlign?:  'left' | 'center' | 'right'

  // ── 图片 ──
  imageUrl?:   string       // 图片 URL（type=image）

  // ── 扩展 ──
  properties?: Record<string, unknown>  // 类型专属扩展属性

  // ── 数据绑定 ──
  pointBinding?: PointBinding

  // ── 动画 ──
  animation?: ElementAnimation

  // ── 事件 ──
  events?: ElementEvent[]
}`}
          </Code>
        </Section>

        {/* Data Binding */}
        <Section id="binding" title="PointBinding — 数据绑定">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
            当前版本仅支持单一点位绑定。实时数据通过 STOMP WebSocket 或 HTTP 轮询推送，格式为 <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>Record&lt;linkName, number&gt;</code>。
          </p>
          <Code>{`interface PointBinding {
  pointKey:   string    // 点位唯一标识（用于数据映射 key）
  deviceCode: string    // 设备编码
  linkName?:  string    // STOMP 订阅时的点位名称（可与 pointKey 不同）
  transform?: string    // JS 表达式，处理原始值
                        // 可用变量: value（当前点位值）
                        // 示例: "value * 1.8 + 32"  // 摄氏转华氏
}

// 实时数据推送格式（STOMP topic: /topic/scada/point-data/{code}）
type PointDataMap = Record<string, number>
// 示例: { "temp_001": 25.6, "pressure_02": 1.013 }`}
          </Code>
          <Table
            headers={['字段', '类型', '说明', '示例']}
            rows={[
              ['pointKey', 'string', '点位 ID，与推送数据的 key 对应', '"temp_sensor_01"'],
              ['deviceCode', 'string', '所属设备编码', '"DEV_001"'],
              ['linkName', 'string?', '订阅别名，可与 pointKey 相同', '"temperature"'],
              ['transform', 'string?', 'JS 表达式，value 为原始数值', '"Math.round(value * 100) / 100"'],
            ]}
          />
        </Section>

        {/* 对象模板 */}
        <Section id="object-tpl" title="GroupBinding — 对象模板（带虚拟 div 与参数绑定）">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
            当 <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{`{ type: 'group', groupBinding.enabled: true }`}</code> 时，
            该组合会按 <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>groupBinding</code> 渲染为多份实例。
            新版本支持 <strong style={{ color: 'var(--accent)' }}>JSON/JSONArray 绑定</strong>、
            <strong style={{ color: 'var(--accent)' }}>虚拟 div 容器布局</strong>、
            <strong style={{ color: 'var(--accent)' }}>自动从 <code>{'{{}}'}</code> 占位符提取对象参数</strong>，
            以及 <strong style={{ color: 'var(--accent)' }}>参数映射 / 运行时覆盖</strong>。
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 10px', color: 'var(--text-primary)' }}>完整字段</h3>
          <Code>{`interface GroupBinding {
  enabled?: boolean                    // 总开关
  source?: 'static' | 'point' | 'interface'  // 数据来源
  value?: unknown                      // source=static 时的对象或对象数组（JSON）
  path?: string                        // source=point/interface 时点位/接口数据中的点分路径
  itemAlias?: string                   // 实例上下文别名，默认 'item'

  /* —— 旧版固定 cell 布局（保留，向后兼容）—— */
  layout?: 'horizontal' | 'vertical' | 'grid'
  columns?: number
  gapX?: number
  gapY?: number
  maxInstances?: number
  emptyBehavior?: 'hide' | 'template'

  /* —— 新版虚拟 div 容器布局（启用后替代上述 layout/columns/gapX/gapY）—— */
  virtualLayout?: VirtualLayoutConfig

  /* —— 对象参数契约 —— */
  params?: GroupParamSpec[]            // 自动提取的模板参数
  paramFieldMap?: Record<string, string>  // 字段映射：name -> 源对象字段名
  paramOverrides?: Record<string, unknown>  // 运行时强制值（测试/默认值）
}

interface VirtualLayoutConfig {
  display: 'flex' | 'grid' | 'flow'    // 容器布局
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch'
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'stretch'
  columns?: number                      // grid/flow 列数
  columnsAutoFit?: { minWidth: number; maxColumns?: number }
  columnWidth?: string                  // grid 列宽，如 '1fr' / '120px'
  rowHeight?: string
  gap?: number                          // 默认间距（行/列）
  rowGap?: number
  columnGap?: number
  padding?: number
  widthMode?: 'auto' | 'hug' | 'fill' | 'custom'
  heightMode?: 'auto' | 'hug' | 'fill' | 'custom'
  customWidth?: string
  customHeight?: string
  background?: string
  border?: string
  borderRadius?: number
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll'
}

interface GroupParamSpec {
  name: string                          // 参数名（即 {{item.xxx}} 中的 xxx）
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any'
  required?: boolean
  default?: unknown
  description?: string
  sample?: unknown                      // 扫描时取到的样本值（用于类型推断）
  usedIn?: Array<'text' | 'textTemplate' | 'extData' | 'expression' | 'bindingValue' | 'pointBinding'>
}`}
          </Code>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)' }}>工作流</h3>
          <ol style={{ color: 'var(--text-secondary)', lineHeight: 1.9, paddingLeft: 20 }}>
            <li>把多个子元素放入一个组合（<code>{`{ type: 'group', children: [...] }`}</code>）。</li>
            <li>在子元素的 <code>text</code> / <code>{`pointBinding.textTemplate`}</code> / <code>extData</code> / <code>{'$' + '{...}'}</code> 表达式中写 <code>{'{{item.xxx}}'}</code>。</li>
            <li>为组合启用"对象模板"，选择 <code>source=static</code> 输入 JSON 对象或数组，或选择 <code>source=point/interface</code> 指定数据路径。</li>
            <li>可选：点击"虚拟 div 容器"启用 CSS flex/grid 布局以控制实例排列方式。</li>
            <li>点击"扫描并应用"——程序会从所有子元素中提取 <code>{'{{item.xxx}}'}</code> 与 <code>{'${item.xxx}'}</code> 出现的字段，写入 <code>params</code>。</li>
            <li>运行时，<code>expandGroupInstances</code> 会按 <code>paramFieldMap</code> 把模板中 xxx 映射到源对象字段，再交给 <code>resolveTemplateValue</code> / <code>interpolateExpression</code> 完成替换。</li>
            <li>如需对所有实例强制参数值（例如默认值/测试），在 <code>paramOverrides</code> 中按 JSON 字符串录入。</li>
          </ol>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)' }}>示例：虚拟 div + 参数提取</h3>
          <Code>{`// 子元素内嵌文本
{
  id: 'title', type: 'text',
  text: '{{item.deviceName}} — {{item.status}}',
  pointBinding: {
    mode: 'point',
    textTemplate: '{{item.location}} / {{item.value}}℃',
    transform: 'item.value > 80 ? "高" : "正常"'
  },
  conditionalStyles: {
    fontColor: [{ condition: 'item.status === "alarm"', color: '#ef4444' }]
  }
}

// 组合启用对象模板 + 虚拟 div
{
  id: 'cardGroup', type: 'group',
  children: ['title', ...],
  width: 240, height: 80,
  groupBinding: {
    enabled: true,
    source: 'static',
    value: [
      { deviceName: 'P-1', status: 'normal', value: 30, location: '车间A' },
      { deviceName: 'P-2', status: 'alarm',  value: 95, location: '车间B' }
    ],
    itemAlias: 'item',
    virtualLayout: {
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      padding: 8
    },
    params: [
      { name: 'deviceName', type: 'string' },
      { name: 'status',     type: 'string' },
      { name: 'value',      type: 'number' },
      { name: 'location',   type: 'string' }
    ],
    paramFieldMap: {},            // 不映射，直接按字段名
    paramOverrides: { location: '默认车间' }   // 覆盖所有实例
  }
}`}
          </Code>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)' }}>字段映射示例：模板中字段名 ≠ 源数据字段名</h3>
          <Code>{`// 模板中使用 {{item.name}}，但源数据叫 deviceName
groupBinding: {
  ...
  params: [{ name: 'name', type: 'string' }],
  paramFieldMap: { name: 'deviceName' },   // 渲染时把 name 改写为 deviceName
}`}
          </Code>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.8 }}>
            运行时：<code>{'{{item.name}}'}</code> → <code>{'{{item.deviceName}}'}</code> →
            <code>resolveTemplateValue</code> 命中 <code>context.item.deviceName</code> → 替换完成。
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)' }}>运行时 API</h3>
          <Table
            headers={['API', '说明']}
            rows={[
              ['expandGroupInstances(elements, pointData)', '旧入口，仅返回扁平实例数组（向后兼容）'],
              ['expandGroupInstancesDetailed(elements, pointData)', '返回 { instances, virtualContainers }；虚拟容器供 CanvasViewer 渲染'],
              ['buildVirtualContainerStyle(layout, group)', '把 VirtualLayoutConfig 翻译为 React.CSSProperties 容器/单元样式'],
              ['scanElementsForTemplateParams(elements, itemAlias, sample?)', '从子元素中提取所有 item.xxx 占位符，返回 GroupParamSpec[]'],
            ]}
          />
        </Section>

        {/* Animation */}
        <Section id="animation" title="ElementAnimation — 动画">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
            当前动画字段已在 Schema 中定义，UI 面板待实现。参考 dbscada 的动画引擎，计划支持 CSS keyframes 注入方式。
          </p>
          <Code>{`interface ElementAnimation {
  type:      'rotate' | 'blink' | 'flow' | 'none'
  duration?: number     // 动画周期（ms）
  condition?:string     // 触发条件（JS 表达式，返回 boolean）
                        // 可用: value（绑定点位的当前值）
                        // 示例: "value > 80"（当值超过80时触发）
}

// 计划扩展（对齐 dbscada）：
// type: 'movement'  → path: { x, y }[]（多点路径移动）
// type: 'scale'     → minScale/maxScale（缩放动画）`}
          </Code>
        </Section>

        {/* Events */}
        <Section id="event" title="ElementEvent — 事件">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
            事件字段已在 Schema 中定义，事件执行引擎待实现。计划参考 dbscada 实现完整的条件-动作链。
          </p>
          <Code>{`interface ElementEvent {
  trigger: 'click' | 'dblclick' | 'hover'
  action:  'navigate' | 'popup' | 'script'
  target?: string    // navigate: URL/路由; popup: 组态 code
  script?: string    // action=script 时的 JS 代码（沙箱执行）
}

// 计划扩展（对齐 dbscada）：
// trigger: 'value_condition'  → 数据驱动事件
// action: 'show' | 'hide' | 'change_color' | 'change_text'
//       | 'start_animation' | 'set_svg_property'
// condition: { type: 'equals'|'gt'|'lt'|'range', value, min, max }`}
          </Code>
        </Section>

        {/* Element Types */}
        <Section id="types" title="ElementType — 元素类型参考">
          <Table
            headers={['类型值', '中文名', '关键属性', '渲染方式']}
            rows={[
              [<Tag>rect</Tag>, '矩形', 'fill, stroke, strokeWidth', 'Canvas fillRect / strokeRect'],
              [<Tag>circle</Tag>, '圆形', 'fill, stroke', 'Canvas arc (0~2π)'],
              [<Tag>ellipse</Tag>, '椭圆', 'fill, stroke', 'Canvas ellipse'],
              [<Tag>line</Tag>, '直线', 'stroke, strokeWidth', 'Canvas beginPath / lineTo'],
              [<Tag>polyline</Tag>, '折线', 'stroke, strokeWidth, points[]', 'Canvas 多段 lineTo'],
              [<Tag>polygon</Tag>, '多边形', 'fill, stroke, points[]', 'Canvas closePath'],
              [<Tag>text</Tag>, '文本', 'text, fontSize, fontColor, textAlign', 'Canvas fillText'],
              [<Tag>button</Tag>, '按钮', 'text, fill, events[]', 'Canvas fillRect + fillText'],
              [<Tag>radio</Tag>, '单选框', 'properties.options[], properties.value', 'Canvas 自绘'],
              [<Tag>checkbox</Tag>, '复选框', 'properties.checked', 'Canvas 自绘'],
              [<Tag>table</Tag>, '表格', 'properties.columns[], properties.rows[]', 'Canvas 网格'],
              [<Tag>image</Tag>, '图片', 'imageUrl', 'Canvas drawImage'],
              [<Tag>dynamic-valve</Tag>, '阀门', '无特殊属性（×符号）', 'Canvas 自绘 SVG 路径'],
              [<Tag>dynamic-pump</Tag>, '泵', '无特殊属性（+符号）', 'Canvas 自绘'],
              [<Tag>dynamic-tank</Tag>, '储罐', 'pointBinding（液位显示）', 'Canvas 圆角矩形 + 液位'],
              [<Tag>dynamic-pipe</Tag>, '管道', 'stroke（流向箭头）', 'Canvas 矩形 + 箭头'],
              [<Tag>echarts-bar</Tag>, '柱状图', 'properties.option（ECharts config）', 'ChartWidget 悬浮层'],
              [<Tag>echarts-line</Tag>, '折线图', 'properties.option', 'ChartWidget 悬浮层'],
              [<Tag>echarts-pie</Tag>, '饼图', 'properties.option', 'ChartWidget 悬浮层'],
              [<Tag>echarts-gauge</Tag>, '仪表盘', 'properties.option', 'ChartWidget 悬浮层'],
              [<Tag>custom</Tag>, '自定义', 'properties（任意扩展）', '扩展点，自行实现'],
            ]}
          />
        </Section>

        {/* Diff with dbscada */}
        <Section id="diff" title="与 dbscada 差异对比">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
            dbscada 是功能完整的工业级 SCADA 平台（Vue 2 + Java Spring Boot），以下对比两者在关键维度的差异。
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>技术栈</h3>
          <Table
            headers={['维度', 'scada-editor（新）', 'dbscada（参考）', '状态']}
            rows={[
              ['前端框架', 'React 18 + TypeScript', 'Vue 2 + JavaScript', <Diff status="diff"/>],
              ['构建工具', 'Vite 5', 'Webpack 3', <Diff status="diff"/>],
              ['状态管理', 'Zustand 5', 'Vuex 3', <Diff status="diff"/>],
              ['UI 组件库', 'shadcn/ui 风格（自建）', 'Element UI 2.x', <Diff status="diff"/>],
              ['实时通信', 'STOMP + HTTP 轮询', 'MQTT + WebSocket', <Diff status="diff"/>],
              ['ECharts 封装', 'echarts-for-react', 'echarts 原生', <Diff status="diff"/>],
            ]}
          />

          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '24px 0 12px' }}>元素类型</h3>
          <Table
            headers={['类型分组', 'scada-editor', 'dbscada', '说明']}
            rows={[
              ['基础图形', '6 种', '10 种', 'dbscada 多三角形/曲线/填充变体'],
              ['文本/按钮', '2 种', '3 种', 'dbscada 多 NavImage'],
              ['表单控件', '4 种', '8 种', 'dbscada 多日期/时间选择器、DataEditor'],
              ['容器组件', '无', '3 种', 'dbscada 有走马灯/折叠/标签页（嵌套画布）'],
              ['导航/消息', '无', '4 种', 'dbscada 有 NavMenu/Message/报警灯/有声报警'],
              ['视频组件', '无', '2 种', 'dbscada 有 videoPlayer/HLS 流媒体'],
              ['动态工业元件', '4 种', '8+种', '两者均有阀门/泵/储罐，dbscada 更丰富'],
              ['ECharts 图表', '4 种', '12 种', 'dbscada 多堆叠柱/横向柱/平滑线/面积/玫瑰图等'],
              ['SVG 元件', '无', '支持', 'dbscada 支持 metadata 动态属性读取'],
              ['拓扑/自定义库', '无', '服务端 API', 'dbscada 从后端动态加载资源库'],
            ]}
          />

          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '24px 0 12px' }}>编辑器能力</h3>
          <Table
            headers={['能力', 'scada-editor', 'dbscada', '优先级']}
            rows={[
              ['多选/框选', '仅全选(Ctrl+A)', '有（框选/多选）', '高'],
              ['元素对齐', '无', '6种对齐', '高'],
              ['复制粘贴', '无', '有', '高'],
              ['元素分组', '无', '有', '中'],
              ['属性面板', '单面板', '4 Tab（属性/数据/事件/动画）', '高'],
              ['数据绑定', '1种（点位）', '5种（静态/模拟/变量/数据集/点位）', '高'],
              ['计算属性', '无', 'JS 脚本（引用点位值）', '中'],
              ['动画引擎', '字段定义', '完整引擎（4种动画+条件触发）', '中'],
              ['事件引擎', '字段定义', '完整（条件-动作链）', '中'],
              ['趋势图弹窗', '无', '实时+历史折线图', '低'],
              ['画布背景图', '无', '有（含fit/fill/cover）', '中'],
              ['自适应模式', '无', 'scale/fit/fill', '低'],
              ['图层拖拽排序', '无', '有（vuedraggable）', '中'],
              ['右键菜单', '无', '元素/画布右键菜单', '中'],
            ]}
          />
        </Section>

        {/* Roadmap */}
        <Section id="roadmap" title="开发路线图">
          <Table
            headers={['优先级', '功能', '参考来源', '预估工作量']}
            rows={[
              ['P0 🔴', '属性面板 4 Tab（基础/数据/事件/动画）', 'dbscada PropertyPanel.vue', '3-5天'],
              ['P0 🔴', '多选框选 + 对齐功能', 'dbscada 编辑器', '2-3天'],
              ['P0 🔴', '复制/粘贴元素', 'clipboard 状态', '1天'],
              ['P1 🟡', '数据绑定扩展（模拟/静态/数据集）', 'dbscada dataIngestion', '3-4天'],
              ['P1 🟡', '动画引擎实现（rotate/blink/move）', 'animationExecutor.js', '3天'],
              ['P1 🟡', '事件引擎实现（条件-动作链）', 'canvasEventExecutor.js', '4天'],
              ['P1 🟡', '图层拖拽排序', '@dnd-kit 或 vuedraggable 等价', '1天'],
              ['P2 🟢', '走马灯/折叠/标签页容器', 'dbscada 容器组件', '5-7天'],
              ['P2 🟢', '报警灯（闪烁+声音）', 'alarmLightProperties.vue', '2天'],
              ['P2 🟢', 'ECharts 图表扩展至 12 种', 'echartsLibrary.js', '2天'],
              ['P2 🟢', 'SVG 元件 + metadata 动态属性', 'svgMetadataParser.js', '4天'],
              ['P3 ⚪', '视频/HLS 播放器元件', 'hlsPlayerProperties.vue', '2天'],
              ['P3 ⚪', '趋势图弹窗（实时+历史）', 'TrendChart.vue', '3天'],
              ['P3 ⚪', '计算属性（JS 脚本 + 沙箱）', 'ComputedPropertyDialog.vue', '3天'],
            ]}
          />
        </Section>
      </main>
    </div>
  )
}
