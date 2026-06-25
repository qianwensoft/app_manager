# form-app 低代码平台架构改造 PRD

**版本**: v1.0  
**日期**: 2026-06-18  
**状态**: 待评审

---

## 一、背景与问题

### 1.1 当前架构痛点

#### 技术层面
1. **表单专用框架困局**
   - 当前基于 Formily + @designable/formily，只适配"表单页"场景
   - 列表页/详情页无可视化设计能力（硬编码 `ListRenderer`/`DetailRenderer`）
   - 强行扩展到非表单场景会导致语义扭曲（"把详情/列表当特殊表单"）

2. **设计器内核停更**
   - `@designable/formily` 最后 release 停在 **2021-08**，社区事实停更
   - peer 依赖锁 React 16.x/17.x，不支持 React 18/19
   - 周下载量仅 ~1.9k，无长期维护保障

3. **整页编辑语义缺失**
   - 画布根节点是 `Form`，选中根时属性面板全是表单专属配置
   - 页头/分区/图片等非表单组件被强行套进表单栅格布局
   - 无"页面级"配置容器（页面标题/背景/内边距）

4. **事件系统与渲染耦合**
   - 当前事件引擎虽已独立（`eventEngine.ts`），但触发依赖 formily form 实例
   - 非表单页（列表/详情）无法复用事件系统

5. **性能与扩展性**
   - 单页面加载无优化（大页面全量渲染）
   - 组件库扩展受 formily schema 表达力限制

#### 业务层面
- 无法支持**复杂列表页设计**（列配置/筛选器/分页）
- 无法支持**复杂详情页设计**（多区块布局/卡片/Tab 切换）
- 无法支持**仪表盘/图表**页面类型
- 移动端适配（antd-mobile）与桌面端（antd）切换能力有限

### 1.2 改造目标

**核心诉求**：从"表单专用设计器"演进为"通用页面低代码平台"

**技术目标**：
1. 拖拽层/UI 层适配现有体系（保持用户熟悉的操作习惯）
2. **事件系统独立构建**，与渲染引擎解耦，稳定交互运行
3. 支持多页面类型：表单/详情/列表/仪表盘
4. 升级到 **React 19 + Puck** 现代技术栈
5. 组件库**代码级可定制**（不受 schema 表达力限制）
6. 考虑**单页面加载效率**优化（懒加载/分 chunk）

**业务目标**：
- 3 个月内支持列表页/详情页可视化设计（替代硬编码）
- 6 个月内图表/仪表盘组件库完善
- 存量 formily 表单页零迁移成本，平滑过渡

---

## 二、技术选型

### 2.1 核心技术栈对比

| 维度 | 当前方案 | 改造方案 | 决策依据 |
|---|---|---|---|
| **React** | 17.0.2 | **19.x** | Puck 要求 ^18/^19；19 长期稳定 |
| **UI 库** | antd 4.22 | **antd v5.x** | v4 在 React 19 功能损坏（findDOMNode 移除）；v5 必选 |
| **低代码内核** | @designable/formily | **@puckeditor/core 0.21+** | 活跃维护、支持 React 19、用真实组件、不绑表单语义 |
| **表单渲染** | @formily/antd 2.3 | **过渡期**: @formily/antd-v5；**长期**: 自研受控组件 | 保留 formily 能力过渡，最终代码级可控 |
| **事件引擎** | eventEngine.ts（已有） | **保持独立，强化接口** | 已解耦良好，按页实例化 |

### 2.2 Puck 选型理由

**为什么选 Puck 而非 Craft.js / 继续扩 Formily**：

| 方案 | 优势 | 劣势 | 结论 |
|---|---|---|---|
| **继续扩 Formily** | 改动最小 | 表单语义扭曲、列表/图表硬塞、已停更 | ❌ 技术债务加重 |
| **Craft.js** | React 17 兼容、成熟 | 单人维护、近一年无 release、周下载 62k | △ 可选但活跃度不如 Puck |
| **Puck** ✅ | ① 极活跃（v0.21 2026-06，几乎每天 push）<br>② 周下载 72k 且增长<br>③ 专为"整页可视化"设计<br>④ 用真实组件（设计态=运行态）<br>⑤ 明确支持 React 18/19 | 必须升 React 18+ | ✅ **首选** |
| **dnd-kit 自搭** | 最活跃（18.5M/周）、最可控 | 选中态/面板/schema 全自研 | △ 工作量过大 |
| **amis/lowcode-engine** | 完整平台 | 要求用内置组件+JSON schema，不复用现有组件 | ❌ 不匹配"代码级可定制" |

