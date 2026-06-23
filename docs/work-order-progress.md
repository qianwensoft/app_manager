# 工单进展功能

## 改动时间
2026-06-22

## 功能概述

为工单系统新增「进展记录」功能，支持Web端和App端添加处理进展，不记入历史时间线，独立展示。

## 数据库改动

### 新增表

#### 1. `work_order_progress` - 工单进展记录表
```sql
- id: 主键
- work_order_id: 工单ID（索引）
- content: 进展内容（文本，必填）
- created_by: 创建人user_id（0表示设备/系统，索引）
- creator_name: 创建人名称快照
- created_at: 创建时间
```

#### 2. `work_order_progress_attachments` - 工单进展附件表
```sql
- id: 主键
- progress_id: 进展记录ID（索引）
- file_name: 文件名
- file_path: 文件路径
- file_size: 文件大小
- kind: 附件类型（photo|video|audio|screen_record|voice|logcat）
- content_type: MIME类型
- meta_json: 扩展信息（时长、分辨率等）
- created_at: 创建时间
```

### 迁移文件
- SQLite: `server/migrations/sqlite/005_add_work_order_progress.sql`
- MySQL: `server/migrations/mysql/005_add_work_order_progress.sql`

## 后端API

### 进展管理

1. **GET /api/work-orders/:id/progress**
   - 获取工单进展列表（含附件）
   - 权限：FormRuntimeAuthMiddleware（JWT或device-token）
   - 返回：进展列表，倒序（最新在前）

2. **POST /api/work-orders/:id/progress**
   - 新增工单进展
   - 请求体：`{ content: string }`
   - 权限：FormRuntimeAuthMiddleware
   - 返回：新建的进展记录

3. **POST /api/work-orders/progress/:progress_id/attachments**
   - 上传进展附件
   - 请求体：FormData
     - file: 文件
     - kind: 附件类型（photo|video|audio|screen_record|voice|logcat）
     - meta_json: 可选扩展信息
   - 权限：FormRuntimeAuthMiddleware
   - 返回：附件记录

4. **GET /api/work-orders/progress/attachments/:att_id/download**
   - 下载进展附件
   - 权限：FormRuntimeAuthMiddleware
   - 返回：文件流

### 代码位置
- 模型：`server/models/work_order.go`
- API：`server/api/work_order.go:1319-1464`
- 路由：`server/api/router.go:502-505`

## 前端实现

### Web端（工单详情页）

#### 功能位置
- 文件：`web/src/views/work-orders/WorkOrderDetail.vue`
- 位置：右侧栏「处理操作」区域下方

#### 功能特性
1. 进展列表展示
   - 倒序展示（最新在前）
   - 显示创建人、创建时间、内容
   - 显示附件（图片预览、视频/音频播放器、下载链接）

2. 新增进展对话框
   - 文本框输入进展内容（必填）
   - 文件上传组件（多选，支持图片/视频/音频）
   - 保存后自动上传附件

3. 附件展示
   - 图片：内联缩略图 + 点击新标签打开
   - 视频/录屏：内联播放器（controls）
   - 音频/录音：内联播放器
   - 日志：下载链接

#### API封装
- 文件：`web/src/api/workOrder.js`
- 函数：
  - `getWorkOrderProgress(id)` - 获取进展列表
  - `createWorkOrderProgress(id, content)` - 新增进展
  - `uploadWorkOrderProgressAttachment(progressId, file, kind, metaJSON)` - 上传附件
  - `workOrderProgressAttachmentDownloadUrl(attId)` - 附件下载URL

## App端支持

### 支持的附件类型
- **photo** - 拍照图片
- **video** - 录制视频
- **audio** - 录制音频
- **screen_record** - 录屏
- **voice** - 录音
- **logcat** - App日志

### 使用场景
1. **补充说明**：用户在App端提交工单后，可继续添加进展补充问题描述
2. **催单**：用户可在App端查看工单进展，并添加催单留言
3. **现场取证**：支持拍照、录像、录音等多种采集方式

### 实现建议
App端可复用工单提交的附件上传逻辑，调用相同的进展API：
1. 创建进展记录（POST `/api/work-orders/:id/progress`）
2. 上传附件（POST `/api/work-orders/progress/:progress_id/attachments`）

## 与时间线的区别

### 工单进展（Progress）
- **用途**：处理进度更新、补充说明、催单
- **特点**：可添加附件（图片/视频/音频等）
- **展示**：独立区域，倒序展示
- **记录内容**：自由文本 + 富媒体附件

### 处理时间线（Activity）
- **用途**：审计记录、状态变更、系统操作
- **特点**：系统自动生成，不可编辑
- **展示**：时间线格式，倒序展示
- **记录内容**：操作类型、状态变更、操作人

## 注意事项

1. **权限控制**：进展API使用 `FormRuntimeAuthMiddleware`，支持JWT和device-token两种认证方式
2. **文件存储**：附件保存到 `uploads/work_order_progress/` 目录
3. **性能优化**：进展列表批量查询附件，避免N+1查询
4. **不计入时间线**：进展记录不会在 `work_order_activities` 表中生成记录

## 测试建议

1. Web端测试
   - 创建工单后添加进展
   - 上传不同类型的附件（图片/视频/音频）
   - 查看附件预览和下载功能

2. App端测试（待实现）
   - 使用device-token认证添加进展
   - 测试拍照、录像、录音功能
   - 测试录屏和日志上传

3. 并发测试
   - 多人同时添加进展
   - 大附件上传测试

## 未来扩展

1. **进展编辑/删除**：当前仅支持新增，可考虑添加编辑和删除功能
2. **@提醒**：进展中支持@某人，发送通知
3. **进展模板**：常用进展内容模板化
4. **附件压缩**：大图片/视频自动压缩
5. **富文本编辑器**：支持格式化文本、代码块等
