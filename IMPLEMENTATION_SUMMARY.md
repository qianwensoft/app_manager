# 工单外发配置占位符增强 - 实现总结

## 改动概述

为工单外发配置的占位符系统增加了**标签名称**、**状态名称**、**优先级名称**三个新字段，让外发时可以使用中文名称而非编码。

## 修改的文件

### 后端 (3个改动)

**server/api/work_order_webhook.go**
- ✅ 新增 `workOrderTagNames()` - 查询标签名称列表
- ✅ 新增 `workOrderStatusName()` - 状态编码转中文名称
- ✅ 新增 `workOrderPriorityName()` - 优先级编码转中文名称
- ✅ 在 `workOrderEventPayload()` 中添加 `tags_names`、`status_name`、`priority_name` 三个字段

**server/api/work_order_webhook_test.go** (新建)
- ✅ 单元测试验证状态和优先级名称转换

### 前端 (2个改动)

**web/src/views/work-orders/workOrderConst.js**
- ✅ 在 `workOrderEventParams` 中添加 `tags_names`、`status_name`、`priority_name` 参数定义
- ✅ 更新原有字段标签，区分「编码」和「名称」

**web/src/views/work-orders/WorkOrderWebhooks.vue**
- ✅ 更新占位符帮助提示，说明编码/名称的区别
- ✅ 更新常用示例，使用名称占位符
- ✅ 更新下拉框中的多参数拼接示例

## 新增占位符对照表

| 字段类型 | 编码占位符 | 名称占位符 | 示例输出（编码） | 示例输出（名称） |
|---------|-----------|-----------|----------------|----------------|
| 标签 | `{{tags}}` | `{{tags_names}}` | `urgent,hardware` | `紧急,硬件故障` |
| 状态 | `{{status}}` | `{{status_name}}` | `open` | `待处理` |
| 优先级 | `{{priority}}` | `{{priority_name}}` | `urgent` | `紧急` |

## 使用示例

### 企业微信消息通知
```json
{
  "msgtype": "text",
  "text": {
    "content": "【{{priority_name}}】工单 {{code}}\n状态：{{status_name}}\n标签：{{tags_names}}"
  }
}
```

输出：
```
【紧急】工单 WO-20260620-001
状态：处理中
标签：硬件故障,网络问题
```

## 测试验证

```bash
# 后端测试
cd server
go test ./api -run "TestWorkOrderStatusName|TestWorkOrderPriorityName" -v

# 前端构建验证
cd web
npm run build
```

✅ 所有测试通过

## 技术细节

1. **标签名称查询优化**：使用批量查询避免 N+1 问题
2. **未知值处理**：如果标签/状态/优先级找不到映射，返回原始编码
3. **向后兼容**：保留原有的编码占位符，新增名称占位符
4. **前端体验**：下拉框分类展示、智能提示、一键复制

## 文档

详细使用文档：`docs/work-order-webhook-placeholders.md`
