# Formily 编辑器 + shadcn 运行时统一管理方案

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    统一组件注册表                              │
│              componentRegistry.ts                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ComponentDef: 组件定义（名称、分类、Schema模板、Props） │  │
│  │ - name: Input, Select, DatePicker...                  │  │
│  │ - shadcnMapping: 对应的 shadcn 组件名                  │  │
│  │ - schema: Formily Schema 模板                         │  │
│  │ - props: 可配置属性列表                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  编辑器环境        │      │   运行时环境       │
    │  (Formily)       │      │   (shadcn)        │
    └──────────────────┘      └──────────────────┘
           │                           │
           ▼                           ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ Formily 组件      │      │ shadcn 适配器     │
    │ (Ant Design)     │      │ shadcnAdapters   │
    │ - Input          │      │ - ShadcnInput    │
    │ - Select         │      │ - ShadcnSelect   │
    │ - DatePicker     │      │ - ShadcnDatePicker│
    └──────────────────┘      └──────────────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
              ┌─────────────────┐
              │ Schema 渲染器    │
              │ SchemaFormRenderer│
              │ - auto 模式      │
              │ - formily 模式   │
              │ - shadcn 模式    │
              └─────────────────┘
```

## 核心文件说明

### 1. 统一定义层

#### `componentRegistry.ts`
- **职责**: 定义所有可用组件的元数据
- **内容**:
  - `ComponentDef`: 组件定义接口
  - `COMPONENT_REGISTRY`: 组件注册表数组
  - `findComponentDef()`: 查找组件定义
  - `getComponentsByCategory()`: 按分类获取组件

**关键字段**:
```typescript
{
  name: 'Input',                    // 组件标识（Formily x-component）
  label: '输入框',                   // 显示名称
  category: 'input',                // 分类
  schema: {...},                    // Formily Schema 模板
  props: [...],                     // 可配置属性
  shadcnMapping: 'Input'            // 对应的 shadcn 组件名
}
```

#### `componentLibraryRegistry.ts`
- **职责**: 管理多个组件库（antd/shadcn）的配置
- **功能**:
  - `getComponentLibrary()`: 获取组件库配置
  - `getFormilyComponents()`: 获取 Formily 组件映射
  - `isComponentAvailable()`: 检查组件可用性

### 2. 转换层

#### `propTransform.ts`
- **职责**: Formily props → shadcn props 转换
- **示例**:
```typescript
// Formily Select
{ dataSource: [...], mode: 'multiple' }
    ↓
// shadcn Select
{ options: [...], multiple: true }
```

### 3. 适配层

#### `shadcnAdapters.tsx`
- **职责**: 包装 shadcn 组件，使其兼容 Formily 接口
- **组件列表**:
  - `ShadcnInput`: 输入框适配器
  - `ShadcnSelect`: 下拉选择适配器
  - `ShadcnDatePicker`: 日期选择适配器
  - `ShadcnFormItem`: 表单项容器
  - 等等...

**适配模式**:
```typescript
export const ShadcnInput = React.forwardRef((props, ref) => {
  const { value, onChange, ...rest } = props
  return (
    <Input
      ref={ref}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    />
  )
})
```

### 4. 渲染层

#### `ShadcnSchemaRenderer.tsx`
- **职责**: 将 Formily Schema 渲染为 shadcn 组件
- **流程**:
  1. 读取 Schema 定义
  2. 查找 `shadcnMapping`
  3. 转换 props
  4. 使用 Formily Field 渲染

#### `FormilySchemaRenderer.tsx`
- **职责**: Formily 原生渲染（编辑器/预览）
- **特点**: 使用 Ant Design 组件，与设计器一致

#### `SchemaFormRenderer.tsx`
- **职责**: 统一入口，根据模式选择渲染器
- **模式**:
  - `auto`: 自动检测（设计器 → Formily，运行时 → shadcn）
  - `formily`: 强制使用 Formily
  - `shadcn`: 强制使用 shadcn

## 使用方式

### 方式1: 自动模式（推荐）

```tsx
import { SchemaFormRenderer } from '@/shared/SchemaFormRenderer'

<SchemaFormRenderer
  schema={schema}
  value={formValues}
  onChange={setFormValues}
  onSubmit={handleSubmit}
  mode="auto"  // 自动检测环境