**Puck 核心优势**（对照项目诉求）：
- ✅ **事件系统独立**：Puck 只管布局，事件逻辑在你的组件 `render()` 里，天然解耦
- ✅ **组件库代码级可定制**：每个组件是普通 React 组件 + `fields` 配置，复杂交互直接写 hooks
- ✅ **性能优化友好**：组件支持 `React.lazy()`，大页面可分 zone 懒加载
- ✅ **不绑表单**：表单只是页面里的一种组件（FormBlock），列表/详情/图表同级

### 2.3 React 19 升级影响评估

#### 阻塞点（已核实）

| 依赖 | React 19 兼容 | 处理方案 |
|---|---|---|
| `@formily/core/react` 2.3.7 | ⚠️ peer 不挡，但官方未声明 19 适配 | 过渡期保留，逐步替换为自研 |
| **antd 4.22** | ❌ 功能损坏（findDOMNode 移除、Modal.confirm 失效） | **强制升 antd v5** |
| `@formily/antd` 2.3 | ❌ 绑 antd v4 | 换 `@formily/antd-v5` |
| `@designable/*` | ❌ 锁 React 16/17 | **直接移除**（弃用 formily-antd 设计态） |
| antd-mobile 5.42 | ✅ 明确含 ^19 | 无需改动 |
| Puck 0.21 | ✅ `^18 \|\| ^19` | 无需改动 |
| react-router-dom 6.30 | ✅ `>=16.8` | 无需改动 |

#### 迁移工作量（antd v4→v5）

- **样式 token 体系变更**：Design Token 替代 less 变量，需全局主题配置适配
- **组件 API 变更**：
  - `message` / `Modal` / `notification` 静态方法 → hooks 版（`useMessage` / `useModal`）
  - `Form.Item` 的 `name` prop 类型收紧
  - 部分组件 props 废弃（查文档逐个适配）
- **回归测试范围**：所有存量 formily 表单页（字段渲染/校验/样式）

#### 风险缓解
- formily 2.3.7 在 React 18 有大量生产验证，但 React 19 无官方背书
- **缓解策略**：过渡期保留 formily，FormBlock 内嵌；长期用自研受控组件彻底脱 formily
- 最坏情况：formily 在 19 下有兼容问题 → 加速自研表单组件替换

---

## 三、目标架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│ 设计器层 (Puck + React 19)                                │
│  ├─ 拖拽/选中/属性面板 (Puck 内核)                          │
│  ├─ 组件资源库 (代码编写，注册到 Puck)                       │
│  │   - 页面布局: PageHeader / Section / Grid / Tabs       │
│  │   - 数据展示: DataTable / DescList / Chart / StatCard │
│  │   - 表单区块: FormBlock (内嵌 formily 或自研)           │
│  │   - 交互: Button / EventButton / NavigateButton        │
│  ├─ 事件编排器 (独立 Drawer，编辑 events JSON)              │
│  └─ 保存: { puckData, events } 分离存储                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 运行时层 (分离架构)                                         │
│  ├─ 路由/格式探测: MultiPageRuntime                        │
│  │   - 检测 Puck data → PuckRenderer                     │
│  │   - 检测 Formily schema → SchemaFormRenderer (兼容)   │
│  ├─ PuckRenderer:                                        │
│  │   - <Render config={registry} data={puckData} />     │
│  │   - 组件懒加载 (React.lazy + Suspense)                 │
│  └─ EventEngine (独立模块):                               │
│      - setupPageEvents(events, deps) → dispose          │
│      - 按页实例化，支持 field_change/scan/button/custom  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 数据/业务层                                                │
│  ├─ API 调用: onScanInterface / onQueryOptions          │
│  ├─ 打印桥接: doPrint (AndroidBridge)                     │
│  └─ 事件动作: navigate / toast / speak / run_script      │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心模块职责

