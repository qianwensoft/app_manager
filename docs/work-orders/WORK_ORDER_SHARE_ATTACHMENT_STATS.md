# 工单分享统计报告 - 添加附件统计

## 问题描述
工单分享页面的统计报告视图中缺少附件（照片、视频、音频等）的统计信息，用户无法了解工单中附件的分布情况。

## 解决方案

### 修改文件
- `server/api/work_order.go` - 后端统计API
- `web/src/views/WorkOrderReportShare.vue` - 前端分享页面

### 后端改动

#### 1. 添加附件统计查询（两个统计函数）

在 `GetWorkOrderStatistics` 和 `GetSharedWorkOrderStatistics` 函数中添加：

```go
// 附件统计
type itemKindStat struct {
    Kind  string `json:"kind"`
    Count int    `json:"count"`
}
var byItemKind []itemKindStat
database.DB.Model(&models.WorkOrderItem{}).
    Select("kind, COUNT(*) as count").
    Where("work_order_id IN ?", woIDs).
    Group("kind").
    Order("count DESC").
    Find(&byItemKind)
```

#### 2. 添加到返回结果

```go
c.JSON(http.StatusOK, gin.H{
    "total":                len(woIDs),
    "by_status":            byStatus,
    "by_type":              byType,
    "by_tag":               byTag,
    "by_priority":          byPriority,
    "by_item_kind":         byItemKind,  // ← 新增
    "avg_processing_hours": avgHours,
})
```

#### 3. 更新空数据返回

```go
if len(woIDs) == 0 {
    c.JSON(http.StatusOK, gin.H{
        "total":                0,
        "by_status":            []gin.H{},
        "by_type":              []gin.H{},
        "by_tag":               []gin.H{},
        "by_priority":          []gin.H{},
        "by_item_kind":         []gin.H{},  // ← 新增
        "avg_processing_hours": 0,
    })
    return
}
```

### 前端改动

#### 1. 添加附件统计区块

在 `sections` 数组中添加：

```javascript
const sections = ref([
  { key: 'status', title: '按状态统计', data: [], labelProp: 'status', labelName: '状态' },
  { key: 'type', title: '按类型统计', data: [], labelProp: 'type_code', labelName: '类型' },
  { key: 'priority', title: '按优先级统计', data: [], labelProp: 'priority', labelName: '优先级' },
  { key: 'tag', title: '按标签统计', data: [], labelProp: 'tag_name', labelName: '标签' },
  { key: 'item_kind', title: '按附件类型统计', data: [], labelProp: 'kind', labelName: '附件类型' }  // ← 新增
])
```

#### 2. 更新数据获取

```javascript
const fetchStatistics = async () => {
  statsLoading.value = true
  try {
    const res = await getSharedWorkOrderStatistics(token)
    stats.value = res
    sections.value[0].data = res.by_status || []
    sections.value[1].data = res.by_type || []
    sections.value[2].data = res.by_priority || []
    sections.value[3].data = res.by_tag || []
    sections.value[4].data = res.by_item_kind || []  // ← 新增
    nextTick(() => renderCharts())
  } catch (e) {
    ElMessage.error(e.message || '获取统计数据失败')
  } finally {
    statsLoading.value = false
  }
}
```

#### 3. 添加附件类型标签显示

```vue
<el-table-column :prop="section.labelProp" :label="section.labelName" width="150">
  <template #default="{ row }">
    <el-tag v-if="section.key === 'status'" :type="statusType(row[section.labelProp])">
      {{ statusLabel(row[section.labelProp]) }}
    </el-tag>
    <span v-else-if="section.key === 'item_kind'">{{ itemKindLabel(row[section.labelProp]) }}</span>
    <span v-else>{{ row[section.labelProp] }}</span>
  </template>
</el-table-column>
```

#### 4. 更新图表渲染

```javascript
const data = section.data.map(item => {
  let name = item[section.labelProp]
  if (section.key === 'status') {
    name = statusLabel(name)
  } else if (section.key === 'item_kind') {
    name = itemKindLabel(name)  // ← 新增
  }
  return { value: item.count, name }
})
```

## 功能说明

### 附件类型
统计报告会显示以下附件类型的分布：
- **照片（photo）** - 工单采集的照片
- **视频（video）** - 工单采集的视频
- **录屏（screen_record）** - 屏幕录制
- **语音（voice）** - 语音记录
- **日志（logcat）** - 日志文件
- **文字（text）** - 文本内容
- **资源（resource）** - 其他资源文件

