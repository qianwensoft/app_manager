# 工单看板右键菜单快捷编辑

## 功能概述

在工单看板模式下，右键点击工单卡片可以快速编辑优先级、业务单号、其他编码和标签，无需跳转到详情页，提升操作效率。

## 功能特性

### 支持编辑的字段

1. **优先级**: 普通 / 较高 / 紧急
2. **业务单号**: 文本输入
3. **其他编码**: 多行文本（支持逗号或换行分隔多个编码）
4. **标签**: 多选下拉框，支持选择多个标签

### 权限控制

- **管理员和操作员**: 可以使用右键菜单编辑
- **查看者**: 右键菜单不显示（无响应）

### 触发方式

- **鼠标右键**: 在看板卡片上点击鼠标右键
- **快捷编辑**: 弹出 Dialog 表单，显示当前值，可直接修改

## 实现细节

### 前端实现

**文件**: `web/src/views/work-orders/WorkOrders.vue`

**关键代码**:

#### 1. 卡片右键事件绑定
```vue
<div
  class="board-card"
  @click="onCardClick(element.id)"
  @contextmenu.prevent="onCardContextMenu($event, element)"
>
```

#### 2. 右键菜单 Dialog
```vue
<el-dialog
  v-model="contextMenuDialog.visible"
  :title="`快捷编辑 - ${contextMenuDialog.wo?.code || ''}`"
  width="500px"
>
  <el-form label-width="90px">
    <el-form-item label="优先级">
      <el-select v-model="contextMenuDialog.priority">
        <el-option label="普通" value="normal" />
        <el-option label="较高" value="high" />
        <el-option label="紧急" value="urgent" />
      </el-select>
    </el-form-item>
    <el-form-item label="业务单号">
      <el-input v-model="contextMenuDialog.businessNo" />
    </el-form-item>
    <el-form-item label="其他编码">
      <el-input v-model="contextMenuDialog.otherCodes" type="textarea" :rows="2" />
    </el-form-item>
    <el-form-item label="标签">
      <el-select v-model="contextMenuDialog.tags" multiple>
        <!-- 标签选项 -->
      </el-select>
    </el-form-item>
  </el-form>
</el-dialog>
```

#### 3. 右键菜单逻辑
```javascript
const contextMenuDialog = ref({
  visible: false,
  wo: null,
  priority: '',
  businessNo: '',
  otherCodes: '',
  tags: []
})

const onCardContextMenu = (event, wo) => {
  if (!auth.isOperator) return // 权限检查

  contextMenuDialog.value = {
    visible: true,
    wo: wo,
    priority: wo.priority || 'normal',
    businessNo: wo.business_no || '',
    otherCodes: wo.other_codes || '',
    tags: wo.tags ? [...wo.tags] : []
  }
}
```

#### 4. 保存更改
```javascript
const saveContextMenuChanges = async () => {
  const wo = contextMenuDialog.value.wo
  
  // 构建更新数据（仅包含变更的字段）
  const updates = {}
  let changed = false

  if (contextMenuDialog.value.priority !== wo.priority) {
    updates.priority = contextMenuDialog.value.priority
    changed = true
  }

  if (contextMenuDialog.value.businessNo !== (wo.business_no || '')) {
    updates.business_no = contextMenuDialog.value.businessNo
    changed = true
  }

  if (contextMenuDialog.value.otherCodes !== (wo.other_codes || '')) {
    updates.other_codes = contextMenuDialog.value.otherCodes
    changed = true
  }

  // 更新基本字段
  if (changed) {
    await updateWorkOrder(wo.id, updates)
  }

  // 更新标签（单独接口）
  const oldTags = wo.tags || []
  const newTags = contextMenuDialog.value.tags
  if (JSON.stringify(oldTags.sort()) !== JSON.stringify(newTags.sort())) {
    await setWorkOrderTags(wo.id, newTags)
  }

  ElMessage.success('更新成功')
  contextMenuDialog.value.visible = false
  
  // 刷新看板
  loadBoard()
}
```

### API 调用

**使用的 API**:
- `updateWorkOrder(id, data)` - 更新工单基本字段（优先级、业务单号、其他编码）
- `setWorkOrderTags(id, tags)` - 更新工单标签

**导入**:
```javascript
import { updateWorkOrder, setWorkOrderTags } from '@/api/workOrder'
```

## 使用场景

### 场景 1: 批量调整工单优先级

**需求**: 看板上有多个工单需要提升优先级

**操作**:
1. 在看板上找到目标工单卡片
2. 右键点击卡片
3. 弹出快捷编辑窗口
4. 修改优先级为"紧急"
5. 点击保存
6. 卡片上的优先级标签立即更新

**优势**: 无需逐个进入详情页，节省大量时间

### 场景 2: 快速补充业务单号

**需求**: 工单创建时未填写业务单号，后续需要补充

**操作**:
1. 在看板上找到工单
2. 右键点击卡片
3. 在"业务单号"输入框填写
4. 点击保存
5. 卡片上立即显示业务单号行

**优势**: 无需跳转详情页，编辑流程更流畅

### 场景 3: 批量添加标签

**需求**: 对一批工单添加"紧急"标签

**操作**:
1. 逐个右键点击工单卡片
2. 在标签下拉框选择"紧急"
3. 点击保存
4. 卡片标签区域立即显示新标签

**优势**: 在看板视图下快速分类工单

### 场景 4: 补充其他编码

**需求**: 现场扫描设备二维码后，需要记录到工单

**操作**:
1. 右键点击工单卡片
2. 在"其他编码"输入框粘贴扫描结果
3. 点击保存
4. 卡片上立即显示编码信息

**优势**: 支持多行输入，可以一次性录入多个编码

## 交互设计