#### 3.2.1 设计器层 (PageDesignerPuck.tsx - 新建)

**职责**：
- 初始化 Puck：`<Puck config={componentConfig} data={initialData} onPublish={handleSave} />`
- 组件资源库注册（`componentConfig.components`）
- 独立事件编排 Drawer（编辑 `events` JSON，不混入 Puck data）
- 多端预览切换（桌面/移动组件库）

**输出**：
- `puckData`: Puck 的 `{ root, zones }` JSON
- `events`: 独立的 `PageEvent[]` JSON

#### 3.2.2 运行时层

**PuckRenderer.tsx (新建)**
```typescript
interface PuckRendererProps {
  data: PuckData              // Puck { root, zones }
  events: PageEvent[]         // 独立事件配置
  componentRegistry: Config   // 组件注册表（按终端切库）
  formCode?: string           // 表单应用 code（用于事件动作）
  pageKey: string
}
```

**职责**：
- 渲染 Puck 页面：`<Render config={registry} data={data} />`
- 初始化事件引擎：`setupPageEvents(events, deps)`
- 懒加载组件：`<Suspense fallback={<Spin />}>`
- 页面卸载时清理事件监听器

**EventEngine.ts (保持现有，强化接口)**
```typescript
export interface EventEngineDeps {
  form?: FormInstance          // 可选：仅 FormBlock 页面提供
  getFormValues: () => any     // 读页面状态（不限表单）
  onScanInterface?: (code, params, type?, endpointId?) => Promise<any>
  doPrint?: (templateId, data, extra?) => void
  onNavigate?: (pageKey, query?) => void
}

export function setupPageEvents(
  events: PageEvent[],
  deps: EventEngineDeps
): () => void  // 返回 dispose 函数
```

**独立性保证**：
- 不依赖 Puck/formily 实现细节
- 按页面实例化（多页面 SPA 场景互不干扰）
- 事件源（field_change/scan/button/custom）通过 `deps` 接口接入

#### 3.2.3 组件注册表 (componentRegistry.ts - 新建)

```typescript
import { ComponentConfig } from '@puckeditor/core'

export const DataTable: ComponentConfig<DataTableProps> = {
  fields: {  // 属性面板配置
    columns: {
      type: 'array',
      arrayFields: {
        title: { type: 'text' },
        dataIndex: { type: 'text' },
        width: { type: 'number' },
      },
    },
    interfaceCode: { type: 'text', label: '数据接口' },
    pageSize: { type: 'number' },
  },
  defaultProps: { columns: [], pageSize: 10 },
  render: ({ columns, interfaceCode, pageSize }) => {
    // 真实业务组件，直接用 antd Table
    return <RealDataTable {...props} />
  },
}

// 按终端切库
export const getComponentRegistry = (end: 'desktop' | 'mobile'): Config => ({
  components: {
    DataTable,
    FormBlock: end === 'desktop' ? FormBlockAntd : FormBlockMobile,
    // ... 其他组件
  },
})
```

### 3.3 存量兼容策略

**两种模式并存**（运行时格式探测分流）：

```typescript
// MultiPageRuntime.tsx
const designSchema = JSON.parse(currentPage.design_schema || '{}')

if (isPuckData(designSchema)) {
  // 新 Puck 页面
  return (
    <PuckRenderer
      data={designSchema}
      events={config.events}
      componentRegistry={getComponentRegistry(libraryKey)}
      formCode={formCode}
      pageKey={currentPage.page_key}
    />
  )
} else if (isFormilySchema(designSchema)) {
  // 旧 Formily 页面（零改动，原样渲染）
  return <SchemaFormRenderer designSchema={designSchema} {...props} />
} else {
  // list/detail 硬编码渲染器（一期保留，二期用 Puck 替换）
  if (currentPage.page_type === 'list') return <ListRenderer />
  if (currentPage.page_type === 'detail') return <DetailRenderer />
}
```

**格式探测逻辑**：
```typescript
function isPuckData(obj: any): boolean {
  return obj?.root?.type !== undefined && obj?.zones !== undefined
}

function isFormilySchema(obj: any): boolean {
  return obj?.form !== undefined && obj?.schema?.properties !== undefined
}
```

