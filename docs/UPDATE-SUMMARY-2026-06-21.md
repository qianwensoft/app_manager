# 工单系统功能更新汇总

**更新日期**: 2026-06-21  
**版本**: v1.1

---

## 📋 本次更新内容

### 1. ✅ 业务单号字段 (business_no)

#### 功能范围
- 数据库字段（带索引）
- 后端 API（创建、更新、查询、搜索）
- Web 端界面（显示、编辑、搜索、**二维码生成**）
- Android Agent（输入、提交）
- 工作流/Webhook 占位符支持

#### 快速使用
```bash
# API 创建
POST /api/work-orders
{
  "title": "设备故障",
  "business_no": "BIZ-2026-001"
}

# Webhook 引用
{
  "businessNo": "{{business_no}}"
}
```

---

### 2. ✅ 状态变更说明 (change_comment)

#### 功能范围
- API 支持 comment 参数
- 自动记录到工单时间线
- 外发事件包含 change_comment 字段
- 标签变更自动生成摘要（如：`+紧急 -待定`）
- 工作流/Webhook 占位符支持

#### 快速使用
```bash
# API 状态变更
POST /api/work-orders/:id/status
{
  "status": "closed",
  "comment": "问题已在版本 v2.1.3 中修复"
}

# Webhook 引用
{
  "closeReason": "{{change_comment}}"
}
```

---

### 3. ✅ Android Agent 自动填充标题修复

#### 问题
提交工单后，工单类型的默认标题没有自动填充。

#### 修复
提交成功清空表单后，自动重新填充当前类型的默认标题。

#### 影响
提升用户体验，减少重复输入。

---

### 4. ✅ 业务单号二维码功能 (NEW)

#### 功能
在工单详情页，业务单号存在时显示二维码按钮，点击生成二维码。

#### 使用场景
- 现场验收扫码确认
- 单据关联自动录入
- 移动端快速查询
- 避免手动输入错误

#### 实现
- 与"其他编码"的二维码功能保持一致
- 使用 Element Plus Popover 和 QRCode.js
- 二维码缓存避免重复生成

---

## 📊 可用占位符汇总

在工作流和 Webhook 中可使用的占位符：

### 基础信息
| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{code}}` | 工单编号 | WO-20260621-a1b2c3d4 |
| `{{title}}` | 工单标题 | 设备无法连接 |
| `{{description}}` | 工单描述 | 设备无法连接到服务器... |

### 编号字段
| 占位符 | 说明 | 示例值 | 本次更新 |
|--------|------|--------|----------|
| `{{business_no}}` | **业务单号** | BIZ-2026-001 | **✨ 新增** |
| `{{external_ref}}` | 外部单号 | JIRA-12345 | - |
| `{{other_codes}}` | 其他编码 | QR001,QR002 | - |

### 状态信息
| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{status}}` | 状态代码 | closed |
| `{{status_name}}` | 状态名称 | 已关闭 |
| `{{priority}}` | 优先级代码 | high |
| `{{priority_name}}` | 优先级名称 | 较高 |

### 操作信息
| 占位符 | 说明 | 示例值 | 本次更新 |
|--------|------|--------|----------|
| `{{actor}}` | 操作人 | admin | - |
| `{{change_comment}}` | **变更说明** | 问题已修复 | **✨ 新增** |

### 设备信息
| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{device_id}}` | 设备 ID | 5 |
| `{{device_name}}` | 设备名称 | 测试设备-01 |
| `{{device_serial}}` | 设备序列号 | ABC123456 |

### 标签信息
| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{tags}}` | 标签代码 | urgent,verified |
| `{{tags_names}}` | 标签名称 | 紧急,已验证 |

### 时间信息
| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{created_at}}` | 创建时间 | 2026-06-21T10:00:00Z |
| `{{updated_at}}` | 更新时间 | 2026-06-21T10:30:00Z |
| `{{ts}}` | 事件时间戳 | 2026-06-21T10:35:00Z |

---

## 🗄️ 数据库变更

### 迁移脚本
- **SQLite**: `/server/migrations/sqlite/003_add_work_order_business_no.sql`
- **MySQL**: `/server/migrations/mysql/003_add_work_order_business_no.sql`

### 字段定义
```sql
-- SQLite
ALTER TABLE work_orders ADD COLUMN business_no TEXT;
CREATE INDEX idx_work_orders_business_no ON work_orders(business_no);

