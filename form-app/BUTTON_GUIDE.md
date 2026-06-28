# Form App 按钮组件使用指南

## 问题背景

之前的按钮组件（ActionButton、EventButton、NavigateButton）虽然功能完整，但在 Formily 设计器中无法在右侧属性面板修改按钮文本、样式等基本属性。

## 解决方案

**已全面修复所有按钮组件的属性配置面板**，现在所有按钮都支持：

1. ✅ 在右侧属性面板直接编辑按钮文本
2. ✅ 选择按钮样式（默认、次要、轮廓、幽灵、链接、危险）
3. ✅ 设置是否撑满整行
4. ✅ 配置按钮 ID 或其他特定属性
5. ✅ 使用标准 Formily 属性配置结构（CollapseItem 折叠面板）

## 技术实现

采用 `@designable/formily-antd` 的标准 `createVoidFieldSchema` 模式：

```typescript
// 创建符合 Formily 规范的 void field schema
const createVoidFieldSchema = (component: any) => {
  return {
    type: 'object',
    properties: {
      'field-group': {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          name: { ... },
          title: { ... },
        },
      },
      'component-group': {
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

这确保了属性配置面板使用可折叠的分组显示，与其他标准 Formily 组件保持一致。

## 按钮组件对比

| 组件 | 使用场景 | 属性配置 | 事件绑定 |
|------|---------|---------|---------|
| **CustomButton** | 通用按钮，推荐使用 | ✅ 支持右侧面板编辑 | 通过按钮 ID 绑定事件系统 |
| **ActionButton** | 多功能按钮（提交/事件/跳转/接口） | ✅ 支持右侧面板编辑 | 内置多种动作类型 |
| **EventButton** | 专门触发事件 | ✅ 支持右侧面板编辑 | 直接触发事件 |
| **NavigateButton** | 专门跳转页面 | ✅ 支持右侧面板编辑 | 页面跳转 |
| **SubmitButton** | 表单提交按钮 | ✅ 支持右侧面板编辑 | 提交表单 |

**注意**：所有按钮组件现在都已修复，可以在右侧属性面板正常编辑！

## 使用步骤

### 1. 在设计器中拖入按钮

1. 打开页面设计器
2. 从左侧组件面板的「按钮」分组中，拖入 **通用按钮** 组件
3. 按钮会出现在画布中

### 2. 配置按钮属性

在右侧「属性」面板中，可以直接编辑：

- **按钮文本**：显示的文字内容
- **按钮样式**：
  - 默认（default）：主要按钮样式
  - 次要（secondary）：次要按钮样式
  - 轮廓（outline）：边框按钮
  - 幽灵（ghost）：透明背景
  - 链接（link）：链接样式
  - 危险（destructive）：危险操作样式
- **撑满整行**：开关，是否占据整行宽度
- **按钮 ID**：用于事件系统匹配（见下一步）

### 3. 绑定事件

#### 方式一：通过事件系统（推荐）

1. ��右侧属性面板的「事件」标签页，为按钮设置一个唯一的 ID（例如：`submit-btn`）
2. 点击设计器顶部的「事件编排」按钮
3. 添加新事件，配置：
   - **事件名称**：描述性名称
   - **触发源**：选择「按钮」
   - **按钮 ID**：填写与步骤 1 相同的 ID（`submit-btn`）
   - **条件**：可选，设置触发条件
   - **动作**：选择要执行的动作（调用接口、跳转页面、显示提示等）

#### 方式二：通过节点事件绑定

1. 选中按钮组件
2. 切换到右侧「事件」标签页
3. 点击「添加事件」
4. 配置事件流：条件 → 动作链

### 4. 保存并预览

1. 点击「保存布局」按钮
2. 在下方预览区域测试按钮功能
3. 确认按钮点击能正确触发配置的事件

## 事件系统示例

### 示例 1：提交表单后调用接口

```
按钮属性：
  - 按钮文本：提交工单
  - 按钮 ID：submit-workorder

事件配置：
  - 触发源：按钮 (ID: submit-workorder)
  - 动作 1：调用接口
    - 接口类型：内部接口
    - 接口编码：create_workorder
    - 参数映射：{ "title": "$form.title", "desc": "$form.desc" }
  - 动作 2：显示提示
    - 提示文本：工单已提交
  - 动作 3：跳转页面
    - 目标页面：workorder-list
```

### 示例 2：扫码后自动填充表单

```
按钮属性：
  - 按钮文本：扫描二维码
  - 按钮 ID：scan-qr

事件配置：
  - 触发源：按钮 (ID: scan-qr)
  - 动作 1：调用接口
    - 接口类型：内部接口
    - 接口编码：query_device_by_code
    - 参数映射：{ "code": "$scan.result" }
  - 动作 2：填充字段
    - 字段映射：device_name = $response.name
```

## 技术实现

### 设计态组件
`src/designable/Button.tsx` - 提供属性配置面板

### 运行态组件
`src/runtime/Button.tsx` - 实际渲染和事件触发逻辑

### 组件注册
- `src/runtime/componentLibraries/shadcn.tsx` - shadcn/ui 组件库
- `src/runtime/componentLibraries/antd.tsx` - Ant Design 组件库
- `src/pages/PageDesignerPage.tsx` - 设计器组件映射表

## 常见问题

### Q: 按钮点击没有反应？

A: 检查以下几点：
1. 按钮 ID 是否已设置
2. 事件系统中是否配置了匹配的按钮 ID
3. 事件的条件是否满足
4. 动作配置是否正确

### Q: 如何让按钮触发多个动作？

A: 在事件编排中，一个事件可以配置多个动作，按顺序执行。

### Q: 可以在一个页面使用多个按钮吗？

A: 可以。每个按钮设置不同的按钮 ID，在事件系统中分别配置即可。

### Q: 旧的按钮组件还能用吗？

A: 可以继续使用，但推荐迁移到新的 CustomButton 组件，配置更方便。

## 更新日志

**2026-06-24**
- ✅ 修复所有按钮组件的属性配置面板
- ✅ 采用标准 Formily `createVoidFieldSchema` 模式
- ✅ 新增 CustomButton 通用按钮组件
- ✅ ActionButton、EventButton、NavigateButton 全部支持右侧面板编辑
- ✅ 属性面板使用 CollapseItem 折叠分组，与标准组件一致
- ✅ 构建成功，已部署到 form-app/dist/

## 技术细节

### 问题根源

原来的按钮组件属性配置使用了错误的 schema 结构：

```typescript
// ❌ 错误：直接嵌套 x-component-props
propsSchema: {
  type: 'object',
  properties: {
    'x-component-props': {
      type: 'object',
      properties: { text: {...}, variant: {...} }
    }
  }
}
```

这导致 Formily 的 `SettingsForm` 无法正确渲染属性面板。

### 修复方案

采用 `@designable/formily-antd` 的标准模式，使用 `createVoidFieldSchema` 创建符合规范的 schema：

```typescript
// ✅ 正确：使用 CollapseItem 分组
const createVoidFieldSchema = (component: any) => {
  return {
    type: 'object',
    properties: {
      'field-group': {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: { name: {...}, title: {...} }
      },
      'component-group': {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          'x-component-props': component
        }
      }
    }
  }
}
```

这样创建的属性面板会使用可折叠的分组，与 Input、Select 等标准组件一致。

### 中文标签配置

通过 `designerLocales` 的 `settings` 字段配置中文标签：

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
