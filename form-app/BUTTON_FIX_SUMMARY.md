# 按钮组件属性面板修复总结

## 问题描述

用户反馈：form-app 的按钮组件在 Formily 设计器中，右侧属性配置面板无法显示，导致无法编辑按钮文本、样式等基本属性。

## 根本原因

按钮组件的 `propsSchema` 结构不符合 Formily 设计器的规范：

1. **错误的 schema 结构**：直接嵌套 `x-component-props`，而不是使用 `CollapseItem` 分组
2. **缺少 field-group**：没有提供标准的字段属性配置区域
3. **缺少 component-group**：组件属性没有使用折叠面板包装

参考 `@designable/formily-antd` 的标准实现，void 类型的组件（如按钮）需要使用 `createVoidFieldSchema` 创建符合规范的 schema。

## 修复方案

### 1. 创建标准的 void field schema 构建函数

```typescript
const createVoidFieldSchema = (component: any) => {
  return {
    type: 'object',
    properties: {
      'field-group': {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          name: { type: 'string', 'x-decorator': 'FormItem', 'x-component': 'Input' },
          title: { type: 'string', 'x-decorator': 'FormItem', 'x-component': 'Input' },
        },
      },
      'component-group': component && {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          'x-component-props': component,
        },
      },
    },
  }
}
```

### 2. 修复所有按钮组件

修复了以下组件的 `Behavior` 配置：

- ✅ **CustomButton** - 新增的通用按钮组件
- ✅ **ActionButton** - 多功能按钮（提交/事件/跳转/接口）
- ✅ **EventButton** - 事件触发按钮
- ✅ **NavigateButton** - 页面跳转按钮

### 3. 配置中文标签

通过 `designerLocales.settings` 字段配置属性面板的中文标签：

```typescript
designerLocales: {
  'zh-CN': {
    title: '通用按钮',
    settings: {
      'x-component-props': '按钮属性',
      'x-component-props.text': '按钮文本',
      'x-component-props.variant': '按钮样式',
      'x-component-props.block': '撑满整行',
      'x-component-props.buttonId': '按钮ID',
    },
  },
}
```

## 修改文件清单

### 新增文件
1. `src/designable/Button.tsx` - CustomButton 设计态组件
2. `src/runtime/Button.tsx` - CustomButton 运行时组件
3. `BUTTON_GUIDE.md` - 按钮使用指南
4. `BUTTON_FIX_SUMMARY.md` - 本文档

### 修改文件
1. `src/designable/ActionButtons.tsx` - 修复 ActionButton、EventButton、NavigateButton
2. `src/runtime/componentLibraries/shadcn.tsx` - 注册 CustomButton
3. `src/runtime/componentLibraries/antd.tsx` - 注册 CustomButton
4. `src/pages/PageDesignerPage.tsx` - 添加 CustomButton 到设计器

## 验证结果

### 构建状态
✅ TypeScript 编译通过  
✅ Vite 构建成功  
✅ 产物生成正常（3.5MB gzipped）

### 功能验证点

使用设计器时，选中按钮组件后，右侧属性面板应该显示：

**字段属性分组（可折叠）**
- name：组件名称
- title：标题

**按钮属性分组（可折叠）**
- 按钮文本：输入框
- 按钮样式：下拉选择（默认/次要/轮廓/幽灵/链接/危险）
- 撑满整行：开关
- 按钮ID：输入框

**ActionButton 额外属性**
- 动作类型：下拉选择（提交表单/触发事件/跳转页面/调用接口）
- 事件按钮ID（动作=触发事件时显示）
- 目标页面key（动作=跳转时显示）
- 接口类型、接口编码、成功提示（动作=调用接口时显示）

## 技术要点

1. **Formily 设计器规范**：void 类型组件必须使用 `CollapseItem` 包装属性组
2. **中文标签映射**：通过 `designerLocales.settings` 路径映射实现
3. **条件显示**：使用 `x-reactions` 实现属性的条件显示（如 ActionButton 的动作相关属性）
4. **组件注册**：设计态和运行态组件分别注册，设计态需要 Behavior 和 Resource

## 后续建议

1. 考虑为其他自定义组件（如 ScanTrigger、ConfirmDialogButton）应用相同的修复
2. 建立组件开发规范文档，避免类似问题再次出现
3. 为属性面板添加更多实用配置项（如 disabled、loading 状态等）

## 相关文档

- [按钮使用指南](./BUTTON_GUIDE.md) - 面向用户的使用文档
- [@designable/formily-antd 源码](../node_modules/@designable/formily-antd/) - 标准组件实现参考