### 触发方式

- **左键点击**: 进入工单详情页（原有行为）
- **右键点击**: 弹出快捷编辑窗口（新增行为）

### Dialog 设计

- **标题**: 显示工单编号，便于确认操作对象
- **宽度**: 500px，适合表单内容
- **关闭方式**: 
  - 点击取消按钮
  - 点击遮罩层不关闭（防止误操作）
  - ESC 键关闭

### 表单布局

```
┌─────────────────────────────────────┐
│ 快捷编辑 - WO2606230001             │
├─────────────────────────────────────┤
│ 优先级:  [下拉选择: 普通/较高/紧急]  │
│ 业务单号: [文本输入框]              │
│ 其他编码: [多行文本框]              │
│           [支持逗号或换行分隔]       │
│ 标签:     [多选下拉框]              │
│           [已选标签折叠显示]         │
├─────────────────────────────────────┤
│                   [取消]  [保存]     │
└─────────────────────────────────────┘
```

## 数据验证

### 字段校验

- **优先级**: 必选，默认值为当前优先级
- **业务单号**: 可选，文本格式
- **其他编码**: 可选，文本格式（多行）
- **标签**: 可选，多选

### 变更检测

- 只提交变更的字段，减少网络请求
- 标签变更独立检测（比较排序后的数组）
- 无变更时也允许保存（显示成功提示）

## 性能优化

### 局部刷新

- 保存成功后只刷新看板数据，不刷新整个页面
- 使用已有的 `loadBoard()` 方法，保持筛选条件

### 防抖处理

- Dialog 关闭后清空表单数据
- 避免重复打开多个 Dialog

### 权限检查

- 在事件处理函数开头检查权限
- 无权限用户右键无响应，不弹出 Dialog

## 向后兼容性

✅ **完全向后兼容**

- 左键点击卡片行为不变，仍然进入详情页
- 右键菜单为新增功能，不影响现有操作
- 查看者权限无右键菜单，与其只读权限一致
- 全屏看板模式下右键菜单同样可用

## 扩展性

### 可扩展字段

右键菜单表单设计支持快速扩展更多字段：

- **指派人**: 下拉选择用户
- **截止日期**: 日期选择器
- **工单类型**: 下拉选择类型（需考虑类型切换的影响）
- **设备**: 搜索选择设备

### 扩展示例

```vue
<el-form-item label="指派给">
  <el-select v-model="contextMenuDialog.assignedTo" filterable>
    <el-option
      v-for="user in users"
      :key="user.id"
      :label="user.username"
      :value="user.id"
    />
  </el-select>
</el-form-item>
```

## 注意事项

1. **权限限制**: 只有管理员和操作员可以编辑，查看者无权限
2. **数据一致性**: 保存后自动刷新看板，确保显示最新数据
3. **标签独立接口**: 标签更新使用单独的 API，与其他字段分开处理
4. **空值处理**: 业务单号和其他编码清空后保存为空字符串
5. **多行编码**: 其他编码支持多行输入，后端存储时保留换行符

## 测试要点

### 基本功能测试

1. **右键触发**
   - [ ] 右键点击卡片弹出 Dialog
   - [ ] Dialog 标题显示工单编号
   - [ ] 表单字段显示当前值

2. **字段编辑**
   - [ ] 修改优先级，保存后卡片标签更新
   - [ ] 修改业务单号，保存后卡片显示业务单号行
   - [ ] 修改其他编码，保存后卡片显示编码信息
   - [ ] 添加/移除标签，保存后卡片标签区域更新

3. **保存逻辑**
   - [ ] 只修改一个字段，其他字段不变
   - [ ] 修改多个字段，所有变更生效
   - [ ] 不修改任何字段，保存提示成功

### 权限测试

4. **权限控制**
   - [ ] 管理员右键可编辑
   - [ ] 操作员右键可编辑
   - [ ] 查看者右键无响应

### 交互测试

5. **Dialog 交互**
   - [ ] 点击取消关闭 Dialog
   - [ ] 点击遮罩层不关闭（防误操作）
   - [ ] ESC 键关闭 Dialog
   - [ ] 保存成功后自动关闭 Dialog

6. **数据刷新**
   - [ ] 保存后看板数据自动刷新
   - [ ] 筛选条件保持不变
   - [ ] 卡片位置不变（除非状态变更导致移动）

### 边界测试

7. **特殊情况**
   - [ ] 业务单号为空，保存后清空卡片上的业务单号行
   - [ ] 其他编码为空，保存后清空卡片上的编码行
   - [ ] 标签全部移除，保存后卡片标签区域消失
   - [ ] 多行其他编码，保存后正确存储

### 全屏看板测试

8. **全屏模式**
   - [ ] 全屏看板下右键菜单正常工作
   - [ ] Dialog 在全屏模式下正常显示
   - [ ] 保存后全屏状态保持

## 相关文件

- `web/src/views/work-orders/WorkOrders.vue` - 工单列表页（修改）
- `web/src/api/workOrder.js` - API 接口（已有）

## 优势总结

| 对比项 | 之前 | 现在 |
|--------|------|------|
| 编辑方式 | 进入详情页编辑 | 右键快捷编辑 |
| 操作步骤 | 点击卡片 → 进入详情 → 编辑 → 保存 → 返回 | 右键卡片 → 编辑 → 保存 |
| 页面跳转 | 需要跳转 | 无需跳转 |
| 批量处理 | 逐个进入详情页 | 在看板上逐个右键 |
| 上下文保持 | 返回后可能丢失滚动位置 | 始终保持看板视图 |

---

**更新日期**: 2026-06-23  
**影响范围**: 工单看板模式  
**向后兼容**: ✅ 完全兼容  
**权限要求**: 管理员或操作员
