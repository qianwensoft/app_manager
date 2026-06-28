# 组件库统一管理 - 使用指南

## 快速开始

### 1. 基础渲染

```tsx
import { SchemaFormRenderer } from '@/shared'

function MyFormPage() {
  const [values, setValues] = useState()
  
  const schema = {
    form: { labelCol: 6, wrapperCol: 14 },
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '姓名',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-validator': [{ required: true }],
        },
      },
    },
  }

  return (
    <SchemaFormRenderer
      schema={schema}
      value={values}
      onChange={setValues}
      onSubmit={async (vals) => {
        console.log('提交:', vals)
      }}
    />
  )
}
```

### 2. 指定渲染模式

```tsx
// 运行时使用轻量的 shadcn
<SchemaFormRenderer
  schema={schema}
  mode="shadcn"
  {...props}
/>

// 编辑器预览使用 Formily
<SchemaFormRenderer
  schema={schema}
  mode="formily"
  {...props}
/>

// 自动检测（默认）
<SchemaFormRenderer
  schema={schema}
  mode="auto"  // 设计器环境用 formily，运行时用 shadcn
  {...props}
/>
```

### 3. 查询组件信息

```tsx
import { findComponentDef, getComponentAvailability } from '@/shared'

// 查找组件定义
const inputDef = findComponentDef('Input')
console.log(inputDef.label)        // "输入框"
console.log(inputDef.shadcnMapping) // "Input"

// 检查组件可用性
const availability = getComponentAvailability('Select')
console.log(availability.antd)    // true
console.log(availability.shadcn)  // true
```

### 4. 获取组件列表

```tsx
import { getComponentsByCategory, CATEGORY_LABELS } from '@/shared'

const componentsByCategory = getComponentsByCategory()

Object.entries(componentsByCategory).map(([category, components]) => (
  <div key={category}>
    <h3>{CATEGORY_LABELS[category]}</h3>
    {components.map(comp => (
      <div key={comp.name}>{comp.label}</div>
    ))}
  </div>
))
```

## 常见场景

### 场景1: 表单设计器

```tsx
import { Designer } from '@designable/react'
import { COMPONENT_REGISTRY } from '@/shared'

function FormDesigner() {
  // 使用组件注册表生成设计器组件面板
  return (
    <Designer>
      <ComponentPanel>
        {COMPONENT_REGISTRY.map(comp => (
          <DragSource key={comp.name} component={comp.name}>
            {comp.label}
          </DragSource>
        ))}
      </ComponentPanel>
    </Designer>
  )
}
```

### 场景2: 动态表单生成器

```tsx
import { findComponentDef } from '@/shared'

function DynamicFormBuilder({ fields }) {
  const schema = {
    schema: {
      type: 'object',
      properties: {},
    },
  }

  fields.forEach(field => {
    const componentDef = findComponentDef(field.component)
    if (componentDef) {
      schema.schema.properties[field.name] = {
        ...componentDef.schema,
        title: field.label,
      }
    }
  })

  return <SchemaFormRenderer schema={schema} />
}
```

### 场景3: 移动端/桌面端自适应

```tsx
import { SchemaFormRenderer } from '@/shared'

function ResponsiveForm({ schema }) {
  // 移动端使用 shadcn（轻量），桌面端使用 formily（功能完整）
  const isMobile = window.innerWidth < 768
  
  return (
    <SchemaFormRenderer
      schema={schema}
      mode={isMobile ? 'shadcn' : 'formily'}
    />
  )
}
```

### 场景4: 表单预览

```tsx
import { SchemaFormRenderer } from '@/shared'

function FormPreview({ schema, mode = 'shadcn' }) {
  const [values, setValues] = useState({})
  
  return (
    <div className="preview-container">
      <div className="preview-toolbar">
        <button onClick={() => setMode('shadcn')}>shadcn 预览</button>
        <button onClick={() => setMode('formily')}>Formily 预览</button>
      </div>
      
      <SchemaFormRenderer
        schema={schema}
        value={values}
        onChange={setValues}
        mode={mode}
        readonly={true}  // 预览模式只读
      />
    </div>
  )
}
```

## 扩展组件

### 步骤1: 注册组件定义

