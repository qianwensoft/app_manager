# 工单外发配置完整功能更新

## 更新日期
2026-06-20

## 功能清单

### ✅ 1. 多参数拼接支持
- 单个占位符保留原始类型：`"{{id}}"` → `123`
- 多参数拼接：`"{{device_name}}_{{code}}_{{status}}"`
- 混合文本：`"设备：{{device_name}}，状态：{{status}}"`

### ✅ 2. 占位符大幅扩展（60+ 个）
- 工单基础信息（17 个）
- 设备快照（5 个）- 提交时刻冻结，用于审计
- 设备实时（11 个）- 外发时查询最新状态
- 提交用户（4 个）- 包含用户名、角色
- 分配人、关闭人、归档人信息
- 时间信息

### ✅ 3. 转义字符支持
- `\n` - Unix 换行
- `\r\n` - Windows 换行
- `\t` - 制表符
- `\\` - 反斜杠

### ✅ 4. JSON 编辑器智能提示
- 基于 CodeMirror 的专用编辑器组件
- 输入 `{{` 自动触发占位符提示
- 按分类显示所有可用占位符
- 侧边抽屉面板快速插入
- 内置常用模板

### ✅ 5. 标签变更事件
- 新增 `work_order.tags_changed` 事件
- 修改标签时自动触发
- payload 包含完整标签列表

### ✅ 6. 创建工单时提交标签
- API 新增 `tags` 参数
- 自动查询标签字典名称快照
- 支持 Web 端和 App 端

### ✅ 7. App 端修改工单
- 新增 `PUT /api/work-orders/mine/:id`
- 支持修改标题、描述、其他编码
- 权限校验 + 已关闭工单保护
- 变更记入时间线

### ✅ 8. 外发历史记录
- 新增 `work_order_webhook_logs` 表
- 记录每次外发的完整信息
- 支持按 webhook、工单、状态过滤
- 查看请求参数、响应、耗时

### ✅ 9. 降级处理优化
- `created_by_username` 为空时使用 actor
- device-token 提交时正确填充提交人信息

---

## API 变更

### 新增 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/work-orders` | POST | 新增 `tags` 参数 |
| `/api/work-orders/mine/:id` | PUT | App 端修改工单内容 |
| `/api/work-orders/webhooks/logs` | GET | 查看外发历史记录 |
| `/api/work-orders/webhooks/logs/:id` | GET | 查看单条外发日志详情 |

### 新增事件

| 事件 | 说明 |
|------|------|
| `work_order.tags_changed` | 标签变更时触发 |

---

## 数据库变更

### 新增表

**`work_order_webhook_logs`** - 外发日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | 主键 |
| webhook_id | uint | 关联 webhook |
| webhook_name | string | webhook 名称快照 |
| work_order_id | uint | 工单 ID |
| work_order_code | string | 工单编号快照 |
| event | string | 触发事件 |
| target | string | endpoint/connector |
| target_name | string | 目标名称 |
| request_json | text | 请求参数 JSON |
| status | string | pending/success/failed |
| status_code | int | HTTP 状态码 |
| response_body | text | 响应内容（截断 10KB） |
| error_msg | text | 错误信息 |
| duration_ms | int64 | 耗时（毫秒） |
| created_at | timestamp | 创建时间 |

---

## 前端组件

### 新增组件

**`WorkOrderParamsEditor.vue`** - 工单参数映射编辑器
- 基于 CodeMirror 的 JSON 编辑器
- 智能占位符提示（输入 `{{` 触发）
- 侧边抽屉快速插入面板
- 按分类展示占位符
- 常用模板快速插入
- 语法高亮 + JSON 校验

### 更新组件

**`WorkOrderWebhooks.vue`** - 外发配置界面
- JSON 模式使用新编辑器
- 占位符帮助面板
- 支持查看外发日志（待实现前端界面）

---

## 使用示例

### 示例 1：基础配置

```json
{
  "order_no": "{{code}}",
  "title": "{{title}}",
  "status": "{{status}}",
  "device": "{{device_name}}"
}
```

### 示例 2：多参数拼接 + 换行

```json
{
  "title": "【{{priority}}】{{title}}",
  "description": "设备信息：\n型号：{{device_model}}\n品牌：{{device_brand}}\n系统：Android {{device_os_version}}\n电量：{{device_battery}}%\n\n工单信息：\n标题：{{title}}\n优先级：{{priority}}\n状态：{{status}}\n提交人：{{created_by_username}}",
  "external_code": "{{code}}_{{device_id}}_{{type_code}}"
}
```