/>
```

### 方式2: 指定模式

```tsx
// 运行时强制使用 shadcn
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
```

### 方式3: 使用现有 runtime 组件库切换

```tsx
import { SchemaFormRenderer } from '@/runtime/SchemaFormRenderer'

<SchemaFormRenderer
  designSchema={schema}
  libraryKey="shadcn"  // 或 "antd"
  {...props}
/>
```

## 组件映射规则

| Formily 组件 | shadcn 组件 | 说明 |
|-------------|------------|------|
| Input | Input | 文本输入 |
| Input.TextArea | Textarea | 多行文本 |
| NumberPicker | NumberInput | 数字输入 |
| Select | Select | 下拉选择 |
| Radio.Group | RadioGroup | 单选组 |
| Checkbox.Group | CheckboxGroup | 多选组 |
| Switch | Switch | 开关 |
| DatePicker | DatePicker | 日期选择 |
| Rate | Rating | 评分 |
| Slider | Slider | 滑块 |
| ArrayTable | DataTable | 表格数组 |
| ArrayCards | CardList | 卡片数组 |

## 扩展新组件

### 1. 在 `componentRegistry.ts` 注册

```typescript
{
  name: 'Upload',
  label: '文件上传',
  category: 'input',
  schema: {
    type: 'string',
    'x-component': 'Upload',
    'x-decorator': 'FormItem',
  },
  props: [
    { name: 'accept', label: '接受类型', type: 'string' },
    { name: 'maxSize', label: '最大大小', type: 'number' },
  ],
  shadcnMapping: 'FileUpload',
}
```

### 2. 实现 shadcn 适配器

```typescript
// shadcnAdapters.tsx
export function ShadcnFileUpload({ value, onChange, accept, maxSize }: any) {
  return (
    <input
      type="file"
      accept={accept}
      onChange={(e) => {
        const file = e.target.files?.[0]
        onChange?.(file)
      }}
    />
  )
}
```

### 3. 添加 props 转换（如需要）

```typescript
// propTransform.ts
FileUpload: (p) => ({
  accept: p.accept,
  maxSize: p.maxSize || 10 * 1024 * 1024, // 默认 10MB
}),
```

### 4. 注册到组件映射

```typescript
// shadcnAdapters.tsx
const SHADCN_COMPONENTS = {
  ...
  FileUpload: ShadcnFileUpload,
}
```

## 优势

### ✅ 编辑器体验不变
- 继续使用成熟的 Formily Designable
- Ant Design 组件库完整支持
- 所见即所得的设计体验

### ✅ 运行时轻量化
- shadcn 组件按需引入
- 减少打包体积（Ant Design ~500KB → shadcn ~50KB）
- 更快的加载速度

### ✅ Schema 统一
- 一份 JSON Schema
- 两套渲染引擎
- 无需维护两套表单定义

### ✅ 渐进迁移
- 可以先迁移部分组件
- 不影响已有功能
- 平滑过渡

### ✅ 多端适配
- 桌面端：Ant Design（功能完整）
- 移动端：shadcn（轻量快速）
- 自动切换或手动指定

## 注意事项

### 组件能力差异
- ArrayTable/ArrayCards 等复杂组件需要完整实现
- shadcn 部分组件需要自定义（如 multi-select）
- 动态联动、条件渲染需要测试验证

### Props 映射不完全
- Ant Design 和 shadcn 的 API 存在差异
- 部分 props 可能无法完全映射
- 需要在 `propTransform.ts` 中持续完善

### 样式一致性
- 两套组件库的样式风格不同
- 建议在运行时统一使用一种风格
- 避免在同一页面混用

## 测试验证

运行演示页面：

```bash
# 启动开发服务器
npm run dev

# 访问演示页面
http://localhost:5175/component-library-demo
```

在演示页面可以：
- 查看所有注册组件
- 对比 Formily 和 shadcn 渲染效果
- 测试表单提交和值变化
- 查看 Schema 定义

## 后续优化

1. **完善复杂组件**：实现 ArrayTable、ArrayCards 的 shadcn 版本
2. **增强 props 映射**：处理更多边界情况
3. **性能优化**：懒加载、代码分割
4. **文档完善**：每个组件的使用示例
5. **测试覆盖**：确保两套渲染效果一致
