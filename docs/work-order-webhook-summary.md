# 工单外发配置参数映射增强 - 完整更新说明

## 更新时间
2026-06-20

## 更新内容总览

本次更新大幅增强了工单外发配置功能，主要包括：
1. ✅ 支持多参数拼接
2. ✅ 新增 60+ 个可用占位符字段
3. ✅ 支持转义字符（`\n`、`\r\n`、`\t` 等）
4. ✅ UI 交互大幅优化（占位符帮助面板、分组选择）
5. ✅ 新增标签变更事件（`work_order.tags_changed`）
6. ✅ 创建工单时支持提交标签
7. ✅ App 端支持修改工单内容和标签

---

## 一、多参数拼接支持

### 功能说明

参数值现在支持三种形式：

1. **单个占位符**（保留原始类型）
   ```json
   {"work_order_id": "{{id}}"}
   ```
   → 返回数字 `123`

2. **多个占位符拼接**
   ```json
   {"external_code": "{{code}}_{{device_id}}_{{status}}"}
   ```
   → 返回字符串 `"WO-20260620-abc123_456_open"`

3. **混合文本和占位符**
   ```json
   {"title": "【{{priority}}】{{title}}"}
   ```
   → 返回字符串 `"【high】设备无法启动"`

### 实现细节

**后端**：`server/api/work_order_webhook.go` 的 `renderPlaceholders` 函数
- 单个占位符：保留原始类型（数字、布尔、时间等）
- 多参数或混合文本：字符串替换后返回

---

## 二、新增 60+ 个占位符字段

### 字段分类

#### 1. 工单基础信息（17 个）
- `event`, `id`, `code`, `type_code`, `type_name`, `type_description`
- `title`, `description`, `status`, `priority`, `visibility`
- `external_ref`, `other_codes`, `data_json`, `tags`
- `archived`, `actor`

#### 2. 设备快照（5 个）
提交时刻的设备信息，用于审计：
- `device_id`, `device_name`, `device_alias_server`, `device_alias_agent`, `device_group`

#### 3. 设备实时（11 个）
当前最新的设备信息：
- `device_serial`, `device_name_current`
- `device_alias_server_current`, `device_alias_agent_current`, `device_group_current`
- `device_model`, `device_brand`, `device_os_version`
- `device_status`, `device_ip`, `device_battery`

#### 4. 提交用户（4 个）
- `created_by_id`, `created_by_username`, `created_by_role`, `submitter`

#### 5. 分配人（2 个）
- `assigned_to_id`, `assigned_to_username`

#### 6. 关闭人（3 个）
- `closed_by_id`, `closed_by_username`, `closed_at`

#### 7. 归档人（3 个）
- `archived_by_id`, `archived_by_username`, `archived_at`

#### 8. 时间信息（3 个）
- `created_at`, `updated_at`, `ts`

### 实现细节

**后端**：`server/api/work_order_webhook.go` 的 `workOrderEventPayload` 函数
- 实时查询用户、设备、工单类型等关联信息
- 区分快照字段和实时字段

**前端**：`web/src/views/work-orders/workOrderConst.js`
- 定义所有占位符常量
- 按分类组织（`workOrderEventParamsByCategory`）

---

## 三、转义字符支持

### 支持的转义字符

| 转义字符 | 说明 | 用途 |
|---------|------|------|
| `\n` | 换行 | Unix/Linux 换行 |
| `\r\n` | 回车换行 | Windows 换行 |
| `\r` | 回车 | Mac 旧系统换行 |
| `\t` | 制表符 | 缩进对齐 |
| `\\` | 反斜杠 | 转义反斜杠本身 |

### 使用示例

```json
{
  "description": "设备信息：\n型号：{{device_model}}\n品牌：{{device_brand}}\n\n工单信息：\n标题：{{title}}"
}
```

实际输出（会换行）：
```
设备信息：
型号：SM-G9900
品牌：samsung

工单信息：
标题：设备无法启动
```

### 实现细节

**后端**：`server/api/work_order_webhook.go` 的 `unescapeString` 函数
- 按顺序处理转义字符，避免重复替换
- 支持 `\r\n`、`\n`、`\r`、`\t`、`\\`

---

## 四、UI 交互优化