-- MySQL
ALTER TABLE work_orders ADD COLUMN business_no VARCHAR(128) DEFAULT '' AFTER priority;
CREATE INDEX idx_work_orders_business_no ON work_orders(business_no);
```

---

## 📦 修改文件清单

### 后端 (Go)
- ✅ `server/models/work_order.go` - 数据模型
- ✅ `server/api/work_order.go` - 工单 API
- ✅ `server/api/work_order_webhook.go` - 事件分发
- ✅ `server/api/work_order_tag.go` - 标签变更
- ✅ `server/api/work_order_webhook_payload_test.go` - 单元测试

### 前端 (Vue)
- ✅ `web/src/views/work-orders/WorkOrderDetail.vue` - 详情页（业务单号编辑 + 二维码）
- ✅ `web/src/views/work-orders/WorkOrders.vue` - 列表页（显示 + 搜索）

### Android Agent (Kotlin)
- ✅ `agent/app/src/main/res/layout/activity_feedback.xml` - 布局
- ✅ `agent/app/src/main/java/com/appmanager/agent/ui/FeedbackActivity.kt` - 提交逻辑 + 自动填充修复

### 数据库迁移
- ✅ `server/migrations/sqlite/003_add_work_order_business_no.sql`
- ✅ `server/migrations/mysql/003_add_work_order_business_no.sql`

---

## ✅ 测试结果

```bash
# 后端编译
✅ 编译成功

# 单元测试
✅ TestWorkOrderEventPayloadStructure - PASS
✅ TestChangeCommentInWebhookPlaceholder - PASS
✅ TestEmptyChangeComment - PASS

# 验证项
✅ business_no 字段在 payload 中
✅ change_comment 字段在 payload 中
✅ 所有占位符可正确解析
✅ JSON 序列化正常
✅ 控制字符自动清理
```

---

## 📚 文档

### 详细文档
1. **完整功能说明**: `/docs/work-order-enhancements.md` (40+ 页)
2. **状态变更说明**: `/docs/work-order-change-comment.md`
3. **发布说明**: `/docs/RELEASE-NOTES-business-no-change-comment.md`
4. **自动填充修复**: `/docs/fix-agent-auto-fill-title.md`
5. **二维码功能**: `/docs/work-order-business-no-qrcode.md`

### 快速参考
- 业务单号占位符: `{{business_no}}`
- 变更说明占位符: `{{change_comment}}`
- API 创建: `POST /api/work-orders` 带 `business_no` 字段
- API 状态变更: `POST /api/work-orders/:id/status` 带 `comment` 参数

---

## 🚀 部署步骤

1. **备份数据库**
   ```bash
   # SQLite
   cp data/app-manager.db data/app-manager.db.backup
   
   # MySQL
   mysqldump -u root -p app_manager > backup.sql
   ```

2. **运行数据库迁移**
   ```bash
   # SQLite
   sqlite3 data/app-manager.db < server/migrations/sqlite/003_add_work_order_business_no.sql
   
   # MySQL
   mysql -u root -p app_manager < server/migrations/mysql/003_add_work_order_business_no.sql
   ```

3. **编译和部署**
   ```bash
   # 编译服务器
   make server
   
   # 编译 Web
   cd web && npm run build
   
   # 编译 Android Agent
   make agent-release
   ```

4. **重启服务**
   ```bash
   # 停止旧服务
   systemctl stop app-manager
   
   # 启动新服务
   systemctl start app-manager
   ```

5. **验证部署**
   - 创建工单时可输入业务单号
   - 状态变更时可添加说明
   - Web 端业务单号显示二维码按钮
   - Android Agent 自动填充标题

---

## 🔄 向后兼容性

- ✅ 旧数据 `business_no` 为空，不影响现有功能
- ✅ 旧 Webhook 配置无需修改
- ✅ 不使用新占位符时为空字符串
- ✅ 现有工单不受影响
- ✅ 外发事件向后兼容

---

## 💡 使用示例

### 示例 1: 钉钉通知（包含新字段）
```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "工单已关闭",
    "text": "## 工单 {{code}} 已关闭\n\n- **业务单号**: {{business_no}}\n- **关闭原因**: {{change_comment}}\n- **处理人**: {{actor}}"
  }
}
```

### 示例 2: JIRA 集成（包含新字段）
```json
{
  "summary": "{{title}}",
  "description": "业务单号：{{business_no}}\n\n{{description}}\n\n处理说明：{{change_comment}}",
  "reporter": "{{actor}}"
}
```

### 示例 3: 审计日志（包含新字段）
```json
{
  "event_type": "work_order_status_change",
  "work_order_code": "{{code}}",
  "business_no": "{{business_no}}",
  "new_status": "{{status_name}}",
  "change_reason": "{{change_comment}}",
  "operator": "{{actor}}",
  "timestamp": "{{ts}}"
}
```

---

## 📞 支持

如有问题，请查阅：
- 详细文档: `/docs/work-order-enhancements.md`
- 测试文件: `/server/api/work_order_webhook_payload_test.go`
- Issue 跟踪: GitHub Issues

---

**状态**: ✅ 所有功能已完成并测试通过  
**可部署**: ✅ 是  
**风险等级**: 🟢 低（完全向后兼容）
