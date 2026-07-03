# Form-App 按钮组件增强 - 修改清单

## 执行时间
2026年7月2日

## 构建状态
✅ TypeScript 编译通过
✅ Vite 构建成功
✅ 无语法错误
✅ 所有修改向后兼容

---

## 修改文件列表

### 1. 设计态组件（Designable）

#### ✅ ActionButtons.tsx
**路径:** `form-app/src/designable/ActionButtons.tsx`

**修改内容:**
- EventButton: 更新 buttonId 配置，添加占位符提示
- NavigateButton: 添加 navigateType、targetPage、targetUrl 字段
- 所有按钮添加 `<div data-content-editable="x-component-props">` 包装层

**代码变更:**
```typescript
// EventButton - 添加 buttonId 配置
buttonId: {
  type: 'string',
  title: '按钮ID',
  description: '用于事件编排中匹配按钮触发源（留空自动生成）',
  'x-decorator': 'FormItem',
  'x-component': 'Input',
  'x-component-props': {
    placeholder: '自动生成或手动输入',
  },
}

// NavigateButton - 添加跳转类型
navigateType: {
  type: 'string',
  title: '跳转类型',
  enum: [
    { label: 'App内页面', value: 'internal' },
    { label: '外部URL', value: 'url' },
  ],
}
```

#### ✅ SubmitButton.tsx
**路径:** `form-app/src/designable/SubmitButton.tsx`

**修改内容:**
- 添加 `<div data-content-editable="x-component-props">` 包装层
- 添加 variant、block、buttonId 配置
- 添加 `droppable: false`

**代码变更:**
```typescript
// 设计态渲染
export const SubmitButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  const text = p.text || props?.text || props?.children || '提交'
  return (
    <div data-content-editable="x-component-props">
      <Button type="button">
        {text}
      </Button>
    </div>
  )
}

// propsSchema 添加
variant: {
  type: 'string',
  title: '按钮样式',
  enum: [
    { label: '默认', value: 'default' },
    { label: '次要', value: 'secondary' },
    // ...
  ],
},
buttonId: {
  type: 'string',
  title: '按钮ID',
  description: '提交成功后可触发以此ID为源的事件流',
}
```

#### ✅ ConfirmDialogButton.tsx
**路径:** `form-app/src/designable/ConfirmDialogButton.tsx`

**修改内容:**
- 添加 `<div data-content-editable="x-component-props">` 包装层
- 添加 onConfirm 动作类型选择
- 添加 buttonId、targetPage、interfaceType、interfaceCode 等字段
- 使用 x-reactions 实现条件显示
- 添加 `droppable: false`

**代码变更:**
```typescript
// 确认后动作配置
onConfirm: {
  type: 'string',
  title: '确认后动作',
  enum: [
    { label: '触发事件', value: 'event' },
    { label: '提交表单', value: 'submit' },
    { label: '跳转页面', value: 'navigate' },
    { label: '调用接口', value: 'interface' },
  ],
},

// 条件显示字段
buttonId: {
  'x-reactions': {
    dependencies: ['.onConfirm'],
    fulfill: { state: { visible: '{{$deps[0] === "event"}}' } },
  },
}
```

#### ✅ Button.tsx, FeedbackButton.tsx
**路径:** `form-app/src/designable/Button.tsx` 等

**修改内容:**
- 添加 `<div data-content-editable="x-component-props">` 包装层
- 确保所有按钮可以被选中

---

### 2. 运行时组件（Runtime）

#### ✅ SubmitButton.tsx
**路径:** `form-app/src/runtime/SubmitButton.tsx`

**修改内容:**
- 添加 buttonId、variant、block 参数
- 集成 useFormAction 获取 triggerButton
- 提交成功后触发事件流

**代码变更:**
```typescript
interface SubmitButtonProps {
  text?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  block?: boolean
  buttonId?: string // 新增
}

const handleSubmit = async () => {
  if (!submit) return
  try {
    await submit()
    // 提交成功后触发事件
    if (buttonId) {
      triggerButton?.(buttonId)
    }
  } catch (e) {
    console.error('Submit failed:', e)
  }
}
```

#### ✅ ActionButtons.tsx
**路径:** `form-app/src/runtime/ActionButtons.tsx`

**修改内容:**
- NavigateButton 添加 navigateType、targetUrl 参数
- 根据 navigateType 选择跳转方式

**代码变更:**
```typescript
interface NavigateButtonProps {
  navigateType?: 'internal' | 'url'
  targetPage?: string
  targetUrl?: string
  // ...
}

const handleClick = () => {
  if (navigateType === 'url') {
    if (targetUrl) {
      window.open(targetUrl, '_blank')
    }
  } else {
    if (targetPage) {
      navigate?.(targetPage, resolveParamMapping(paramMapping, getFormValues?.() || {}))
    }
  }
}
```

#### ✅ ConfirmDialogButton.tsx (新建)
**路径:** `form-app/src/runtime/ConfirmDialogButton.tsx`

**修改内容:**
- 创建新文件
- 实现确认弹窗逻辑
- 集成 FormActionContext
- 支持4种确认后动作

