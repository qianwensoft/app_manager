# 按钮选中问题 - 最终修复方案

## 问题描述
在 form-app 页面设计器中，点击按钮组件时，选中的是外层 Form 容器而不是按钮本身。

## 根本原因

通过深入分析 Formily Designable 框架源码，发现选中机制的核心逻辑：

### 1. 选中事件处理
位于 `@designable/core/esm/effects/useSelectionEffect.js`：
```javascript
var el = target?.closest?.call(target, `
  *[${engine.props.nodeIdAttrName}],
  *[${engine.props.outlineNodeIdAttrName}]
`);
```
`closest()` 方法向上遍历 DOM 树寻找带有 `data-designer-node-id` 属性的元素，可能误选父级容器。

### 2. 组件渲染边界
位于 `@designable/react/esm/widgets/ComponentTreeWidget/index.js`：
```javascript
var renderChildren = function () {
  if (node?.designerProps?.selfRenderChildren) return [];
  return node?.children?.map(function (child) {
    return React.createElement(TreeNodeWidget, { key: child.id, node: child });
  });
};
```
如果没有明确标记 `selfRenderChildren`，框架会递归渲染子节点。

### 3. 容器接收逻辑
位于 `@designable/core/esm/models/TreeNode.js`：
```javascript
TreeNode.prototype.allowAppend = function (nodes) {
  if (!this.designerProps?.droppable) return false;
  // ...
};
```

## 解决方案

在所有按钮组件的 `Behavior.designerProps` 中添加以下配置：

```typescript
designerProps: {
  draggable: true,              // 可拖拽
  droppable: false,             // 不接收子组件
  selectable: true,             // 可选中（优先级高于父容器）
  selfRenderChildren: false,    // 不需要框架递归渲染子节点
  inlineChildrenLayout: true,   // 标记为内联组件，非布局容器
  propsSchema: { /* ... */ }
}
```

### 配置说明
- **`draggable: true`** - 允许拖拽移动
- **`droppable: false`** - 阻止接收其他组件作为子节点
- **`selectable: true`** - 明确可选中，提高选择优先级
- **`selfRenderChildren: false`** - 告诉框架这是"叶子节点"，不参与子节点递归
- **`inlineChildrenLayout: true`** - 标记为内联元素，避免被当作布局容器

## 修改的文件

### 1. SubmitButton
`form-app/src/designable/SubmitButton.tsx`

### 2. CustomButton
`form-app/src/designable/Button.tsx`

### 3. ConfirmDialogButton
`form-app/src/designable/ConfirmDialogButton.tsx`

### 4. ScanTrigger
`form-app/src/designable/ScanTrigger.tsx`

### 5. ActionButtons
`form-app/src/designable/ActionButtons.tsx`
- ActionButton
- EventButton
- NavigateButton
- FeedbackButton

## 测试验证

开发服务器已重启在 `http://localhost:5175/form-app/`

### 测试步骤
1. 打开页面设计器：`http://192.168.1.127:3000/form-app/page-designer/100`
2. **基础选中测试**
   - 点击任意按钮组件
   - 应该看到按钮本身被选中（蓝色边框）
   - 不应该选中外层 Form 或其他容器
3. **属性面板测试**
   - 选中按钮后
   - 右侧属性面板应显示按钮的配置项（文本、样式、buttonId等）
4. **事件面板测试**
   - 选中按钮后
   - 点击右侧"事件"标签
   - 应显示按钮的事件绑定配置
5. **拖拽测试**
   - 确认按钮仍可正常拖拽
   - 可以改变位置
6. **嵌套容器测试**
   - 将按钮放入 Card、Section 等容器中
   - 点击按钮应仍然选中按钮本身

## 设计原则

**按钮类组件应该是"叶子节点"**：
- ✅ 可选中、可拖拽
- ✅ 明确的选择边界（不被父容器劫持）
- ✅ 不接收子组件
- ✅ 自己处理渲染内容
- ❌ 不参与布局容器逻辑
- ❌ 不递归渲染子节点

## 框架源码参考

只读参考（理解原理）：
- `node_modules/@designable/core/esm/effects/useSelectionEffect.js` - 选中事件
- `node_modules/@designable/react/esm/widgets/ComponentTreeWidget/index.js` - 组件树渲染
- `node_modules/@designable/core/esm/models/TreeNode.js` - 节点行为

## 相关文档
- [button-selection-fix.md](./button-selection-fix.md) - 第一次尝试（移除包装div）
- [designer-button-interaction-fix.md](./designer-button-interaction-fix.md) - 修复编辑模式弹窗问题