### 1. 占位符帮助面板

**新增功能**：
- 点击"查看所有占位符"按钮打开帮助对话框
- 按分类 Tab 展示所有占位符
- 每个占位符旁有"复制"按钮
- 提供常用示例 Tab

**实现**：`web/src/views/work-orders/WorkOrderWebhooks.vue`
- 新增 `showParamHelper` 对话框
- `copyToClipboard` 方法使用 Clipboard API

### 2. 分组下拉选择

**优化点**：
- 占位符按分类分组显示（基础信息、设备快照、设备实时等）
- 显示中文说明和占位符格式
- 提供多参数拼接示例选项

### 3. 帮助文本

- 主界面提示占位符格式
- JSON 模式下提示支持多参数拼接
- 转义字符使用说明

---

## 五、标签变更事件

### 新增事件

**事件名称**：`work_order.tags_changed`

**触发时机**：
- 调用 `PUT /api/work-orders/:id/tags` 修改工单标签时
- Web 端编辑标签
- App 端管理标签

### 实现细节

**后端**：`server/api/work_order_tag.go` 的 `SetWorkOrderTags` 函数
```go
// 触发标签变更事件
dispatchWorkOrderEvent("work_order.tags_changed", &wo, actorLabel(c))
```

**前端**：`web/src/views/work-orders/workOrderConst.js`
- 新增 `work_order.tags_changed` 到事件列表

### 可用字段

标签变更事件的 payload 包含：
- `tags`：当前工单的所有标签（逗号分隔）
- 所有其他工单字段（60+ 个占位符）

---

## 六、创建工单时提交标签

### API 更新

**接口**：`POST /api/work-orders`

**新增参数**：
```json
{
  "title": "工单标题",
  "description": "描述",
  "tags": ["urgent", "hardware"]  // ← 新增
}
```

### 实现细节

**后端**：`server/api/work_order.go`
- `CreateWorkOrder` 函数新增 `Tags []string` 字段
- 调用 `attachInitialTags` 函数挂载标签
- 批量查询标签字典获取名称快照

**流程**：
1. 创建工单
2. 挂载标签（去重、查字典名、创建关联表记录）
3. 触发 `work_order.created` 事件（payload 中已包含 tags）

---

## 七、App 端修改工单内容

### 新增 API

**接口**：`PUT /api/work-orders/mine/:id`

**功能**：允许 device-token 修改本设备提交的工单

**支持修改字段**：
- `title` - 工单标题
- `description` - 工单描述
- `other_codes` - 其他编码

**限制**：
- 仅能修改本设备的工单
- 已关闭的工单不能修改
- 每次修改记入时间线

### 实现细节

**后端**：`server/api/work_order.go`
- 新增 `UpdateMyWorkOrder` 函数
- 权限校验：`wo.DeviceID == c.GetUint("device_id")`
- 状态校验：`wo.Status != "closed"`
- 记录时间线：每个字段变更单独记录
- 触发事件：`work_order.updated`

**路由**：`server/api/router.go`
```go
woRuntime.PUT("/mine/:id", UpdateMyWorkOrder)
```

### 使用示例

```http
PUT /api/work-orders/mine/123
Authorization: Bearer <device-token>

{
  "title": "新标题",
  "description": "更新的描述",
  "other_codes": "QR001,QR002"
}
```

---

## 八、完整配置示例

### 示例 1：外发到第三方工单系统

```json
{
  "params_json": {
    "title": "【{{priority}}】{{title}}",
    "description": "设备信息：\n型号：{{device_model}}\n品牌：{{device_brand}}\n系统：Android {{device_os_version}}\n电量：{{device_battery}}%\n分组：{{device_group}}\n\n提交人：{{created_by_username}} [{{created_by_role}}]\n\n问题描述：\n{{description}}",
    "external_code": "{{code}}_{{device_id}}_{{type_code}}",
    "reporter_email": "{{created_by_username}}@company.com",
    "tags": "{{tags}},{{priority}},{{type_code}}",
    "custom_field_1": "{{device_serial}}",
    "custom_field_2": "{{device_name}} ({{device_group}})"
  }
}
```

### 示例 2：发送到企业微信/钉钉

