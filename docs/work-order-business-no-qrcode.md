# 工单业务单号二维码功能

## 更新说明

为工单详情页面和工单列表页面的业务单号字段添加了二维码快捷显示，方便用户快速生成和扫描业务单号。

### 2026-06-23 更新
- ✅ 工单列表页（表格模式）：业务单号鼠标悬浮显示二维码
- ✅ 工单列表页（看板模式）：卡片显示二维码图标，悬浮显示二维码
- ✅ 新增 QRCodePopover 通用组件

### 原有功能
- ✅ 工单详情页：业务单号旁显示二维码按钮（点击弹出）

## 功能描述

### 1. 工单详情页

#### 显示逻辑

- **业务单号存在时**：显示业务单号文本 + 二维码按钮 + 编辑按钮
- **业务单号为空时**：显示 "-" + 编辑按钮

#### 交互方式

1. 点击业务单号旁边的二维码图标按钮
2. 弹出气泡框显示二维码图片
3. 二维码下方显示业务单号文本
4. 点击外部或再次点击按钮关闭气泡框

### 2. 工单列表页（表格模式）

#### 显示逻辑

- **业务单号存在时**：业务单号带虚线下划线，鼠标悬浮显示二维码
- **业务单号为空时**：显示 "-"

#### 交互方式

1. 鼠标移至业务单号文本上
2. Popover 在上方自动弹出，显示二维码和文本
3. 鼠标移开后自动隐藏
4. 悬浮时业务单号文本变为主题色

### 3. 工单列表页（看板模式）

#### 显示逻辑

- **业务单号存在时**：显示业务单号行，文本右侧显示 Grid 图标
- **业务单号为空时**：不显示业务单号行

#### 交互方式

1. 鼠标移至 Grid 图标上
2. Popover 在右侧自动弹出，显示二维码和文本
3. 鼠标移开后自动隐藏
4. 悬浮时图标变为主题色

### 二维码规格

- 尺寸：160x160 像素
- 内容：业务单号完整文本
- 生成库：qrcode (npm)
- 渲染方式：Canvas (列表页) / Data URL (详情页)

## 实现细节

### 通用组件：QRCodePopover

**文件**: `/web/src/components/QRCodePopover.vue`

基于 Element Plus Popover 和 qrcode 库实现的通用二维码弹出组件。

**Props**:
- `text`: 要生成二维码的文本（必填）
- `size`: 二维码尺寸，默认 160px
- `placement`: 弹出位置，默认 'top'
- `width`: Popover 宽度，默认 180px
- `showText`: 是否显示文本，默认 true

**特性**:
- 使用 Canvas 渲染，清晰度高
- 响应式更新（text 变化时自动重新生成）
- 支持自定义触发元素（slot）

**使用示例**:
```vue
<!-- 基础用法 -->
<QRCodePopover text="BN-202401-001">
  <span class="qr-trigger">业务单号</span>
</QRCodePopover>

<!-- 带图标 -->
<QRCodePopover :text="element.business_no" placement="right">
  <el-icon class="qr-icon" :size="16"><Grid /></el-icon>
</QRCodePopover>
```

### 工单详情页

**文件**: `/web/src/views/work-orders/WorkOrderDetail.vue`

**关键代码**:
```vue
<el-descriptions-item label="业务单号" :span="2">
  <div v-if="!editBusinessNo" class="business-no-view">
    <template v-if="wo.business_no">
      <span>{{ wo.business_no }}</span>
      <el-popover placement="top" :width="180" trigger="click" @show="renderCodeQr(wo.business_no)">
        <template #reference>
          <el-button text size="small" title="生成二维码" style="padding:2px 4px;margin-left:8px">
            <el-icon><Grid /></el-icon>
          </el-button>
        </template>
        <div class="qr-pop">
          <img v-if="qrCache[wo.business_no]" :src="qrCache[wo.business_no]" :alt="wo.business_no" class="qr-img" />
          <div class="qr-text">{{ wo.business_no }}</div>
        </div>
      </el-popover>
    </template>
    <span v-else>-</span>
    <el-button text type="primary" size="small" @click="startEditBusinessNo">编辑</el-button>
  </div>
</el-descriptions-item>
```

**二维码生成逻辑**:
```javascript
const renderCodeQr = async (code) => {
  if (qrCache.value[code]) return
  try {
    qrCache.value = { 
      ...qrCache.value, 
      [code]: await QRCode.toDataURL(code, { width: 160, margin: 1 }) 
    }
  } catch (e) {
    ElMessage.error('二维码生成失败')
  }
}
```

