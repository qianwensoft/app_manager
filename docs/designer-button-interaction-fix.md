# 设计器编辑模式下按钮交互修复

## 问题描述

在设计器编辑模式下，点击 ConfirmDialogButton（确认弹窗按钮）时会弹出确认对话框，这不合理。

**期望行为：**
- 编辑模式：点击按钮只是选中组件，不应触发按钮功能
- 预览/运行模式：点击按钮触发实际功能（弹窗、提交、跳转等）

**实际行为：**
- ✅ 其他按钮正常（只选中，不触发）
- ❌ ConfirmDialogButton 会弹出确认对话框

## 根本原因

设计态组件和运行态组件的职责混淆：

### 设计态组件 (Designable)
**职责：** 仅用于设计器中的**可视化预览**
- 只渲染组件外观
- 不包含交互逻辑
- 不应有状态管理
- 不应响应点击事件（除了选中）

### 运行态组件 (Runtime)
**职责：** 在实际页面中**执行业务逻辑**
- 完整的交互功能
- 状态管理
- 事件处理
- 数据绑定

### 问题代码

之前的 `ConfirmDialogButton` 设计态组件包含了完整的弹窗逻辑：

```typescript
// ❌ 错误：设计态包含了运行时逻辑
export const ConfirmDialogButton: DnFC<any> = (props) => {
  const [open, setOpen] = useState(false) // ❌ 状态管理
  // ...
  return (
    <div>
      <Button onClick={() => setOpen(true)}> {/* ❌ 点击事件 */}
        {text}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}> {/* ❌ 实际弹窗 */}
        {/* ... */}
      </AlertDialog>
    </div>
  )
}
```

这导致在设计器中点击按钮时，`onClick` 事件被触发，弹窗会打开。

## 解决方案

### 修改文件
`form-app/src/designable/ConfirmDialogButton.tsx`

### 修改内容

设计态组件只渲染按钮外观，移除所有交互逻辑：

```typescript
// ✅ 正确：设计态只渲染外观
export const ConfirmDialogButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  const text = p.text || '确认操作'
  const variant = p.variant || 'default'

  // 设计态只渲染按钮外观，不包含弹窗逻辑（避免在编辑时触发弹窗）
  return (
    <div data-content-editable="x-component-props">
      <Button
        type="button"
        variant={variant as any}
        className={p.block ? 'w-full' : ''}
      >
        {text}
      </Button>
    </div>
  )
}
```

**关键改动：**
1. ❌ 移除 `useState` - 不需要状态
2. ❌ 移除 `AlertDialog` 组件 - 弹窗只在运行时
3. ❌ 移除 `onClick` 处理 - 点击由设计器框架处理
4. ✅ 保留 `variant` 和 `block` - 用于预览外观
5. ✅ 保留 `data-content-editable` - 用于选中

### 完整的弹窗逻辑在运行态

运行态组件 `form-app/src/runtime/ConfirmDialogButton.tsx` 包含完整的弹窗逻辑，这部分不需要修改，因为运行时需要实际的交互功能。

## 设计原则

### 设计态组件（src/designable/）应该：
- ✅ 只渲染静态预览
- ✅ 根据 props 显示不同外观
- ✅ 使用 `data-content-editable` 支持选中
- ❌ 不包含 `useState`、`useEffect` 等 Hook
- ❌ 不绑定 `onClick`、`onChange` 等事件
- ❌ 不调用 API 或触发业务逻辑

### 运行态组件（src/runtime/）应该：
- ✅ 实现完整的交互逻辑
- ✅ 状态管理和事件处理
- ✅ 集成表单上下文（useFormAction 等）
- ✅ 调用 API 和执行业务逻辑

## 其他按钮组件检查

让我们确认其他按钮组件是否也遵循了这个原则：

### ✅ SubmitButton
```typescript
// 设计态：只渲染按钮
<Button type="button">{text}</Button>
// ✅ 没有 onClick，没有 submit 逻辑
```

### ✅ EventButton
```typescript
// 设计态：只渲染按钮
<Button type="button">{text}</Button>
// ✅ 没有 onClick，没有 triggerButton 逻辑
```

### ✅ NavigateButton
```typescript
// 设计态：只渲染按钮
<Button type="button">{text}</Button>
// ✅ 没有 onClick，没有 navigate 逻辑
```

### ✅ ActionButton
```typescript
// 设计态：只渲染按钮
<Button type="button">{text}</Button>
// ✅ 没有 onClick，没有动作逻辑
```

所有其他按钮组件都正确地将设计态和运行态分离了。

## 验证步骤

1. **刷新页面** `http://192.168.1.127:3000/form-app/page-designer/10`

2. **测试 ConfirmDialogButton：**
   - 从左侧组件列表拖入"确认弹窗按钮"
   - 点击画布中的按钮
   - ✅ 应该只选中按钮，显示蓝色边框
   - ✅ 右侧属性面板显示按钮配置
   - ❌ 不应该弹出确认对话框

3. **配置按钮：**
   - 在"属性"选项卡修改按钮文本
   - 修改弹窗标题、内容
   - 选择确认后动作类型
   - ✅ 配置过程中不应触发弹窗

4. **测试其他按钮：**
   - 点击其他按钮（SubmitButton、EventButton 等）
   - ✅ 确认都只是选中，不触发实际功能

5. **预览模式测试：**
   - 点击顶部"预览-桌面"或"预览-移动"按钮
   - 在预览页面点击 ConfirmDialogButton
   - ✅ 应该弹出确认对话框
   - ✅ 点击"确定"执行配置的动作
   - ✅ 点击"取消"关闭弹窗

## 构建验证

```bash
✅ TypeScript 编译: 通过
✅ Vite 构建: 成功
✅ 产物大小: 3.59 MB (gzip: 1.04 MB)
```

## 总结

### 修复内容
- 移除 ConfirmDialogButton 设计态组件中的弹窗逻辑
- 确保设计态只负责外观预览
- 保持运行态的完整功能不变

### 影响范围
- 仅影响设计器编辑体验
- 不影响预览和运行时功能
- 向后兼容，无需数据迁移

### 设计原则
- 设计态 = 外观预览
- 运行态 = 业务逻辑
- 清晰的职责分离

---

修复时间: 2026年7月2日
验证状态: ✅ 构建成功