```typescript
// componentRegistry.ts
export const COMPONENT_REGISTRY: ComponentDef[] = [
  // ... 现有组件
  {
    name: 'ColorPicker',
    label: '颜色选择器',
    category: 'input',
    schema: {
      type: 'string',
      'x-component': 'ColorPicker',
      'x-decorator': 'FormItem',
    },
    props: [
      { name: 'format', label: '格式', type: 'select', 
        options: [
          { label: 'HEX', value: 'hex' },
          { label: 'RGB', value: 'rgb' },
        ]
      },
    ],
    shadcnMapping: 'ColorPicker',
  },
]
```

### 步骤2: 实现 shadcn 适配器

```typescript
// shadcnAdapters.tsx
export function ShadcnColorPicker({
  value,
  onChange,
  format = 'hex',
}: {
  value?: string
  onChange?: (val: string) => void
  format?: 'hex' | 'rgb'
}) {
  return (
    <input
      type="color"
      value={value || '#000000'}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}
```

### 步骤3: 注册到组件映射

```typescript
// shadcnAdapters.tsx
const SHADCN_COMPONENTS = {
  // ... 现有组件
  ColorPicker: ShadcnColorPicker,
}
```

### 步骤4: 添加 props 转换（可选）

```typescript
// propTransform.ts
const PROP_TRANSFORMS: Record<string, PropTransformFn> = {
  // ... 现有转换
  ColorPicker: (p) => ({
    format: p.format || 'hex',
  }),
}
```

### 步骤5: 使用新组件

```tsx
const schema = {
  schema: {
    type: 'object',
    properties: {
      themeColor: {
        type: 'string',
        title: '主题色',
        'x-decorator': 'FormItem',
        'x-component': 'ColorPicker',
        'x-component-props': {
          format: 'hex',
        },
      },
    },
  },
}

<SchemaFormRenderer schema={schema} mode="shadcn" />
```

## 调试技巧

### 1. 查看组件映射

```tsx
import { COMPONENT_REGISTRY } from '@/shared'

console.table(
  COMPONENT_REGISTRY.map(c => ({
    name: c.name,
    label: c.label,
    shadcnMapping: c.shadcnMapping,
  }))
)
```

### 2. 测试 props 转换

```tsx
import { transformProps } from '@/shared'

const formilyProps = { dataSource: [{label: 'A', value: 'a'}], mode: 'multiple' }
const shadcnProps = transformProps('Select', formilyProps)
console.log(shadcnProps) // { options: [...], multiple: true }
```

### 3. 强制指定渲染器（调试用）

```tsx
// URL: ?renderer=formily
<SchemaFormRenderer schema={schema} mode="auto" />
// 会强制使用 formily 渲染
```

## 性能优化

### 1. 懒加载 Formily 渲染器

```tsx
// SchemaFormRenderer.tsx 已实现
const FormilySchemaRenderer = lazy(() => import('./FormilySchemaRenderer'))

// 运行时不加载 Formily，减少打包体积
```

### 2. 按需引入组件

```tsx
// shadcnAdapters.tsx
// 只注册实际使用的组件，避免全量引入
const SHADCN_COMPONENTS = {
  Input: ShadcnInput,
  Select: ShadcnSelect,
  // 注释掉未使用的组件
  // Upload: ShadcnUpload,
}
```

### 3. Schema 缓存

```tsx
const schema = useMemo(() => ({
  schema: { ... }
}), [/* 依赖项 */])

<SchemaFormRenderer schema={schema} />
```

## 常见问题

### Q1: 为什么有些组件在 shadcn 模式下显示"未支持"？

A: 该组件的 shadcn 适配器尚未实现。检查 `shadcnAdapters.tsx` 中是否有对应组件，如没有需要手动实现。

### Q2: Formily 和 shadcn 渲染效果不一致怎么办？

A: 检查 `propTransform.ts` 中的 props 转换逻辑，确保两边的属性映射正确。

### Q3: 如何在编辑器中预览 shadcn 效果？

A: 使用强制模式：
```tsx
<SchemaFormRenderer schema={schema} mode="shadcn" />
```

### Q4: 能否混用 Formily 和 shadcn 组件？

A: 不建议。在同一个表单中应统一使用一种渲染模式，避免样式冲突。

## 相关文档

- [组件注册表](./componentRegistry.ts) - 所有组件定义
- [架构文档](../docs/COMPONENT_LIBRARY_ARCHITECTURE.md) - 详细架构说明
- [演示页面](./pages/ComponentLibraryDemo.tsx) - 在线演示
