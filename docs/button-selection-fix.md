# 按钮选中问题修复

## 问题描述
在 form-app 页面设计器中，点击按钮组件时，选中状态停留在外层 Form，按钮本身无法被选中。

## 根本原因
设计态组件使用了 `<div data-content-editable="x-component-props">` 包装层，这个包装层干扰了 Formily Designable 的选择逻辑。

## 解决方案
移除所有按钮组件的包装 div，直接渲染 Button 元素。参考 ScanTrigger 等可正常选中的组件实现模式。

### 修改前
```tsx
export const CustomButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <div data-content-editable="x-component-props">
      <Button variant={p.variant || 'default'}>
        {p.text || '按钮'}
      </Button>
    </div>
  )
}
```

### 修改后
```tsx
export const CustomButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button
      variant={p.variant || 'default'}
      className={p.block ? 'w-full' : ''}
      type="button"
    >
      {p.text || '按钮'}
    </Button>
  )
}
```

## 修改的文件
1. `form-app/src/designable/Button.tsx` - CustomButton
2. `form-app/src/designable/SubmitButton.tsx` - SubmitButton
3. `form-app/src/designable/ActionButtons.tsx`
   - ActionButton
   - EventButton
   - NavigateButton
   - FeedbackButton
4. `form-app/src/designable/ConfirmDialogButton.tsx` - ConfirmDialogButton

## 设计原则
**设计态组件应该直接渲染目标元素，不需要额外的包装层。**

- ✅ 直接渲染组件元素
- ✅ 根据 props 展示不同样式
- ❌ 不添加无关的包装层
- ❌ 不使用 data-content-editable（除非用于特定的可编辑区域）

## 验证结果
✅ 构建成功
✅ 所有按钮组件可以正常选中
✅ 右侧属性面板显示按钮配置
✅ 事件面板显示按钮事件绑定
✅ 编辑模式下不触发按钮功能

## 参考
参考已有的可正常选中的组件实现：
- `ScanTrigger.tsx` - 扫码触发按钮
- `CardList.tsx` - 卡片列表组件
- `TableList.tsx` - 表格列表组件
