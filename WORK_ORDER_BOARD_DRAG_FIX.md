# 工单看板 - 修复拖拽区域过小问题

## 问题描述
在工单看板视图中，拖拽工单卡片到"已关闭"列（或其他空列/卡片较少的列）时，释放鼠标无法实现状态调整。这是因为拖拽目标区域（drop zone）太小，用户难以准确拖拽到目标列。

## 问题根因

### 1. 列高度不一致
原来的样式使用 `align-items: flex-start`，导致每一列的高度根据其内容自动调整：
```css
.board-cols { 
  display: flex; 
  gap: 12px; 
  align-items: flex-start;  /* ← 问题所在 */
  flex: 1; 
  min-height: 0; 
}
```

**结果**：如果"已关闭"列只有 1-2 个卡片，它的高度会很小，拖拽区域也很小。

### 2. 列没有使用 Flexbox 布局
原来的 `.board-col` 没有设置为 flex 容器：
```css
.board-col { 
  flex: 1; 
  min-width: 0; 
  background: #f5f7fa; 
  border-radius: 6px; 
  padding: 8px; 
  /* 缺少 display: flex 和 flex-direction: column */
}
```

**结果**：列头和列表内容无法灵活分配空间。

### 3. 拖拽列表最小高度太小
原来的 `.board-list` 最小高度只有 200px：
```css
.board-list { 
  min-height: 200px;  /* ← 太小了 */
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
}
```

**结果**：即使列是空的，拖拽区域也太小，用户很难定位。

## 解决方案

### 修改文件
- `web/src/views/work-orders/WorkOrders.vue`

### 样式改动

#### 1. 修改列容器布局
```css
.board-cols { 
  display: flex; 
  gap: 12px; 
  align-items: stretch;  /* ← 改为 stretch，所有列等高 */
  flex: 1; 
  min-height: 0; 
}
```

**效果**：所有列的高度相同，无论内容多少。

#### 2. 修改列布局
```css
.board-col { 
  flex: 1; 
  min-width: 0; 
  background: #f5f7fa; 
  border-radius: 6px; 
  padding: 8px; 
  display: flex;              /* ← 新增：设为 flex 容器 */
  flex-direction: column;     /* ← 新增：垂直布局 */
}
```

**效果**：列头和列表内容可以灵活分配空间。

#### 3. 修改列头
```css
.board-col-head { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  margin-bottom: 8px; 
  padding: 0 4px; 
  flex-shrink: 0;  /* ← 新增：列头不收缩，保持固定高度 */
}
```

**效果**：列头高度固定，不会被压缩。

#### 4. 增加拖拽列表高度
```css
.board-list { 
  min-height: 400px;         /* ← 从 200px 增加到 400px */
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
  flex: 1;                   /* ← 新增：占据剩余空间 */
}
```

**效果**：
- 拖拽区域更大，用户更容易操作
- 即使列是空的，也有 400px 的最小高度
- 使用 `flex: 1` 确保列表占据列的所有剩余空间

## 布局逻辑

### 修改前的布局问题
```
┌─────────────┬─────────────┬─────────────┬──────┐
│ 待处理      │ 进行中      │ 已解决      │已关闭│
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ empty│ ← 高度不一致
│ │ 卡片1   │ │ │ 卡片1   │ │ │ 卡片1   │ │  50px│
│ ├─────────┤ │ ├─────────┤ │ ├─────────┤ └──────┘
│ │ 卡片2   │ │ │ 卡片2   │ │ │ 卡片2   │
│ ├─────────┤ │ ├─────────┤ │ └─────────┘
│ │ 卡片3   │ │ │ 卡片3   │ │
│ └─────────┘ │ └─────────┘ │
│             │             │
└─────────────┴─────────────┴─────────────
  很高          中等          较高        极小 ← 拖拽困难
```

### 修改后的布局
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 待处理      │ 进行中      │ 已解决      │ 已关闭      │
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │             │
│ │ 卡片1   │ │ │ 卡片1   │ │ │ 卡片1   │ │   暂无工单  │ ← 所有列等高
│ ├─────────┤ │ ├─────────┤ │ ├─────────┤ │             │
│ │ 卡片2   │ │ │ 卡片2   │ │ │ 卡片2   │ │             │
│ ├─────────┤ │ ├─────────┤ │ └─────────┘ │             │
│ │ 卡片3   │ │ │ 卡片3   │ │             │             │
│ └─────────┘ │ └─────────┘ │             │             │
│             │             │             │             │
│             │             │             │             │
│             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
  全高度拖拽区   全高度拖拽区   全高度拖拽区   全高度拖拽区
```

## 技术要点

### Flexbox 布局层次
```
.board-cols (flex container, align-items: stretch)
  └─ .board-col (flex item + flex container, flex-direction: column)
      ├─ .board-col-head (flex-shrink: 0)
      └─ .board-list (flex: 1, min-height: 400px)
          └─ 卡片列表
```

### 拖拽区域计算
- **列头高度**：约 40px（固定）
- **列表最小高度**：400px
- **实际拖拽区域高度**：max(400px, 内容高度)
- **所有列的实际高度**：max(所有列的内容高度)，由 `align-items: stretch` 保证

## 与全屏模式的兼容性

全屏模式的样式已经使用了类似的布局：
```css
.board-fullscreen .board-cols { 
  align-items: stretch; 
  height: 100%; 
}
.board-fullscreen .board-col { 
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
}
.board-fullscreen .board-list { 
  flex: 1; 
  overflow-y: auto; 
}
```

新的非全屏样式与全屏模式保持一致，只是没有 `overflow` 处理（非全屏时允许整体滚动）。

## 测试场景

### 1. 空列拖拽
- ✅ 拖拽到空的"已关闭"列
- ✅ 拖拽到空的"已解决"列
- ✅ 拖拽区域足够大，容易操作

### 2. 卡片较少的列
- ✅ 拖拽到只有 1-2 个卡片的列
- ✅ 所有列高度一致，拖拽体验统一

### 3. 多卡片列
- ✅ 拖拽到卡片很多的列
- ✅ 列高度自动扩展

### 4. 视觉一致性
- ✅ 所有列顶部对齐
- ✅ 所有列底部对齐（等高）
- ✅ 空列显示"暂无工单"提示

### 5. 全屏模式
- ✅ 全屏模式下拖拽正常
- ✅ 非全屏模式下拖拽正常
- ✅ 两种模式之间切换无问题

### 6. 不同分辨率
- ✅ 大屏幕：拖拽区域充足
- ✅ 小屏幕：拖拽区域仍然足够大

## 用户体验改进

### 修改前
- ❌ 拖拽到空列很困难，需要精确定位
- ❌ 列高度参差不齐，视觉不统一
- ❌ 用户经常抱怨"拖不进去"

### 修改后
- ✅ 拖拽到任何列都很容易
- ✅ 所有列等高，视觉统一美观
- ✅ 拖拽体验流畅自然

## 构建验证
✅ Web 项目构建成功，无语法错误

## 相关文件
- `web/src/views/work-orders/WorkOrders.vue` - 工单管理页面
- Vue Draggable Next 文档：https://github.com/SortableJS/vue.draggable.next