```json
{
  "params_json": {
    "msgtype": "markdown",
    "markdown": {
      "content": "## 新工单提醒\n\n**工单编号**：{{code}}\n**标题**：{{title}}\n**优先级**：{{priority}}\n**状态**：{{status}}\n\n**设备信息**\n- 名称：{{device_name}}\n- 序列号：{{device_serial}}\n- 分组：{{device_group}}\n- 电量：{{device_battery}}%\n\n**提交人**：{{created_by_username}}\n**时间**：{{created_at}}"
    }
  }
}
```

---

## 九、文档更新

### 新增文档

1. **`docs/work-order-webhook-params.md`**
   - 所有占位符的完整列表（60+）
   - 每个占位符的说明和示例值
   - 配置示例
   - 注意事项

2. **`docs/work-order-webhook-enhancement.md`**
   - 功能增强说明
   - 技术实现细节
   - 使用示例

---

## 十、向后兼容性

✅ **完全向后兼容**

- 已有配置无需修改
- 旧占位符继续可用
- `submitter` 字段保留作为兼容字段
- 新增字段不影响现有功能

---

## 十一、API 变更总结

### 新增 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/work-orders/mine/:id` | PUT | App 端修改工单内容 |

### 修改的 API

| 接口 | 方法 | 变更 |
|------|------|------|
| `/api/work-orders` | POST | 新增 `tags` 参数支持创建时挂标签 |

### 新增事件

| 事件 | 说明 |
|------|------|
| `work_order.tags_changed` | 标签变更时触发 |

---

## 十二、测试建议

### 功能测试

1. **多参数拼接**
   - 单个占位符保留类型
   - 多个占位符字符串拼接
   - 混合文本和占位符

2. **转义字符**
   - `\n` 换行
   - `\r\n` Windows 换行
   - `\t` 制表符

3. **占位符完整性**
   - 工单基础信息
   - 设备快照 vs 实时字段
   - 用户信息（提交人、分配人、关闭人）

4. **标签功能**
   - 创建工单时提交标签
   - 修改标签触发事件
   - 事件 payload 包含标签

5. **App 端修改**
   - 修改标题、描述、其他编码
   - 权限校验（仅本设备工单）
   - 已关闭工单不可修改
   - 修改记入时间线

### 边界测试

1. **空值处理**：占位符字段不存在或为空
2. **快照字段**：提交后改设备名，验证快照不变
3. **用户删除**：提交用户被删除，占位符为空
4. **转义冲突**：`\\n` 应输出 `\n` 而非换行

---

## 十三、后续改进建议

1. **占位符函数**：`{{upper(device_name)}}`、`{{date_format(created_at)}}`
2. **条件表达式**：`{{priority == 'urgent' ? '紧急' : '普通'}}`
3. **数组遍历**：`{{#each tags}}{{this}},{{/each}}`
4. **在线测试工具**：实时预览占位符替换结果
5. **模板库**：预置常用外发配置模板

---

## 十四、相关文件清单

### 后端（Go）

- `server/api/work_order_webhook.go` - webhook 核心逻辑
- `server/api/work_order.go` - 工单 CRUD + App 端更新
- `server/api/work_order_tag.go` - 标签管理 + 事件触发
- `server/api/router.go` - 路由注册

### 前端（Vue）

- `web/src/views/work-orders/workOrderConst.js` - 占位符常量
- `web/src/views/work-orders/WorkOrderWebhooks.vue` - 外发配置界面

### 文档

- `docs/work-order-webhook-params.md` - 占位符完整列表
- `docs/work-order-webhook-enhancement.md` - 功能增强说明
- `docs/work-order-webhook-summary.md` - 本文档

---

## 十五、总结

本次更新全面增强了工单外发配置的灵活性和易用性：

✅ **功能增强**：多参数拼接、60+ 占位符、转义字符  
✅ **交互优化**：帮助面板、分组选择、一键复制  
✅ **事件完善**：标签变更事件  
✅ **App 支持**：创建时提交标签、修改工单内容  
✅ **完全兼容**：无需修改已有配置  
✅ **文档齐全**：详细的使用说明和示例

用户现在可以构建更复杂、更灵活的工单外发规则，满足各种第三方系统的对接需求。