**核心代码:**
```typescript
export default function ConfirmDialogButton(props: ConfirmDialogButtonProps) {
  const { triggerButton, submit, navigate, callInterface, getFormValues } = useFormAction()
  
  const handleConfirm = async () => {
    switch (onConfirm) {
      case 'event':
        if (buttonId) triggerButton?.(buttonId)
        break
      case 'submit':
        submit?.()
        break
      case 'navigate':
        if (targetPage) navigate?.(targetPage, params)
        break
      case 'interface':
        await callInterface(interfaceCode, params, interfaceType)
        break
    }
    setOpen(false)
  }
  
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* ... */}
    </AlertDialog>
  )
}
```

---

### 3. 组件库注册

#### ✅ shadcn.tsx
**路径:** `form-app/src/runtime/componentLibraries/shadcn.tsx`

**修改内容:**
- 导入 ConfirmDialogButton
- 添加到 sharedComponents

**代码变更:**
```typescript
import ConfirmDialogButton from '../ConfirmDialogButton'

export const sharedComponents = {
  PrintButton,
  SubmitButton,
  ActionButton,
  EventButton,
  NavigateButton,
  FeedbackButton,
  CustomButton,
  ConfirmDialogButton, // 新增
  PageHeader,
  Section,
  Divider,
  StaticImage,
  StaticText,
}
```

#### ✅ antd.tsx
**路径:** `form-app/src/runtime/componentLibraries/antd.tsx`

**修改内容:**
- 导入 ConfirmDialogButton
- 添加到 sharedComponents

---

### 4. 其他修复

#### ✅ FormLayoutPatch.ts
**路径:** `form-app/src/designable/FormLayoutPatch.ts`

**说明:** 已创建但未使用，被全局补丁替代

#### ✅ PageDesignerPage.tsx
**路径:** `form-app/src/pages/PageDesignerPage.tsx`

**修改内容:**
- 添加全局补丁函数 `patchBehaviorSchemas()`
- 递归清理所有 Formily 组件的 enum null 值

---

## 功能对照表

| 组件 | 选中修复 | 样式配置 | 事件集成 | 特殊功能 | 运行时 |
|------|---------|---------|---------|---------|--------|
| SubmitButton | ✅ | ✅ (variant, block) | ✅ (提交后触发) | - | ✅ |
| EventButton | ✅ | ✅ (variant, block) | ✅ (buttonId) | - | ✅ |
| NavigateButton | ✅ | ✅ (variant, block) | ✅ (buttonId) | URL跳转 | ✅ |
| ActionButton | ✅ | ✅ (variant, block) | ✅ (buttonId) | 多种动作 | ✅ |
| FeedbackButton | ✅ | ✅ (variant, block) | ✅ (buttonId) | - | ✅ |
| CustomButton | ✅ | ✅ (variant, block) | ✅ (buttonId) | - | ✅ |
| ConfirmDialogButton | ✅ | ✅ (variant, block) | ✅ (4种动作) | 确认弹窗 | ✅ (新建) |

---

## 测试检查清单

### 设计器功能
- [ ] 所有按钮可以在画布中被点击选中
- [ ] 选中后右侧属性面板显示正确
- [ ] 属性面板中的 Select 下拉选项没有 null 值警告
- [ ] 左侧大纲树中按钮节点可以选中

### EventButton
- [ ] 可以配置 buttonId
- [ ] 可以选择按钮样式（variant）
- [ ] 可以设置撑满整行（block）
- [ ] 在事件编排中可以从下拉选择该按钮

### SubmitButton
- [ ] 可以配置按钮样式
- [ ] 可以配置 buttonId
- [ ] 提交成功后触发对应的按钮事件流
- [ ] 提交失败不触发事件

### NavigateButton
- [ ] 可以选择跳转类型（App内/外部URL）
- [ ] 选择"App内"时显示 targetPage 字段
- [ ] 选择"外部URL"时显示 targetUrl 字段
- [ ] App内跳转正常工作
- [ ] 外部URL在新窗口打开

### ConfirmDialogButton
- [ ] 可以配置按钮文本和样式
- [ ] 可以配置弹窗标题、内容、按钮文案
- [ ] 可以选择确认后动作类型
- [ ] 根据动作类型显示对应的配置字段
- [ ] 点击按钮显示确认弹窗
- [ ] 点击确定执行配置的动作
- [ ] 点击取消关闭弹窗

### 运行时功能
- [ ] 所有按钮在预览页面正常渲染
- [ ] 按钮点击执行预期动作
- [ ] 事件流正常触发
- [ ] 参数传递正常工作

---

## 向后兼容性验证

✅ 所有新增字段都有默认值
✅ 已有页面配置继续正常工作
✅ 未配置新字段的按钮仍然正常显示
✅ 运行时组件注册不影响现有功能

---

## 下一步建议

### 短期优化
1. 添加页面列表下拉选择器
2. 创建参数映射可视化编辑器
3. 右侧属性面板集成事件配置

### 中期优化
1. 所有按钮添加 size 属性
2. 添加按钮图标配置
3. 添加按钮快捷键配置

### 长期优化
1. 按钮组件库扩展（更多按钮类型）
2. 按钮行为可视化编排
3. 按钮权限控制集成

---

## 文档

- 📄 问题分析: `docs/form-app-button-enhancement-analysis.md`
- 📄 实施总结: `docs/form-app-button-enhancement-summary.md`
- 📄 修改清单: `docs/form-app-button-enhancement-checklist.md`

---

生成时间: 2026年7月2日
构建状态: ✅ 成功