### 示例 3：完整上下文

```json
{
  "work_order": {
    "code": "{{code}}",
    "title": "{{title}}",
    "status": "{{status}}",
    "priority": "{{priority}}",
    "tags": "{{tags}}"
  },
  "device": {
    "name": "{{device_name}}",
    "serial": "{{device_serial}}",
    "model": "{{device_model}}",
    "group": "{{device_group}}",
    "battery": "{{device_battery}}"
  },
  "reporter": {
    "username": "{{created_by_username}}",
    "role": "{{created_by_role}}"
  }
}
```

---

## 核心代码文件

### 后端（Go）

- `server/models/work_order_webhook_log.go` - 外发日志模型
- `server/api/work_order_webhook.go` - webhook 逻辑 + 日志记录
- `server/api/work_order.go` - 创建工单支持标签 + App 端更新
- `server/api/work_order_tag.go` - 标签变更事件
- `server/api/router.go` - 路由注册
- `server/database/db.go` - 模型注册

### 前端（Vue）

- `web/src/components/WorkOrderParamsEditor.vue` - 参数编辑器
- `web/src/views/work-orders/WorkOrderWebhooks.vue` - 外发配置界面
- `web/src/views/work-orders/workOrderConst.js` - 占位符常量

### 文档

- `docs/work-order-webhook-params.md` - 占位符完整列表
- `docs/work-order-webhook-enhancement.md` - 功能增强说明
- `docs/work-order-webhook-summary.md` - 更新总结
- `docs/work-order-webhook-final.md` - 本文档

---

## 特性亮点

### 🎯 智能编辑体验
- 输入 `{{` 立即弹出占位符提示
- 按分类组织，快速查找
- 显示中文说明和分类信息
- 一键插入常用模板

### 📊 完整可观测性
- 每次外发自动记录日志
- 查看请求参数、响应、耗时
- 按状态筛选成功/失败记录
- 快速定位问题

### 🔄 灵活的数据映射
- 多参数自由拼接
- 支持换行等转义字符
- 类型智能保留
- 60+ 个上下文字段

### 🏷️ 标签完整支持
- 创建时直接提交标签
- 标签变更触发事件
- App 端完整支持
- 事件 payload 包含标签

### 📱 App 端增强
- 创建时提交标签
- 修改工单内容
- 管理标签
- 变更记入时间线

---

## 测试建议

### 功能测试
1. ✅ 多参数拼接
2. ✅ 转义字符（`\n`、`\r\n`、`\t`）
3. ✅ 占位符智能提示
4. ✅ 标签变更事件
5. ✅ 创建工单时提交标签
6. ✅ App 端修改工单
7. ✅ 外发日志记录

### 边界测试
1. ✅ `created_by_username` 为空时降级到 actor
2. ✅ device-token 提交工单
3. ✅ 已关闭工单不可修改
4. ✅ JSON 语法错误提示
5. ✅ 外发失败记录错误

---

## 向后兼容性

✅ **完全向后兼容**
- 已有配置无需修改
- 旧占位符继续可用
- 新字段可选使用
- 无破坏性变更

---

## 后续优化建议

1. **前端外发日志界面** - 可视化查看历史记录
2. **占位符函数** - `{{upper(device_name)}}`、`{{date_format(created_at)}}`
3. **条件表达式** - `{{priority == 'urgent' ? '紧急' : '普通'}}`
4. **重试机制** - 失败自动重试
5. **批量测试** - 一键测试所有 webhook 配置

---

## 总结

本次更新全面增强了工单外发配置的功能性和易用性：

✅ **智能编辑** - CodeMirror + 占位符提示  
✅ **数据丰富** - 60+ 占位符字段  
✅ **灵活映射** - 多参数拼接 + 转义字符  
✅ **完整日志** - 外发历史可追溯  
✅ **标签支持** - 创建/变更/事件完整链路  
✅ **App 增强** - 修改工单 + 标签管理  
✅ **向后兼容** - 无破坏性变更

用户现在可以构建更复杂、更灵活的工单外发规则，享受智能编辑体验，并完整追溯每次外发的历史记录。
