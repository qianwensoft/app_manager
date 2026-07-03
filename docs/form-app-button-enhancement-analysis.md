# Form-App 按钮组件功能增强分析

## 问题分析

### 1. 提交按钮缺少提交后工作流处理

**当前状态：**
- SubmitButton 直接通过外部设置接口进行提交
- 提交成功后没有工作流/事件系统介入
- 无法配置提交后的后续动作（如跳转、提示、触发事件等）

**影响：**
- 提交后的业务逻辑硬编码在提交接口中
- 缺乏灵活性，无法配置提交后的多步骤流程
- 无法与事件系统集成

**解决方案：**
1. 为 SubmitButton 添加 `buttonId` 属性
2. 允许在事件系统中配置 `source=button` 且 `button_id=提交按钮ID` 的事件流
3. 提交成功后触发该事件流（类似 EventButton）
4. 或者，为 SubmitButton 添加 `onSuccess` 配置，指定提交成功后的动作链

**推荐方案：**
- 方案A：统一使用事件系统（推荐）
  - SubmitButton 添加 buttonId
  - 提交成功后触发 button 事件
  - 保持一致性，所有按钮都走事件系统
  
- 方案B：添加内置 onSuccess 配置
  - 在设计器属性中配置提交后动作
  - 无需通过事件编排
  - 更直观，但不够灵活

---

### 2. EventButton 缺少样式和事件绑定能力

**当前状态：**
- EventButton 设计态只有 `text` 和 `variant` 属性
- 缺少 `buttonId` 的可视化编辑
- 事件编排中需要手动输入 buttonId，容易出错
- 缺少从按钮直接跳转到事件配置的能力

**影响：**
- 用户体验差，需要记住 buttonId
- 容易输入错误的 buttonId 导致事件不触发
- 设计器和事件编排之间割裂

**解决方案：**
1. **设计器增强：**
   - 添加 `buttonId` 字段到 EventButton.Behavior.designerProps.propsSchema
   - 添加按钮样式完整配置（variant、block、size 等）
   - 添加"生成 ID"按钮，自动生成唯一 buttonId

2. **右侧属性面板集成：**
   - 在"事件"选项卡中显示绑定的事件流列表
   - 提供"新建事件"按钮，快速创建以该按钮为源的事件
   - 提供"跳转到事件编排"按钮

3. **事件编排增强：**
   - 按钮源下拉选择器，显示所有可用按钮（已实现）
   - 显示按钮文本和类型，方便识别（已实现）

**当前已有功能：**
- ✅ NodeEventBinder 已实现按钮 ID 编辑和事件流列表
- ✅ EventsConfigSection 已支持按钮下拉选择
- ❌ EventButton 设计态缺少 buttonId 配置

---

### 3. NavigateButton 无法选择本 App 页面或 URL

**当前状态：**
- NavigateButton 只有 `targetPage` 字段（字符串输入）
- 无法区分是 App 内页面还是外部 URL
- 无法从下拉列表选择本 App 的页面

**影响：**
- 用户需要手动输入页面 key，容易出错
- 无法跳转到外部 URL
- 缺少参数传递配置

**解决方案：**
1. **添加跳转类型选择：**
   ```typescript
   navigateType: 'internal' | 'external' | 'url'
   ```
   - `internal`: App 内页面跳转（从下拉选择）
   - `external`: 其他 App 跳转（输入 appCode + pageKey）
   - `url`: 外部 URL（输入完整 URL）

2. **动态加载页面列表：**
   - 在设计器中获取当前 App 的所有页面
   - 提供下拉选择器
   - 显示页面标题和 key

3. **参数传递配置：**
   - 添加参数映射表（key-value pairs）
   - 支持 `$form.字段` 引用表单值
   - 支持字面量

**实现细节：**
```typescript
// NavigateButton propsSchema
{
  navigateType: {
    type: 'string',
    enum: ['internal', 'external', 'url'],
    default: 'internal',
  },
  targetPage: {
    // 当 navigateType=internal 时，从下拉选择
    'x-reactions': {
      dependencies: ['.navigateType'],
      fulfill: {
        state: {
          visible: '{{$deps[0] === "internal"}}',
          dataSource: '{{$form.getValuesIn("__pages")}}', // 动态注入
        },
      },
    },
  },
  targetUrl: {
    // 当 navigateType=url 时输入
    'x-reactions': {
      dependencies: ['.navigateType'],
      fulfill: { state: { visible: '{{$deps[0] === "url"}}' } },
    },
  },
  paramMapping: {
    type: 'object',
    'x-component': 'KeyValueEditor', // 自定义组件
  },
}
```

---

### 4. ConfirmDialogButton 缺少事件系统关联