### 展示内容
- **统计表格**：显示每种附件类型的数量和占比
- **饼图**：直观展示附件类型的分布
- **中文标签**：使用 `itemKindLabel()` 函数将英文类型转换为中文显示

### 统计逻辑
- 统计所有符合筛选条件的工单中的附件
- 按附件类型（`kind` 字段）分组统计
- 按数量降序排列
- 如果没有附件，该区块仍然显示（表格和图表为空）

## 数据流

### 后端统计流程
```
查询工单 ID 列表（基于筛选条件）
    ↓
查询附件表 (work_order_items)
    ↓
按 kind 字段分组统计
    ↓
返回 by_item_kind 数组
```

### SQL 查询示例
```sql
SELECT kind, COUNT(*) as count 
FROM work_order_items 
WHERE work_order_id IN (1, 2, 3, ...) 
GROUP BY kind 
ORDER BY count DESC
```

### 返回数据格式
```json
{
  "total": 100,
  "by_status": [...],
  "by_type": [...],
  "by_tag": [...],
  "by_priority": [...],
  "by_item_kind": [
    { "kind": "photo", "count": 45 },
    { "kind": "video", "count": 20 },
    { "kind": "voice", "count": 15 },
    { "kind": "screen_record", "count": 10 },
    { "kind": "logcat", "count": 5 }
  ],
  "avg_processing_hours": 12.5
}
```

## 展示效果

### 统计表格
```
┌──────────┬────────┬────────┐
│ 附件类型 │ 数量   │ 占比   │
├──────────┼────────┼────────┤
│ 照片     │ 45     │ 47.4%  │
│ 视频     │ 20     │ 21.1%  │
│ 语音     │ 15     │ 15.8%  │
│ 录屏     │ 10     │ 10.5%  │
│ 日志     │ 5      │ 5.3%   │
└──────────┴────────┴────────┘
```

### 饼图
- 环形饼图（内外半径 40%-70%）
- 显示百分比和数量
- 图例位于右侧，垂直排列
- 支持滚动（如果类型很多）

## 统计顺序

页面上的统计区块顺序：
1. 按状态统计
2. 按类型统计
3. 按优先级统计
4. 按标签统计
5. **按附件类型统计** ← 新增

## 与主工单统计页面的一致性

该功能同时应用于：
- 主工单统计页面（`GetWorkOrderStatistics`）
- 分享统计报告页面（`GetSharedWorkOrderStatistics`）

两个页面的统计逻辑和展示完全一致。

## 测试场景

### 1. 有附件的工单统计
- ✅ 显示"按附件类型统计"区块
- ✅ 表格显示所有附件类型及数量
- ✅ 饼图正确展示比例
- ✅ 中文标签正确显示

### 2. 无附件的工单统计
- ✅ 仍显示"按附件类型统计"区块
- ✅ 表格为空，显示"暂无数据"
- ✅ 图表区域为空

### 3. 单一附件类型
- ✅ 表格显示该类型，占比 100%
- ✅ 饼图显示单个扇区

### 4. 多种附件类型
- ✅ 按数量降序排列
- ✅ 所有类型占比加起来为 100%
- ✅ 图表颜色区分清晰

### 5. 分享链接筛选
- ✅ 仅统计分享范围内工单的附件
- ✅ 筛选条件正确应用

## 性能优化

### 数据库查询
- 使用 `WHERE work_order_id IN (...)` 批量查询
- 使用 `GROUP BY kind` 在数据库层面统计
- 按 `count DESC` 排序，常见类型优先展示

### 前端渲染
- 使用 `nextTick()` 确保 DOM 渲染后再绘制图表
- 图表懒加载，仅在切换到统计视图时渲染
- 响应式更新，数据变化时自动重绘

## 未来扩展

### 附件大小统计
可以添加附件总大小和平均大小统计：
```go
type itemSizeStat struct {
    Kind      string  `json:"kind"`
    Count     int     `json:"count"`
    TotalSize int64   `json:"total_size"`
    AvgSize   float64 `json:"avg_size"`
}
```

### 按时间维度统计
统计不同时间段的附件上传趋势。

### 附件质量统计
统计照片分辨率、视频时长等质量指标。

## 构建验证
✅ Go 后端构建成功  
✅ Web 前端构建成功

## 相关文件
- `server/api/work_order.go` - 工单统计API
- `server/models/work_order.go` - 工单模型
- `web/src/views/WorkOrderReportShare.vue` - 分享统计页面
- `web/src/api/workOrder.js` - 前端API调用
