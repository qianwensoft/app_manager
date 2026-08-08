# SCADA 编辑器条件样式功能

## 功能概述

为 SCADA 编辑器添加了基于表达式的条件样式系统，支持根据数据绑定值、扩展字段或其他组件值动态设置元素颜色。

## 主要变更

### 1. 类型定义 (`src/types/index.ts`)

新增类型：
- `ConditionalColorRule` - 单条颜色规则定义
- `ConditionalStyles` - 样式规则集合（fontColor, fill, stroke, backgroundColor）

在 `CanvasElement` 接口中新增字段：
- `conditionalStyles?: ConditionalStyles` - 条件样式规则配置

### 2. 运行时解析器 (`src/runtime/conditionalStyles.ts`)

新增模块，提供条件样式解析功能：

**核心函数：**
- `resolveConditionalStyles()` - 解析元件的所有条件样式
- `resolveFontColor()` - 快捷解析文本颜色
- `resolveFillColor()` - 快捷解析填充色
- `resolveStrokeColor()` - 快捷解析边框色

**表达式作用域：**
- `v` - 绑定的数值
- `text` - 显示的文本
- `ext` - 扩展数据对象
- `el()` - 访问其他组件
- 完整的表达式引擎（params, point, 时间函数等）

### 3. UI 编辑器 (`src/components/PropertiesPanel.tsx`)

新增组件：
- `ConditionalColorRulesEditor` - 条件颜色规则编辑器

功能特性：
- 添加/删除规则
- 规则排序（上移/下移）
- 规则展开/收起
- 实时预览规则数量
- 支持多行表达式输入
- 颜色选择器 + 手动输入

在属性面板中新增「条件样式」section，包含：
- 使用说明
- 文本颜色规则编辑器（text/button/form-* 组件）
- 填充色规则编辑器
- 边框色规则编辑器

### 4. 渲染集成

**CanvasViewer (`src/components/CanvasViewer.tsx`)**
- 在文本/按钮渲染前解析条件样式
- 应用解析后的颜色覆盖默认颜色
- 支持预览和分享模式

**CanvasBoard (`src/components/CanvasBoard.tsx`)**
- 在编辑器画布中支持条件样式预览
- 仅在实时数据开启时解析条件样式
- 保持与 CanvasViewer 的渲染一致性

### 5. 测试 (`src/runtime/conditionalStyles.test.ts`)

新增测试用例覆盖：
- 基于数值的颜色判定
- 规则优先级（第一个匹配生效）
- 扩展数据引用
- 跨组件引用
- 多样式属性支持
- 绑定值访问

## 使用示例

### 示例 1: 基于温度值的颜色告警

```typescript
{
  conditionalStyles: {
    fontColor: [
      { condition: 'Number(text) > 80', color: '#ff0000', label: '高温' },
      { condition: 'Number(text) > 60', color: '#ff9800', label: '警告' },
      { condition: 'true', color: '#4caf50', label: '正常' }
    ]
  }
}
```

### 示例 2: 引用扩展字段阈值

```typescript
// 扩展数据: { max: '100', warning: '80' }
{
  conditionalStyles: {
    fontColor: [
      { condition: 'Number(text) > Number(ext.max)', color: '#ff0000' },
      { condition: 'Number(text) > Number(ext.warning)', color: '#ff9800' },
      { condition: 'true', color: '#4caf50' }
    ]
  }
}
```

### 示例 3: 引用其他组件

```typescript
// 引用名为"阈值配置"组件的扩展数据
{
  conditionalStyles: {
    fontColor: [
      { 
        condition: "Number(text) > Number(el('阈值配置', 'extData.max'))", 
        color: '#ff0000' 
      }
    ]
  }
}
```

## 技术特点

1. **表达式驱动** - 基于完整的 JavaScript 表达式引擎
2. **类型安全** - 完整的 TypeScript 类型定义
3. **高性能** - 表达式缓存和优化执行
4. **易用性** - 可视化规则编辑器，无需编写代码
5. **灵活性** - 支持复杂逻辑、跨组件引用、全局参数
6. **兼容性** - 向后兼容，不影响现有项目

## 文档

详细使用指南请参考：
- `scada-editor/CONDITIONAL_STYLES_GUIDE.md` - 完整使用文档

## 构建验证

```bash
cd scada-editor
npm run build
```

✅ 构建成功，无错误和警告（除 chunk size 提示）

## 后续优化建议

1. **性能优化**
   - 添加表达式结果缓存
   - 优化频繁更新场景的重绘

2. **功能扩展**
   - 支持更多样式属性（opacity, fontSize 等）
   - 支持动画过渡效果
   - 支持条件显示/隐藏

3. **用户体验**
   - 添加表达式语法高亮
   - 添加表达式自动补全
   - 添加实时预览面板

4. **文档完善**
   - 添加视频教程
   - 添加更多实际案例
   - 翻译为英文版本
