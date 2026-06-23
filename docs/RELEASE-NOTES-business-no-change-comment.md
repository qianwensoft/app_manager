# 工单系统更新摘要

## 更新内容

### 1. 业务单号字段 (business_no)

- ✅ 数据库字段已添加（带索引）
- ✅ 后端 API 支持创建、更新、查询
- ✅ Web 端支持显示、编辑、搜索
- ✅ Android Agent 支持输入
- ✅ 工作流/Webhook 支持 `{{business_no}}` 占位符

### 2. 状态变更说明 (change_comment)

- ✅ 状态变更时可添加说明（comment 参数）
- ✅ 说明自动记录到工单时间线
- ✅ 外发事件中包含 `change_comment` 字段
- ✅ 工作流/Webhook 支持 `{{change_comment}}` 占位符
- ✅ 标签变更自动生成摘要（如：`+紧急 -待定`）

## 快速使用

### 创建工单时设置业务单号

```bash
POST /api/work-orders
{
  "title": "设备故障",
  "business_no": "BIZ-2026-001",
  "device_id": 5
}
```

### 状态变更时添加说明

```bash
POST /api/work-orders/:id/status
{
  "status": "closed",
  "comment": "问题已在版本 v2.1.3 中修复"
}
```

### 在 Webhook 中使用

```json
{
  "params": {
    "orderNo": "{{code}}",
    "businessNo": "{{business_no}}",
    "closeReason": "{{change_comment}}",
    "operator": "{{actor}}"
  }
}
```

## 外发事件示例

```json
{
  "event": "work_order.closed",
  "code": "WO-20260621-001",
  "business_no": "BIZ-2026-001",
  "status": "closed",
  "change_comment": "问题已修复",
  "actor": "admin"
}
```

## 数据库迁移

```bash
# SQLite
/server/migrations/sqlite/003_add_work_order_business_no.sql

# MySQL
/server/migrations/mysql/003_add_work_order_business_no.sql
```

## 测试验证

```bash
cd server
go test ./api -v -run TestWorkOrderEventPayload
```

✅ 所有测试通过

## 向后兼容

- ✅ 旧数据 business_no 为空，不影响现有功能
- ✅ 旧 Webhook 配置无需修改
- ✅ 不使用新字段时为空字符串

## 详细文档

- 完整功能说明：`/docs/work-order-enhancements.md`
- 状态变更说明：`/docs/work-order-change-comment.md`

---

**更新日期**: 2026-06-21  
**状态**: ✅ 开发完成，测试通过