**迁移路径**：
- 存量 formily 页：不迁移，运行时原样渲染，设计器继续用 PageDesignerPage（旧）
- 新建页：直接用 PageDesignerPuck（新）
- 改造页：人工"另存为 Puck 页"（可选，非强制）

---

## 四、实施计划

### 4.1 分期目标

| 阶段 | 时间 | 目标 | 验收标准 |
|---|---|---|---|
| **0 期：地基** | 2 周 | React 17→19 + antd v4→v5 | 所有存量 formily 页在 React 19 下渲染正常、样式无异常 |
| **1 期：Puck 接入** | 4 周 | Puck 设计器 + 基础组件库 + 事件引擎对接 | 新建 Puck 页，拖拽 PageHeader+Section+FormBlock+Button，配置事件触发正常 |
| **2 期：数据展示** | 6 周 | DataTable/DescList 组件 + 列表/详情页可视化设计 | 列表页可视化配列/接口/筛选，详情页拖卡片/字段，替代硬编码渲染器 |
| **3 期：性能优化** | 4 周 | 组件懒加载 + Puck data 分 chunk + 自研表单组件启动 | 大页面（50+ 组件）首屏加载 < 2s |

### 4.2 0 期：React 19 + antd v5 升级（地基）

#### 工作项

1. **移除 @designable 依赖**
   - `package.json` 移除 `@designable/*` 全系列
   - 删除 `PageDesignerPage.tsx` 里的 formily-antd 设计态导入
   - 删除 `schemaConverter.ts` 里的 `normalizeDesignSchema`（旧包裹适配）

2. **React 17→19**
   - `package.json`: `react@^19.0.0`, `react-dom@^19.0.0`
   - `@types/react@^19.0.0`, `@types/react-dom@^19.0.0`
   - `main.tsx`: `ReactDOM.render()` → `createRoot().render()`
   - 修复 TypeScript 类型错误（`children` prop 类型收紧）

3. **antd 4→5**
   - `package.json`: `antd@^5.x`
   - 全局配置 Design Token：`<ConfigProvider theme={{...}}>`
   - `message` / `Modal` 静态方法改 hooks：
     ```typescript
     // 旧：message.success('xx')
     // 新：const [msg, contextHolder] = message.useMessage(); msg.success('xx')
     ```
   - Form.Item `name` prop 类型收紧：严格校验嵌套路径

4. **formily-antd v5 适配**
   - `package.json`: `@formily/antd-v5` (如有，否则 `@formily/antd` peer 依赖升 antd5)
   - FormBlock / SchemaFormRenderer 里的 `@formily/antd` 导入路径更新

5. **回归测试**
   - 逐页打开存量 formily 表单页，验证渲染/校验/提交/草稿/事件正常
   - 样式对比截图（antd4 vs antd5）
   - Android 菜单打开表单页正常

#### 风险与缓解
- **风险**：formily 2.3.7 在 React 19 下无官方背书
- **缓解**：0 期完成后充分回归测试；若遇兼容问题，1 期开始加速自研表单组件替换

---


### 4.3 1 期：Puck 接入 + 事件引擎对接

#### 工作项

1. **安装 Puck**
   ```bash
   npm install @puckeditor/core@^0.21
   ```

2. **新建 PageDesignerPuck.tsx**（与旧 PageDesignerPage 并存）
   ```typescript
   import { Puck } from '@puckeditor/core'
   import { componentConfig } from '@/puck/componentRegistry'
   
   export default function PageDesignerPuck() {
     const [data, setData] = useState<PuckData>(initialData)
     const [events, setEvents] = useState<PageEvent[]>([])
     
     const handlePublish = async (puckData: PuckData) => {
       await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
         design_schema: JSON.stringify(puckData),
         config_json: JSON.stringify({ events, end_strategy }),
       })
     }
     
     return (
       <>
         <Puck config={componentConfig} data={data} onPublish={handlePublish} />
         <EventsDrawer events={events} onChange={setEvents} />
       </>
     )
   }
   ```