### 工单列表页

**文件**: `/web/src/views/work-orders/WorkOrders.vue`

**表格模式关键代码**:
```vue
<el-table-column label="业务单号" width="140" show-overflow-tooltip>
  <template #default="{ row }">
    <QRCodePopover v-if="row.business_no" :text="row.business_no">
      <span class="qr-trigger">{{ row.business_no }}</span>
    </QRCodePopover>
    <span v-else>-</span>
  </template>
</el-table-column>
```

**看板模式关键代码**:
```vue
<div v-if="element.business_no" class="board-card-business">
  <span>业务单号：{{ element.business_no }}</span>
  <QRCodePopover :text="element.business_no" placement="right">
    <el-icon class="qr-icon" :size="16"><Grid /></el-icon>
  </QRCodePopover>
</div>
```

**样式**:
```css
.qr-trigger { 
  cursor: pointer; 
  text-decoration: underline; 
  text-decoration-style: dotted; 
  text-underline-offset: 2px; 
}
.qr-trigger:hover { color: var(--el-color-primary); }
.qr-icon { cursor: pointer; color: #909399; transition: color .2s ease; }
.qr-icon:hover { color: var(--el-color-primary); }
.board-card-business { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  font-size: 12px; 
  color: #909399; 
  margin-top: 4px; 
}
```

## 使用场景

### 场景 1: 现场验收
- 技术人员完成工单处理
- 打开工单详情，点击业务单号的二维码按钮
- 客户扫描二维码获取业务单号，用于签字确认

### 场景 2: 单据关联
- 财务人员处理报销单据
- 扫描工单业务单号二维码
- 自动关联到报销系统中对应的业务单号

### 场景 3: 快速录入
- 外部系统需要录入业务单号
- 扫描二维码自动填充，避免手动输入错误

### 场景 4: 移动端查询
- 使用手机查看工单详情
- 直接扫描业务单号二维码
- 在其他移动应用中快速搜索

## 与其他编码的一致性

业务单号的二维码功能与"其他编码"的实现保持一致：

| 字段 | 显示格式 | 二维码支持 |
|------|---------|-----------|
| 业务单号 | 单个文本 | ✅ 支持 |
| 其他编码 | 多个标签 | ✅ 每个标签都支持 |
| 外部单号 | 单个文本 | ❌ 不支持 |

**注意**: 外部单号通常由第三方系统回写，一般不需要生成二维码。如有需要，可以按相同方式添加。

## UI 展示

### 工单详情页

#### 有业务单号时
```
业务单号: BIZ-2026-001 [🔲] [编辑]
          ↑              ↑     ↑
        业务单号        二维码  编辑按钮
                       按钮
```

点击二维码按钮后弹出：
```
┌─────────────┐
│ [QR Code]   │
│             │
│ BIZ-2026-001│
└─────────────┘
```

#### 无业务单号时
```
业务单号: - [编辑]
          ↑   ↑
         空值  编辑按钮
```

### 工单列表页（表格模式）

```
| 工单号 | 标题 | ... | 业务单号        | ... |
|--------|------|-----|----------------|-----|
| WO-001 | 测试 | ... | BIZ-2026-001   | ... |  ← 虚线下划线，悬浮显示 QR
|        |      |     | (hover 变主题色)|     |
| WO-002 | 示例 | ... | -              | ... |  ← 无业务单号
```

悬浮效果：
```
       ┌─────────────┐
       │ [QR Code]   │
       │             │
       │ BIZ-2026-001│
       └─────────────┘
            ↑
      BIZ-2026-001 (业务单号列)
```

### 工单列表页（看板模式）

```
┌─────────────────────────┐
│ 工单标题                │
│ WO-001        [高优先]  │
│ 维修类型 · 设备ID-123   │
│ 业务单号：BIZ-2026-001 [📱] │  ← Grid 图标，悬浮显示 QR
│ 编码：OC-456            │
│ [紧急] [现场]           │
└─────────────────────────┘
```

悬浮 Grid 图标效果：
```
                   ┌─────────────┐
                   │ [QR Code]   │
                   │             │
                   │ BIZ-2026-001│
                   └─────────────┘
                        ↑
业务单号：BIZ-2026-001 [📱] (图标)
```

## 样式说明

使用已有的样式类：
- `.qr-pop`: 气泡框布局（垂直居中，间隔 6px）
- `.qr-img`: 二维码图片尺寸（160x160）
- `.qr-text`: 文本样式（12px，灰色，自动换行）

