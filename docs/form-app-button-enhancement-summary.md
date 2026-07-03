# Form-App 按钮组件增强实施总结

## 完成时间
2026年7月（基于用户反馈）

## 实施内容

### ✅ P0-1: EventButton 添加完整配置
**问题：** EventButton 缺少 buttonId 配置和样式选项

**解决方案：**
- 添加 `buttonId` 字段到设计态配置
- 添加完整的按钮样式配置（variant、block）
- 更新 designerLocales 确保中文标签正确显示

**修改文件：**
- `form-app/src/designable/ActionButtons.tsx`
  - 更新 `EventButton.Behavior.designerProps.propsSchema`
  - 添加 buttonId 字段，支持自动生成或手动输入

---

### ✅ P0-2: ConfirmDialogButton 运行时实现
**问题：** ConfirmDialogButton 只有设计态，缺少运行时组件，完全不可用

**解决方案：**
1. **创建运行时组件**
   - 新建 `form-app/src/runtime/ConfirmDialogButton.tsx`
   - 实现确认弹窗功能
   - 集成事件系统（triggerButton）
   - 支持4种确认后动作：
     - `event`: 触发事件系统
     - `submit`: 提交表单
     - `navigate`: 跳转页面
     - `interface`: 调用接口

2. **增强设计态配置**
   - 更新 `form-app/src/designable/ConfirmDialogButton.tsx`
   - 添加完整的动作配置属性：
     - `onConfirm`: 确认后动作类型（下拉选择）
     - `buttonId`: 触发事件的按钮ID（当 onConfirm=event）
     - `targetPage`: 跳转目标（当 onConfirm=navigate）
     - `interfaceType/interfaceCode`: 接口配置（当 onConfirm=interface）
     - `successText`: 接口调用成功提示
   - 使用 `x-reactions` 实现条件显示（根据 onConfirm 值动态显示对应字段）
   - 添加 `variant` 和 `block` 样式配置
   - 添加 `droppable: false` 配置

3. **注册到运行时组件库**
   - 导入到 `form-app/src/runtime/componentLibraries/shadcn.tsx`
   - 导入到 `form-app/src/runtime/componentLibraries/antd.tsx`
   - 添加到 `sharedComponents` 对象

**修改文件：**
- `form-app/src/runtime/ConfirmDialogButton.tsx` (新建)
- `form-app/src/designable/ConfirmDialogButton.tsx`
- `form-app/src/runtime/componentLibraries/shadcn.tsx`
- `form-app/src/runtime/componentLibraries/antd.tsx`

---

### ✅ P1-1: SubmitButton 事件系统集成
**问题：** 提交按钮提交成功后无法触发工作流/事件流

**解决方案：**
1. **设计态增强**
   - 添加 `buttonId` 字段配置
   - 添加 `variant` 和 `block` 样式配置
   - 更新 propsSchema 支持完整的按钮属性

2. **运行时增强**
   - 更新 `form-app/src/runtime/SubmitButton.tsx`
   - 提交成功后，如果配置了 `buttonId`，自动触发对应的按钮事件流
   - 提交失败不触发事件
   - 集成 `useFormAction` 获取 `triggerButton` 方法

**使用场景：**
```typescript
// 设计态配置
{
  'x-component': 'SubmitButton',
  'x-component-props': {
    text: '提交',
    variant: 'default',
    buttonId: 'submit_success_btn'
  }
}

// 事件编排
{
  source: 'button',
  button_id: 'submit_success_btn',
  actions: [
    { type: 'navigate', target: 'success_page' },
    { type: 'message', text: '提交成功' }
  ]
}
```

**修改文件：**
- `form-app/src/designable/SubmitButton.tsx`
- `form-app/src/runtime/SubmitButton.tsx`

---

### ✅ P1-2: NavigateButton 页面选择和URL支持
**问题：** 无法选择App内页面，无法跳转到外部URL

**解决方案：**
1. **设计态增强**
   - 添加 `navigateType` 字段：
     - `internal`: App内页面跳转（默认）
     - `url`: 外部URL跳转
   - 添加 `targetPage` 字段（当 navigateType=internal）
   - 添加 `targetUrl` 字段（当 navigateType=url）
   - 使用 `x-reactions` 实现条件显示

2. **运行时增强**
   - 更新 `form-app/src/runtime/ActionButtons.tsx`
   - 根据 `navigateType` 选择跳转方式：
     - `internal`: 调用 `navigate(targetPage, params)`
     - `url`: 调用 `window.open(targetUrl, '_blank')`

**使用场景：**
```typescript
// App内跳转
{
  navigateType: 'internal',
  targetPage: 'detail',
  paramMapping: { id: '$form.device_id' }
}

// 外部URL跳转
{
  navigateType: 'url',
  targetUrl: 'https://example.com/help'
}
```

**修改文件：**
- `form-app/src/designable/ActionButtons.tsx` (NavigateButton.Behavior)
- `form-app/src/runtime/ActionButtons.tsx` (NavigateButton)

---

## 技术要点