3. **组件注册表第一批**（`puck/componentRegistry.ts`）
   - PageHeader / Section / Divider / StaticImage / StaticText
   - Button / EventButton / NavigateButton
   - FormBlock（内嵌 formily，复用现有 SchemaFormRenderer 逻辑）

4. **FormBlock 组件**（关键）
   ```typescript
   export const FormBlock: ComponentConfig<FormBlockProps> = {
     fields: {
       fields: {
         type: 'array',
         label: '表单字段',
         arrayFields: {
           field: { type: 'text' },
           label: { type: 'text' },
           component: { type: 'select', options: ['Input', 'Select', 'DatePicker', ...] },
           required: { type: 'radio', options: [{ label: '必填', value: true }] },
         },
       },
       labelCol: { type: 'number', label: '标签列宽' },
       wrapperCol: { type: 'number' },
     },
     render: ({ fields, labelCol, wrapperCol }) => {
       // 内部用 formily 渲染表单字段
       const schema = fieldDefsToSchema(fields)
       return <SchemaFormRenderer designSchema={{form:{labelCol,wrapperCol}, schema}} />
     },
   }
   ```

5. **PuckRenderer.tsx**（运行时渲染器）
   ```typescript
   export function PuckRenderer({ data, events, componentRegistry, formCode, pageKey }: Props) {
     const form = useRef<FormInstance | null>(null)
     
     useEffect(() => {
       const dispose = setupPageEvents(events, {
         form: form.current,
         getFormValues: () => form.current?.getFieldsValue() || {},
         onScanInterface,
         doPrint,
         onNavigate,
       })
       return dispose
     }, [events, pageKey])
     
     return (
       <Suspense fallback={<Spin />}>
         <Render config={componentRegistry} data={data} />
       </Suspense>
     )
   }
   ```

6. **MultiPageRuntime.tsx 格式探测分流**
   ```typescript
   if (isPuckData(designSchema)) {
     return <PuckRenderer data={designSchema} events={config.events} ... />
   } else if (isFormilySchema(designSchema)) {
     return <SchemaFormRenderer designSchema={designSchema} ... />
   }
   ```

7. **路由配置**
   - `/form-app/page-designer-puck/:pageId` → PageDesignerPuck（新）
   - `/form-app/page-designer/:pageId` → PageDesignerPage（旧，保留）
   - 页面列表加"编辑方式"选择（Puck / Formily / 锁定）

#### 验收标准
- [ ] 新建一个 Puck 页面，拖拽 PageHeader + Section + FormBlock（含 2 个字段）+ Button
- [ ] 配置事件：button 点击 → call_interface → toast
- [ ] 保存后，运行时（`/form-app/runtime/:code`）渲染正常，事件触发正常
- [ ] 移动端预览组件库切换正常（antd-mobile）
- [ ] 存量 formily 页不受影响，原样渲染

---

### 4.4 2 期：数据展示组件（列表/详情可视化）

#### 工作项

1. **DataTable 组件**（列表页核心）
   ```typescript
   export const DataTable: ComponentConfig<DataTableProps> = {
     fields: {
       columns: {
         type: 'array',
         label: '列配置',
         getItemSummary: (col) => col.title || col.dataIndex,
         arrayFields: {
           title: { type: 'text', label: '列标题' },
           dataIndex: { type: 'text', label: '字段名' },
           width: { type: 'number', label: '宽度' },
           render: { type: 'select', label: '渲染类型', options: ['text', 'tag', 'date', 'link'] },
         },
       },
       interfaceCode: { type: 'text', label: '数据接口 code' },
       pageSize: { type: 'number', label: '每页条数' },
       showFilters: { type: 'radio', label: '显示筛选器' },
       filters: {
         type: 'array',
         label: '筛选器',
         arrayFields: {
           field: { type: 'text' },
           label: { type: 'text' },
           component: { type: 'select', options: ['Input', 'Select', 'DatePicker'] },
         },
       },
     },
     render: (props) => {
       const [data, setData] = useState([])
       const [loading, setLoading] = useState(false)
       const [page, setPage] = useState(1)
       const [total, setTotal] = useState(0)
       
       const loadData = async (filters = {}) => {
         setLoading(true)
         const res = await onQueryInterface(props.interfaceCode, { ...filters, page, page_size: props.pageSize })
         setData(res.data || [])
         setTotal(res.total || 0)
         setLoading(false)
       }
       
       return (
         <>
           {props.showFilters && <FilterBar filters={props.filters} onSearch={loadData} />}
           <Table
             columns={props.columns}
             dataSource={data}
             loading={loading}
             pagination={{ current: page, pageSize: props.pageSize, total, onChange: setPage }}
           />
         </>
       )
     },
   }
   ```