## 依赖

- **Element Plus**: `el-popover` 组件
- **QRCode.js**: 二维码生成库（v1.5.4）
- **Element Plus Icons**: `Grid` 图标
- **Vue 3**: 响应式系统

## 文件清单

- `web/src/components/QRCodePopover.vue` - 二维码弹出组件（新建）
- `web/src/views/work-orders/WorkOrders.vue` - 工单列表页（修改）
- `web/src/views/work-orders/WorkOrderDetail.vue` - 工单详情页（已有功能）

## 浏览器兼容性

- ✅ Chrome/Edge (现代浏览器)
- ✅ Firefox
- ✅ Safari
- ⚠️ IE11 不支持（项目本身不支持 IE11）

## 测试建议

### 工单详情页测试

1. **基本功能测试**
   - 有业务单号时显示二维码按钮
   - 无业务单号时不显示二维码按钮
   - 点击按钮生成二维码
   - 二维码内容正确

2. **交互测试**
   - 首次点击生成二维码
   - 再次点击使用缓存（不重新生成）
   - 点击外部关闭气泡框

3. **编辑流程测试**
   - 从空业务单号编辑为有值 → 保存后显示二维码按钮
   - 从有值编辑为空 → 保存后隐藏二维码按钮
   - 修改业务单号 → 二维码缓存正确更新

### 工单列表页（表格模式）测试

1. **基本功能测试**
   - 有业务单号时，文本带虚线下划线
   - 无业务单号时，显示 "-"
   - 鼠标悬浮显示二维码
   - 二维码内容与业务单号一致

2. **交互测试**
   - 悬浮时文本变为主题色
   - 移开后 Popover 自动隐藏
   - 快速移动鼠标不会出现多个 Popover
   - 二维码在上方显示，不被遮挡

3. **性能测试**
   - 表格滚动时流畅
   - 多次悬浮不会重复生成二维码

### 工单列表页（看板模式）测试

1. **基本功能测试**
   - 有业务单号时，显示业务单号行和图标
   - 无业务单号时，不显示业务单号行
   - 悬浮图标显示二维码
   - 二维码在右侧显示

2. **交互测试**
   - 图标默认灰色，悬浮时变为主题色
   - 移开后 Popover 自动隐藏
   - 点击卡片进入详情时，Popover 不影响跳转

3. **全屏看板测试**
   - 全屏模式下图标和交互正常
   - 字号放大后布局美观
   - Popover 位置合理

### 通用测试

1. **二维码质量测试**
   - 生成的二维码可扫描
   - 长业务单号也能正确编码
   - Canvas 渲染清晰，无模糊

2. **移动端测试**
   - 手机浏览器中正常显示
   - 触摸交互正常（悬浮改为触摸）
   - Popover 位置合理，不超出屏幕
   - 二维码清晰可扫描

3. **浏览器兼容性测试**
   - Chrome/Edge：正常工作
   - Firefox：正常工作
   - Safari：正常工作

## 相关功能

- **工单编号二维码**: 工单列表中的工单编号也可以考虑添加二维码
- **设备编号二维码**: 设备详情页的设备编号也可以添加二维码
- **批量二维码生成**: 可以在工单列表页批量导出二维码
- **其他编码二维码**: 工单详情页已实现，每个其他编码标签都支持二维码

## 技术特点

### 性能优化

1. **详情页**：使用缓存机制，同一业务单号不重复生成
2. **列表页**：使用 Canvas 实时渲染，无缓存开销
3. **响应式**：文本变化时自动重新生成二维码

### 用户体验

1. **交互方式差异化**
   - 详情页：点击触发（适合编辑场景）
   - 列表页：悬浮触发（适合快速查看）

2. **视觉反馈**
   - 表格模式：虚线下划线提示可交互
   - 看板模式：Grid 图标直观表示二维码
   - 悬浮时颜色变化提供即时反馈

3. **位置优化**
   - 表格：上方弹出，避免遮挡下方内容
   - 看板：右侧弹出，避免超出卡片范围

### 可访问性

- 使用语义化 HTML 元素
- 支持键盘导航（详情页按钮可 Tab 聚焦）
- Popover 有合理的 aria 属性
- 二维码下方显示文本内容，屏幕阅读器可读

---

**最后更新**: 2026-06-23  
**影响范围**: Web 端工单详情页、工单列表页  
**向后兼容**: ✅ 完全兼容，不影响现有功能  
**访问地址**: http://localhost:3001/work-orders