### 1. 条件字段显示（x-reactions）
使用 Formily 的 `x-reactions` 机制实现动态表单：
```typescript
{
  'x-reactions': {
    dependencies: ['.onConfirm'],
    fulfill: {
      state: {
        visible: '{{$deps[0] === "event"}}'
      }
    }
  }
}
```

### 2. 事件系统集成
所有按钮通过 `useFormAction()` 获取事件触发能力：
```typescript
const { triggerButton } = useFormAction()
// 触发事件
triggerButton?.(buttonId)
```

### 3. 运行时组件注册
组件必须在两个组件库中注册：
- `shadcn.tsx` - 移动端使用
- `antd.tsx` - 桌面端使用

通过 `sharedComponents` 对象统一导出业务组件。

### 4. 设计态与运行态分离
- **设计态** (`src/designable/`): 提供可视化配置界面
- **运行态** (`src/runtime/`): 实际执行业务逻辑
- **componentMap**: 设计态组件注册（PageDesignerPage.tsx）
- **shadcnComponents/antdComponents**: 运行态组件注册

---

## 测试建议

### 1. ConfirmDialogButton
1. 拖入确认弹窗按钮到画布
2. 配置按钮文本、弹窗标题和内容
3. 选择确认后动作：
   - 事件：配置 buttonId，在事件编排中创建对应事件流
   - 提交：直接提交表单
   - 跳转：配置目标页面
   - 接口：配置接口调用
4. 预览页面，点击按钮触发弹窗，点击确定验证动作执行

### 2. SubmitButton 事件触发
1. 配置提交按钮的 buttonId
2. 在事件编排中创建以该 buttonId 为源的事件流
3. 配置事件动作（如跳转到成功页面）
4. 提交表单，验证提交成功后事件流是否执行

### 3. NavigateButton URL跳转
1. 拖入跳转按钮
2. 选择跳转类型为"外部URL"
3. 输入目标URL（如 https://www.baidu.com）
4. 预览页面，点击按钮验证是否打开新窗口

### 4. EventButton 完整配置
1. 拖入事件触发按钮
2. 配置 buttonId（或自动生成）
3. 配置按钮样式（variant、block）
4. 在事件编排中选择该按钮，创建事件流
5. 预览页面验证事件触发

---

## 遗留问题和后续优化

### 1. 页面列表下拉选择（未实现）
**当前状态：** NavigateButton 的 targetPage 仍然是手动输入

**未来优化：**
- 在 PageDesignerPage 中获取当前 App 的所有页面
- 将页面列表注入到表单 values 中
- 修改 targetPage 字段为 Select 组件，dataSource 绑定到页面列表
- 需要 API 支持：`GET /api/form-app/pages?form_app_id=xxx`

### 2. 参数映射可视化编辑器（未实现）
**当前状态：** paramMapping 是直接编辑 JSON

**未来优化：**
- 创建自定义 KeyValueEditor 组件
- 左侧 key 输入框，右侧 value 支持：
  - 字面量输入
  - 表单字段下拉选择（自动添加 $form. 前缀）
- 添加/删除行按钮

### 3. 按钮右侧属性面板集成事件配置（未实现）
**当前状态：** 配置按钮后需要手动切换到事件编排

**未来优化：**
- 在右侧属性面板添加"事件"选项卡
- 显示该按钮绑定的所有事件流
- 提供"新建事件"按钮，快速创建事件
- 提供"跳转到事件编排"按钮

### 4. 所有按钮的 size 属性（未实现）
**当前状态：** 按钮大小固定

**未来优化：**
- 添加 size 字段：'default' | 'sm' | 'lg'
- 映射到 shadcn Button 的 size 属性

---

## 影响范围

### 新增文件
- `form-app/src/runtime/ConfirmDialogButton.tsx`
- `docs/form-app-button-enhancement-analysis.md`
- `docs/form-app-button-enhancement-summary.md`

### 修改文件
- `form-app/src/designable/ActionButtons.tsx`
- `form-app/src/designable/SubmitButton.tsx`
- `form-app/src/designable/ConfirmDialogButton.tsx`
- `form-app/src/runtime/SubmitButton.tsx`
- `form-app/src/runtime/ActionButtons.tsx`
- `form-app/src/runtime/componentLibraries/shadcn.tsx`
- `form-app/src/runtime/componentLibraries/antd.tsx`

### 向后兼容性
✅ 所有修改向后兼容
- 新增字段都有默认值
- 已有配置继续正常工作
- 运行时组件注册不影响现有页面

---

## 总结

本次增强完成了4个关键问题的解决：
1. ✅ 提交按钮支持提交后触发事件流
2. ✅ 事件按钮完整配置（buttonId、样式）
3. ✅ 跳转按钮支持外部URL
4. ✅ 确认弹窗按钮完整实现（设计态+运行态+事件集成）

所有按钮现在都支持：
- 完整的样式配置（variant、block）
- 事件系统集成（buttonId）
- 条件动态表单（x-reactions）
- 多端组件库注册（shadcn + antd）

用户体验显著提升：
- 按钮功能更完整
- 配置更直观
- 与事件系统深度集成
- 支持更多业务场景