2. **DescriptionList 组件**（详情页核心）
3. **StatCard 组件**（统计卡片）
4. **list/detail 页改走 Puck 设计器**
5. **MultiPageRuntime 里硬编码 ListRenderer/DetailRenderer 逻辑移除**

#### 验收标准
- [ ] 新建列表页，拖 DataTable，配列/接口/筛选器，运行时加载数据、分页、筛选正常
- [ ] 新建详情页，拖 DescriptionList + StatCard，接口加载数据正常
- [ ] 存量硬编码 list/detail 页自动生成 Puck data，渲染与旧 ListRenderer 行为一致

---

### 4.5 3 期：性能优化 + 自研表单组件

#### 工作项
1. 组件懒加载（React.lazy）
2. Puck data 分 zone（大页面场景）
3. 自研表单组件启动（逐步替换 formily）
4. Chart 组件（ECharts 集成）

#### 验收标准
- [ ] 大页面（50+ 组件）首屏加载 < 2s
- [ ] Chart 组件可视化配置图表类型/数据源，渲染正常
- [ ] 自研表单组件校验/联动与 formily 行为一致，可逐步替换

---

## 五、数据模型

### 5.1 存储结构

**FormAppPage 表（已有，字段复用）**

| 字段 | 类型 | 旧用途 | 新用途 |
|---|---|---|---|
| `design_schema` | TEXT | Formily `{form, schema}` JSON | Puck `{root, zones}` JSON **或** Formily JSON（格式探测分流） |
| `config_json` | TEXT | `{field_definitions, scanner, events, ...}` | 保留 `events` / `end_strategy` |

**格式探测**：
```typescript
function isPuckData(obj: any): boolean {
  return obj?.root?.type !== undefined && obj?.zones !== undefined
}
```

---

## 六、技术风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| formily 在 React 19 下兼容问题 | 高 | 中 | 0 期充分回归测试；1 期启动自研表单组件 |
| antd v5 迁移样式回归工作量大 | 中 | 高 | 分期回归，Design Token 统一配置 |
| Puck 社区生态不成熟 | 中 | 中 | 组件库自研，不依赖 Puck 生态 |

---

## 七、成功指标

### 7.1 技术指标

| 指标 | 基线 | 目标（3 个月） | 目标（6 个月） |
|---|---|---|---|
| 支持页面类型 | 表单 + 列表/详情（硬编码） | **全可视化设计** | + 图表/仪表盘 |
| 首屏加载时间（50 组件） | N/A | < 3s | < 2s |
| React 版本 | 17 | **19** | 19 |

---

## 八、资源需求

| 阶段 | 前端工程师 | 测试工程师 |
|---|---|---|
| 0 期（2周） | 1 人全职 | 0.5 人 |
| 1 期（4周） | 2 人全职 | 1 人 |
| 2 期（6周） | 2 人全职 | 1 人 |
| 3 期（4周） | 1 人全职 | 0.5 人 |

---

## 九、附录

### 9.1 参考资料
- [Puck 官方文档](https://puckeditor.com/docs)
- [antd v5 迁移指南](https://ant.design/docs/react/migration-v5)
- [React 19 升级指南](https://react.dev/blog/2024/04/25/react-19)

### 9.2 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-06-18 | 选择 Puck 而非 Craft.js | 活跃度更高、明确支持 React 19 |
| 2026-06-18 | 直升 React 19（不走 18） | 用户明确偏向 19，且 Puck 支持 |
| 2026-06-18 | 事件系统独立构建 | 用户核心诉求，与渲染引擎解耦 |

---

**PRD 编写**: Claude Code  
**审核**: 待定  
**批准**: 待定
