# 外部应用接口/工单外发配置 - 转义字符使用指南

## 概述

在配置外部应用接口（Outbound Endpoint）或工单外发 Webhook 时，参数值支持使用转义字符来表示换行、制表符等特殊字符。

**重要**：转义字符会由 JSON 格式自动处理，无需手动转换。在 JSON 字符串中输入 `\n` 会自动转换为换行符。

## 支持的转义字符

| 转义序列 | 实际字符 | 说明 |
|---------|---------|------|
| `\n` | 换行符 (LF) | Unix/Linux/macOS 标准换行 |
| `\r\n` | 回车换行 (CRLF) | Windows 标准换行 |
| `\r` | 回车符 (CR) | Mac OS 9 及更早版本的换行 |
| `\t` | 制表符 (Tab) | 水平制表符 |
| `\\` | 反斜杠 | 反斜杠字符本身 |

## 工作原理

系统使用 JSON 格式存储和传输配置参数。JSON 规范定义了标准的转义序列：

1. 你在界面输入：`"第一行\n第二行"`
2. 系统存储为 JSON：`{"text": "第一行\\n第二行"}`（JSON 自动添加反斜杠）
3. 调用接口时，JSON 解析器自动将 `\n` 转换为真实换行符
4. 接口收到的值：`第一行<换行>第二行`

**关键点**：你只需要输入 `\n`（单个反斜杠），JSON 会自动处理转义和解析。

## 使用场景

### 1. 外部应用接口参数

在外部应用（Outbound App）的接口参数配置中使用：

**场景：发送多行文本消息**
```json
{
  "title": "设备告警",
  "content": "设备：{{device.name}}\n状态：异常\n时间：{{device_event.created_at}}"
}
```

**实际发送效果：**
```
设备：测试设备001
状态：异常
时间：2026-06-20T12:00:00Z
```

**场景：发送表格式数据**
```json
{
  "message": "设备信息：\n设备ID\t设备名称\t状态\n{{device.id}}\t{{device.name}}\t{{device.status}}"
}
```

**实际发送效果：**
```
设备信息：
设备ID	设备名称	状态
123	测试设备001	online
```

### 2. 工单外发参数

在工单外发 Webhook 配置的参数映射中使用：

**场景：钉钉/企业微信消息推送**
```json
{
  "msgtype": "text",
  "text": {
    "content": "工单提醒\n工单编号：{{code}}\n标题：{{title}}\n状态：{{status}}\n提交人：{{created_by_username}}\n设备：{{device_name}}"
  }
}
```

**场景：发送详细的工单描述（Windows 系统接口）**
```json
{
  "order_no": "{{code}}",
  "description": "【工单详情】\r\n标题：{{title}}\r\n描述：{{description}}\r\n优先级：{{priority}}\r\n\r\n【设备信息】\r\n设备名称：{{device_name}}\r\n设备序列号：{{device_serial}}\r\n设备分组：{{device_group}}"
}
```

### 3. 连接器步骤配置

在连接器（Connector）的 HTTP 步骤中使用：

**场景：POST 请求体包含换行**
```json
{
  "type": "http",
  "config": {
    "method": "POST",
    "url": "https://api.example.com/notify",
    "body": "{\"text\": \"设备事件通知\\n类型：{{device_event.event_type}}\\n数据：{{device_event.event_data}}\"}"
  }
}
```

**场景：CSV 格式数据上传**
```json
{
  "type": "http",
  "config": {
    "method": "POST",
    "headers": {
      "Content-Type": "text/csv"
    },
    "body": "设备ID,设备名称,事件类型,时间\n{{device.id}},{{device.name}},{{device_event.event_type}},{{device_event.created_at}}"
  }
}
```

## 注意事项

### 1. JSON 字符串中只需单个反斜杠

在 JSON 配置界面中输入时，**只需要输入一个反斜杠**：

✅ **正确写法：**
```json
{
  "message": "第一行\n第二行"
}
```

❌ **错误写法（会被当作字面字符串 `\\n`）：**
```json
{
  "message": "第一行\\n第二行"
}
```

### 2. 工作流程

```
用户输入: "第一行\n第二行"
     ↓
JSON 存储: {"text": "第一行\\n第二行"}  (JSON 自动转义)
     ↓
JSON 解析: "第一行\n第二行"  (还原单个 \n)
     ↓
发送到接口: "第一行<真实换行符>第二行"
```

### 3. 反斜杠本身的表示

如果需要在输出中包含反斜杠字符本身，使用 `\\`：

```json
{
  "path": "C:\\Users\\Admin\\Documents"
}
```

**输出：** `C:\Users\Admin\Documents`

### 4. 常见错误

**问题：转义字符没有生效**

可能原因：
- 使用了双反斜杠 `\\n` 而不是单反斜杠 `\n`
- JSON 格式错误，检查引号和逗号

**问题：接口报错 "request body is not valid JSON"**

原因：以前版本的系统会过早处理转义字符，导致 JSON 无效。
解决：升级到最新版本，系统已修复此问题。

## 实际案例

### 案例 1：钉钉机器人消息推送

**工单外发配置：**
```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "工单提醒",
    "text": "### 工单提醒\n\n**工单编号：** {{code}}\n\n**标题：** {{title}}\n\n**状态：** {{status}}\n\n**优先级：** {{priority}}\n\n**提交人：** {{created_by_username}}\n\n**提交设备：** {{device_name}} ({{device_serial}})\n\n**提交时间：** {{created_at}}"
  }
}
```

### 案例 2：生成 CSV 报表

**连接器 HTTP 步骤：**
```json
{
  "method": "POST",
  "url": "https://report.example.com/upload",
  "headers": {
    "Content-Type": "text/csv; charset=utf-8"
  },
  "body": "工单编号,标题,状态,优先级,设备名称,提交时间\n{{code}},{{title}},{{status}},{{priority}},{{device_name}},{{created_at}}"
}
```

### 案例 3：多行日志格式

**接口参数：**
```json
{
  "log_level": "INFO",
  "message": "[{{$datetime()}}] 设备事件\n事件类型: {{device_event.event_type}}\n设备ID: {{device.id}}\n设备名称: {{device.name}}\n事件数据:\n{{device_event.event_data}}"
}
```

## 测试建议

1. **使用调试功能**：在配置完成后，使用"接口调试"功能测试实际发送的内容
2. **查看外发日志**：在工单外发历史中查看实际发送的请求参数
3. **小范围测试**：先在测试环境或单个工单上测试转义字符效果

## 技术实现

转义字符由 JSON 解析器自动处理：

- **外部应用接口**：`server/outbound/render.go` - `expandTemplate()` 函数不再手动处理转义字符
- **工单外发**：`server/api/work_order_webhook.go` - `renderPlaceholders()` 函数依赖 JSON 自动转义
- **连接器步骤**：使用 outbound 包的统一模板渲染

处理流程：
```
配置值 → JSON 存储（自动转义）→ 占位符替换 → 函数求值 → JSON 解析（自动还原）→ 最终输出
```

### 版本说明

**旧版本问题（已修复）**：
- 旧版本在生成 JSON body 之前会手动将 `\n` 转换为真实换行符
- 导致 JSON 字符串包含真实换行符，破坏 JSON 格式
- 错误信息：`request body is not valid JSON`

**新版本修复**：
- 移除了手动转义处理，完全依赖 JSON 规范
- `\n` 在 JSON 字符串中保持为转义序列
- JSON 解析时自动转换为真实换行符
- 完全符合 JSON 标准，不会出现格式错误
