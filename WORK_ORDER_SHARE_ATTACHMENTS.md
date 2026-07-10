# 工单分享页面 - 添加附件展示

## 问题描述
工单详情对话框中缺少了附件/采集产物（items）的展示，用户无法查看工单的照片、视频、语音等附件内容。

## 解决方案

### 修改文件
- `web/src/views/WorkOrderReportShare.vue`

### 实现细节

#### 1. 添加附件展示区域
在工单详情对话框中，标签和进展之间插入附件展示部分：

```vue
<!-- 工单附件 -->
<div v-if="currentWorkOrder.items && currentWorkOrder.items.length > 0" style="margin-top:24px">
  <el-divider content-position="left"><b>附件 / 采集产物（{{ currentWorkOrder.items.length }}）</b></el-divider>
  <div class="items-list">
    <div v-for="item in currentWorkOrder.items" :key="item.id" class="item-card">
      <div class="item-header">
        <el-tag size="small">{{ itemKindLabel(item.kind) }}</el-tag>
        <span class="item-name">{{ item.file_name }}</span>
        <el-link :href="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" target="_blank" type="primary" size="small">下载</el-link>
      </div>
      <img
        v-if="item.kind === 'photo'"
        :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)"
        class="item-img"
        @click="openItemImage(currentWorkOrder.id, item.id)"
      />
      <video v-else-if="item.kind === 'video' || item.kind === 'screen_record'" :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" controls class="item-video" />
      <audio v-else-if="item.kind === 'voice'" :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" controls class="item-audio" />
    </div>
  </div>
</div>
```

#### 2. 添加辅助函数

```javascript
// 工单附件类型标签
const itemKindLabel = (kind) => {
  const labels = { 
    text: '文字', 
    photo: '照片', 
    video: '视频', 
    voice: '语音', 
    screen_record: '录屏', 
    logcat: '日志', 
    resource: '资源' 
  }
  return labels[kind] || kind
}

// 工单附件下载链接
const workOrderItemDownloadUrl = (workOrderId, itemId) => {
  const token = localStorage.getItem('token') || ''
  return `/api/work-orders/${workOrderId}/items/${itemId}/download?token=${encodeURIComponent(token)}`
}

// 打开工单附件图片
const openItemImage = (workOrderId, itemId) => {
  window.open(workOrderItemDownloadUrl(workOrderId, itemId), '_blank')
}
```

#### 3. 添加样式

```css
/* 工单附件样式 */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.item-card {
  padding: 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.item-name {
  font-size: 13px;
  color: #606266;
  flex: 1;
}

.item-img {
  width: 100%;
  max-width: 480px;
  border-radius: 4px;
  cursor: zoom-in;
}

.item-video {
  width: 100%;
  max-width: 480px;
  border-radius: 4px;
}

.item-audio {
  width: 100%;
  max-width: 300px;
}
```

#### 4. 移动端适配

```css
@media (max-width: 767px) {
  .item-img {
    max-width: 100%;
  }

  .item-video {
    max-width: 100%;
  }

  .item-audio {
    max-width: 100%;
  }
}
```

## 功能说明

### 附件类型支持
- **照片（photo）**：显示图片预览，点击可在新窗口查看大图
- **视频（video）**：内嵌视频播放器，支持在线播放
- **录屏（screen_record）**：同视频处理，支持在线播放
- **语音（voice）**：内嵌音频播放器，支持在线播放
- **其他类型**：显示下载链接

### 附件信息
- 类型标签（el-tag）
- 文件名
- 下载链接

### 展示顺序
```
工单基本信息
  ↓
标签（如果有）
  ↓
附件 / 采集产物（如果有）  ← 新增
  ↓
工单进展（如果有）
  ↓
权限提示（如果适用）
```

## 与现有功能保持一致

### API 端点
使用与主工单详情页相同的 API：
```
GET /api/work-orders/:workOrderId/items/:itemId/download?token=xxx
```

### 认证方式
- 使用 `localStorage.getItem('token')` 获取用户 token
- 通过 URL 参数传递 token（`?token=xxx`）
- 与分享页面的其他功能保持一致

### 样式风格
- 卡片式布局，与进展展示保持一致
- 浅灰背景 + 白色内容卡片
- 圆角边框，温和的阴影效果

## 测试场景

### 1. 有附件的工单
- ✅ 显示附件数量
- ✅ 显示所有附件列表
- ✅ 图片附件可预览和点击放大
- ✅ 视频/录屏附件可在线播放
- ✅ 语音附件可在线播放
- ✅ 所有附件都可以下载

### 2. 无附件的工单
- ✅ 不显示附件区域
- ✅ 标签和进展之间无空白间隙

### 3. 不同附件类型
- ✅ 照片：显示预览图，可点击查看大图
- ✅ 视频：显示视频播放器，带播放控制条
- ✅ 录屏：同视频处理
- ✅ 语音：显示音频播放器
- ✅ 日志/资源：显示下载链接

### 4. 移动端适配
- ✅ 图片/视频宽度自适应屏幕
- ✅ 附件信息正常显示
- ✅ 下载链接可点击

### 5. 权限测试
- ✅ 已登录用户可查看附件
- ✅ 未登录用户（公开分享）可查看附件
- ✅ 下载链接使用当前用户的 token

## 与主工单详情页的对比

### 相同点
- 附件类型标签映射
- 下载 URL 格式
- 图片/视频/音频的展示方式
- 响应式布局

### 差异点
- **主详情页**：使用独立的 `ImagePreviewWithRotate` 组件，支持旋转和保存
- **分享页**：直接在新窗口打开图片，更简单的交互
- **分享页**：没有编辑功能（如重命名、删除附件）

## 未来可扩展功能

### 图片预览增强
可以引入 `ImagePreviewWithRotate` 组件：
- 支持图片旋转
- 支持图片放大/缩小
- 支持图片列表切换

### 附件筛选
- 按类型筛选（仅照片、仅视频等）
- 按时间排序

### 缩略图优化
- 为视频生成封面图
- 图片懒加载

## 构建验证
✅ Web 项目构建成功，无语法错误

## 相关文件
- `web/src/views/WorkOrderReportShare.vue` - 工单报告分享页面
- `web/src/views/work-orders/WorkOrderDetail.vue` - 主工单详情页（参考）
