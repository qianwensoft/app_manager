# 按钮事件面板支持修复

## 问题描述
用户反馈：在编辑模式下点击按钮后，期望：
1. ✅ 按钮显示选中状态（蓝色边框）
2. ✅ 右侧"属性"面板显示按钮配置
3. ❌ 右侧"事件"面板显示"事件绑定仅支持按钮类组件"

## 根本原因
`NodeEventBinder` 组件中的 `BUTTON_COMPONENTS` 集合只包含了4种按钮：
```typescript
const BUTTON_COMPONENTS = new Set(['ActionButton', 'EventButton', 'SubmitButton', 'PrintButton'])
```

但实际上我们有8种按钮组件，其他4种按钮（NavigateButton、FeedbackButton、CustomButton、ConfirmDialogButton）没有被识别为按钮类组件，所以在"事件"选项卡中无法配置事件。

## 解决方案

### 修改文件
`form-app/src/console/NodeEventBinder.tsx`

### 修改内容
将所有按钮组件添加到 `BUTTON_COMPONENTS` 集合中：

```typescript
const BUTTON_COMPONENTS = new Set([
  'ActionButton',      // 动作按钮
  'EventButton',       // 事件触发按钮
  'SubmitButton',      // 提交按钮
  'PrintButton',       // 打印按钮
  'NavigateButton',    // 跳转按钮 (新增)
  'FeedbackButton',    // 一键反馈按钮 (新增)
  'CustomButton',      // 自定义按钮 (新增)
  'ConfirmDialogButton', // 确认弹窗按钮 (新增)
])
```

## 验证步骤

1. **刷新页面** `http://192.168.1.127:3000/form-app/page-designer/10`

2. **测试按钮选中和属性配置：**
   - 点击画布中的任意按钮
   - 确认按钮显示选中状态（蓝色或红色边框）
   - 右侧属性面板显示"属性配置"
   - "属性"选项卡显示按钮的配置项（文本、样式等）

3. **测试事件面板：**
   - 保持按钮选中状态
   - 点击右侧"事件"选项卡
   - 应该看到按钮ID配置和事件流列表
   - 如果按钮没有配置 buttonId，会显示输入框提示配置
   - 如果已配置 buttonId，会显示：
     - 按钮ID（可编辑）
     - 生成新ID按钮
     - 匹配的事件流列表
     - "新建事件流"按钮
     - "去事件编排"按钮

4. **测试所有按钮类型：**
   - ✅ SubmitButton（提交按钮）
   - ✅ EventButton（事件触发按钮）
   - ✅ NavigateButton（跳转按钮）
   - ✅ ActionButton（动作按钮）
   - ✅ FeedbackButton（一键反馈按钮）
   - ✅ CustomButton（自定义按钮）
   - ✅ ConfirmDialogButton（确认弹窗按钮）
   - ✅ PrintButton（打印按钮）

## NodeEventBinder 功能说明

### 显示内容
1. **非按钮组件：**
   - 显示空状态："事件绑定仅支持按钮类组件"

2. **按钮组件（无 buttonId）：**
   - 显示 buttonId 输入框
   - 提供"生成 ID"按钮
   - 显示"新建事件流"按钮

3. **按钮组件（有 buttonId）：**
   - 显示当前 buttonId
   - 允许编辑 buttonId
   - 提供"生成新 ID"按钮
   - 列出所有匹配的事件流（source.kind=button && source.button_id=当前ID）
   - 每个事件流显示：
     - 事件名称
     - 动作数量标签
     - "编辑"按钮（跳转到事件编排页，聚焦该事件）
   - 提供"新建事件流"按钮
   - 提供"去事件编排"按钮（打开事件编排页）

### 功能特性
- **自动保存：** 修改 buttonId 后自动保存到 design_schema
- **实时联动：** 与顶部"事件编排"按钮打开的 Drawer 共享同一份事件数据
- **跳转聚焦：** 点击"编辑"按钮会跳转到事件编排页并自动滚动到对应事件

## 与事件编排的关系

### 两个入口
1. **顶部"事件编排"按钮：** 
   - 打开 Drawer
   - 显示页面级所有事件流
   - 适合批量管理事件

2. **右侧"事件"选项卡：**
   - 针对当前选中的按钮
   - 显示该按钮相关的事件流
   - 适合单个按钮的快速配置

### 数据同步
两个入口操作的是同一份数据（`config_json.events`），通过 API 实时读写：
```
GET /api/form-app/pages/:pageId  # 读取 config_json.events
PUT /api/form-app/pages/:pageId  # 保存 config_json.events
```

### 工作流程
1. 在设计器中拖入按钮组件
2. 点击选中按钮
3. 切换到"事件"选项卡
4. 配置或生成 buttonId
5. 点击"新建事件流"
6. 在事件编排页配置事件流（触发条件、动作链等）
7. 保存事件
8. 回到设计器，事件面板会显示刚创建的事件流

## 技术细节

### 按钮识别逻辑
```typescript
const comp: string | undefined = node?.props?.['x-component']
const isButton = !!comp && BUTTON_COMPONENTS.has(comp)
```

### ButtonId 读写
```typescript
// 读取
const buttonId: string = node?.props?.['x-component-props']?.buttonId || ''

// 写入
const setButtonId = (id: string) => {
  const prev = node.props?.['x-component-props'] || {}
  node.setProps({ 'x-component-props': { ...prev, buttonId: id } })
}
```

### 事件流匹配
```typescript
const matched = events.filter(
  e => e.source?.kind === 'button' && 
       (e.source as any).button_id === buttonId
)
```

## 影响范围

### 修改文件
- `form-app/src/console/NodeEventBinder.tsx`

### 受益组件
- NavigateButton（新增支持）
- FeedbackButton（新增支持）
- CustomButton（新增支持）
- ConfirmDialogButton（新增支持）

### 兼容性
✅ 向后兼容
✅ 不影响已有配置
✅ 不需要迁移数据

## 总结

通过将所有按钮组件添加到 `BUTTON_COMPONENTS` 集合中，现在所有8种按钮都可以在右侧"事件"选项卡中配置事件绑定，实现了完整的按钮→事件流的可视化配置体验。

用户现在可以：
1. ✅ 点击选中按钮
2. ✅ 在"属性"选项卡配置按钮外观和行为
3. ✅ 在"事件"选项卡配置按钮触发的事件流
4. ✅ 快速跳转到事件编排页进行详细配置

---

修复时间: 2026年7月2日
验证状态: ✅ TypeScript 编译通过