**当前状态：**
- ConfirmDialogButton 只是一个静态确认弹窗
- 点击"确定"后没有任何动作
- 无法配置确认后的业务逻辑
- 没有运行时组件实现

**影响：**
- 组件功能不完整，无法实际使用
- 缺少与业务逻辑的集成

**解决方案：**
1. **添加事件系统集成：**
   - 添加 `buttonId` 属性
   - 点击"确定"后触发 button 事件
   - 支持在事件编排中配置确认后的动作链

2. **添加快捷动作配置：**
   - `onConfirm`: 确认后的动作类型
     - `event`: 触发事件（使用 buttonId）
     - `submit`: 提交表单
     - `navigate`: 跳转页面
     - `interface`: 调用接口
   - 根据动作类型显示对应的配置字段

3. **创建运行时组件：**
   - 在 `src/runtime/` 创建 ConfirmDialogButton.tsx
   - 集成事件触发逻辑
   - 支持所有配置的动作类型

**实现示例：**
```typescript
// 设计态 propsSchema
{
  text: { type: 'string', title: '按钮文本' },
  title: { type: 'string', title: '弹窗标题' },
  content: { type: 'string', title: '弹窗内容' },
  buttonId: { type: 'string', title: '按钮ID' },
  onConfirm: {
    type: 'string',
    enum: ['event', 'submit', 'navigate', 'interface'],
    title: '确认后动作',
  },
  // 根据 onConfirm 显示对应配置
  targetPage: { /* 当 onConfirm=navigate */ },
  interfaceCode: { /* 当 onConfirm=interface */ },
}

// 运行时组件
export function ConfirmDialogButton(props) {
  const { triggerButton, submit, navigate, callInterface } = useFormAction()
  
  const handleConfirm = async () => {
    switch (props.onConfirm) {
      case 'event':
        if (props.buttonId) triggerButton(props.buttonId)
        break
      case 'submit':
        submit()
        break
      case 'navigate':
        if (props.targetPage) navigate(props.targetPage)
        break
      case 'interface':
        if (props.interfaceCode) await callInterface(props.interfaceCode, {})
        break
    }
  }
  
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>{props.text}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.content}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{props.cancelText}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            {props.okText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## 优先级建议

### P0 - 高优先级（核心功能缺失）
1. **EventButton 添加 buttonId 配置** - 组件基本功能不完整
2. **ConfirmDialogButton 运行时实现** - 组件完全不可用

### P1 - 中优先级（用户体验）
3. **NavigateButton 页面选择器** - 降低配置错误率
4. **SubmitButton 事件系统集成** - 增强提交后处理能力

### P2 - 低优先级（锦上添花）
5. 所有按钮的完整样式配置（size、icon 等）
6. 参数映射可视化编辑器

---

## 实施计划

### 阶段1：完善基础功能（1-2小时）
1. EventButton 添加 buttonId、variant、block 配置
2. ConfirmDialogButton 创建运行时组件
3. 所有按钮统一添加 variant、block 属性

### 阶段2：集成事件系统（2-3小时）
1. SubmitButton 添加 buttonId 和事件触发
2. ConfirmDialogButton 集成事件系统
3. 测试所有按钮的事件触发

### 阶段3：增强用户体验（2-3小时）
1. NavigateButton 添加类型选择和页面下拉
2. 动态加载当前 App 的页面列表
3. 参数映射编辑器（如果需要）

---

## 技术要点

### 1. 获取当前 App 的页面列表
```typescript
// 在 PageDesignerPage.tsx 中
const [appPages, setAppPages] = useState<Array<{label: string; value: string}>>([])

useEffect(() => {
  if (page?.form_app_id) {
    authed(`/api/form-app/pages?form_app_id=${page.form_app_id}`, 'GET')
      .then(res => {
        const pages = res.data || []
        setAppPages(pages.map((p: any) => ({
          value: p.page_key,
          label: `${p.title} (${p.page_key})`,
        })))
      })
  }
}, [page?.form_app_id])
```

### 2. 按钮 ID 自动生成
```typescript
const generateButtonId = (prefix: string) => {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`
}
```

### 3. 运行时组件注册
确保在 `componentMap` 中注册：
```typescript
const componentMap = {
  // ... 其他组件
  ConfirmDialogButton: ConfirmDialogButton,
}
```

并在 `src/runtime/` 中导出。

---

## 总结

这4个问题本质上都是**设计态配置不完整**和**与事件系统集成不足**导致的。通过：
1. 补全设计态属性配置
2. 统一事件系统集成方式
3. 增强用户体验（下拉选择、参数映射等）

可以大幅提升 form-app 按钮组件的可用性和灵活性。
