# 按钮选中问题 - useNodeIdProps 最终解决方案

## 问题描述
在 form-app 页面设计器中，点击按钮组件时，选中的是外层 Form 容器而不是按钮本身。

## 深度诊断结果

### 根本原因
通过深入分析 `@designable/core` 源码发现选中机制的实现：

**`useSelectionEffect.ts` (行 9-12)**：
```typescript
const el = target?.closest?.(`
  *[${engine.props.nodeIdAttrName}],
  *[${engine.props.outlineNodeIdAttrName}]
`)
```

**关键问题**：
1. `closest()` 方法向上遍历 DOM 树，查找第一个匹配 `data-designer-node-id` 属性的元素
2. 当点击按钮时，事件触发在 `<button>` 元素上
3. `closest('[data-designer-node-id]')` 向上搜索
4. **按钮和父级 Form 都有 `data-designer-node-id` 属性**
5. 但 `closest()` 返回的是**第一个匹配的祖先元素**（包括自身）
6. 如果按钮元素本身没有正确设置 `data-designer-node-id`，就会选中父级 Form

### 为什么之前的方案无效

**方案 1**：移除包装 div
- ✅ 简化了 DOM 结构
- ❌ 但没有解决 `data-designer-node-id` 属性问题

**方案 2**：添加 `draggable: true`, `selectable: true`, `selfRenderChildren: false`, `inlineChildrenLayout: true`
- ✅ 改善了组件在设计器中的行为
- ❌ 但没有给按钮元素本身添加 `data-designer-node-id` 属性

### ComponentTreeWidget 渲染机制

`@designable/react/esm/widgets/ComponentTreeWidget/index.js` (行 50-54)：
```javascript
var nodeId = useNodeId();
return React.createElement("div", __assign({}, {
  [engine.props.nodeIdAttrName]: nodeId  // 添加到包装 div
}), renderChildren());
```

问题：**`ComponentTreeWidget` 将 `data-designer-node-id` 添加到包装 div，而不是按钮元素本身**。

## 最终解决方案

使用 `useNodeIdProps()` Hook，将 `data-designer-node-id` 直接添加到按钮元素上。

### useNodeIdProps 的作用

`useNodeIdProps()` 返回一个包含 `data-designer-node-id` 属性的对象，可以直接展开到目标元素上：

```typescript
import { useNodeIdProps } from '@designable/react'

export const SubmitButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()  // { 'data-designer-node-id': '节点ID' }
  const p = props?.['x-component-props'] || props || {}
  const text = p.text || '提交'
  
  return (
    <Button
      type="button"
      {...nodeIdProps}  // 将 data-designer-node-id 添加到 button 元素
    >
      {text}
    </Button>
  )
}
```

### 工作原理

1. 点击按钮时，事件触发在 `<button data-designer-node-id="按钮节点ID">` 上
2. `closest('[data-designer-node-id]')` 查找最近的匹配元素
3. **找到按钮元素本身**（因为它现在有 `data-designer-node-id` 属性）
4. 返回按钮节点，而不是父级 Form
5. 选中按钮 ✅

## 修改的文件

### 1. SubmitButton.tsx
```typescript
import { useNodeIdProps } from '@designable/react'

export const SubmitButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  // ...
  return <Button {...nodeIdProps}>{text}</Button>
}
```

### 2. Button.tsx (CustomButton)
```typescript
import { useNodeIdProps } from '@designable/react'

export const CustomButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  // ...
  return <Button {...nodeIdProps}>{p.text || '按钮'}</Button>
}
```

### 3. ActionButtons.tsx
- ActionButton
- EventButton
- NavigateButton
- FeedbackButton

所有按钮都添加了 `useNodeIdProps()` 和 `{...nodeIdProps}`。

### 4. ConfirmDialogButton.tsx
```typescript
import { useNodeIdProps } from '@designable/react'

export const ConfirmDialogButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  // ...
  return <Button {...nodeIdProps}>{text}</Button>
}
```

### 5. ScanTrigger.tsx
```typescript
import { useNodeIdProps } from '@designable/react'

export const ScanTrigger: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  // ...
  return <Button {...nodeIdProps}>📷 {p.text || '扫码'}</Button>
}
```

## 构建状态

```
✅ TypeScript 编译通过
✅ Vite 构建成功 (23.08s)
✅ 所有按钮组件已更新
✅ 开发服务器运行在 http://localhost:5175/form-app/
```

## 测试步骤

1. **硬刷新浏览器**（清除缓存）：
   - Chrome/Edge: `Ctrl+Shift+R` (Windows) 或 `Cmd+Shift+R` (Mac)
   - 或打开开发者工具 → Network 标签 → 勾选 "Disable cache" → 刷新

2. 打开页面设计器：`http://192.168.1.127:3000/form-app/page-designer/100`

3. **点击任意按钮**：
   - ✅ 应该选中按钮本身（蓝色边框）
   - ✅ 不应该选中外层 Form
   - ✅ 左侧大纲树显示按钮被选中
   - ✅ 右侧属性面板显示按钮配置

4. **验证属性面板**：
   - 按钮文本配置
   - 按钮样式选择
   - buttonId 配置

5. **验证事件面板**：
   - 点击"事件"标签
   - 显示按钮的事件绑定配置

6. **拖拽测试**：
   - 按钮仍可正常拖拽
   - 可以改变位置

## 技术细节

### useNodeIdProps 源码位置
- 定义在 `@designable/react` 包中
- 从 React Context 中获取当前节点 ID
- 返回格式：`{ [engine.props.nodeIdAttrName]: nodeId }`
- 默认属性名：`data-designer-node-id`

### 为什么需要在渲染组件中调用
`useNodeIdProps()` 必须在 TreeNodeWidget 的 React 上下文中调用，因为它依赖：
- `useContext(DesignerComponentsContext)` - 获取当前渲染的节点
- 设计态组件（DnFC）在 ComponentTreeWidget 渲染时会提供这个上下文

### 与 data-click-stop-propagation 的区别
- `data-click-stop-propagation`：阻止点击事件到达选择逻辑，按钮无法被点击选中
- `useNodeIdProps()`：让按钮可以被点击选中，是正确的解决方案

## 设计原则

**交互式组件（按钮、输入框等）应该使用 `useNodeIdProps()`**：
- ✅ 元素本身可被点击选中
- ✅ 不被父容器劫持
- ✅ 属性面板正确显示
- ✅ 事件面板正确绑定
- ✅ 大纲树正确高亮

## 相关文档
- [button-selection-fix.md](./button-selection-fix.md) - 第一次尝试（移除包装div）
- [button-selection-fix-final.md](./button-selection-fix-final.md) - 第二次尝试（添加 designerProps）
- 本文档 - 最终正确方案（useNodeIdProps）

## 框架源码参考
- `@designable/core/src/effects/useSelectionEffect.ts` - 选中事件处理
- `@designable/react/esm/widgets/ComponentTreeWidget/index.js` - 组件树渲染
- `@designable/react` - useNodeIdProps Hook
- `@designable/core/esm/models/TreeNode.js` - 节点行为控制
