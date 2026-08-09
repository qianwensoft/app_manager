# 测试串口扫码枪工作流

## 概述

本文档说明如何在 SCADA 编辑器中创建和测试 **Web Serial API 串口扫码** 功能。

## 前提条件

1. ✅ 使用支持 Web Serial API 的浏览器（Chrome 89+, Edge 89+, Opera 75+）
2. ✅ 访问地址必须是 `http://localhost:5174` 或 `https://` 开头
3. ✅ 准备好 USB 串口扫码枪（或 USB-to-Serial 转换器）

## 串口扫码数据流

```
USB 串口扫码枪
    ↓ (USB/RS232)
Web Serial API
    ↓ (SerialScanner 解析)
window.scadaEventBus.emit('agent_scan', {
  value: "扫码内容",
  event_type: "barcode",
  device_id: "web-serial"
})
    ↓
useWorkflowRuntime 监听
    ↓
触发 agent_scan 类型的工作流
    ↓
执行动作（显示文本、调用接口等）
```

## 步骤 1：创建测试画布

1. 打开 SCADA 编辑器：`http://localhost:5174/scada-editor/`
2. 创建或打开一个项目
3. 在画布上添加一个**文本组件**
   - 设置 ID：`scan_result_text`
   - 显示文本：`等待扫码...`

## 步骤 2：创建 agent_scan 工作流

### 方式 A：通过 UI（推荐）

1. 点击编辑器左侧或顶部的 **"工作流"** 面板
2. 点击 **"+ 新建工作流"**
3. 配置工作流：

**基本信息：**
- 名称：`串口扫码测试`
- 作用域：`canvas`（当前画布）
- 启用：✅

**触发源（Source）：**
- 类型：`agent_scan`
- Device ID：留空（接收所有设备）
- Scan Type：`any`（接收所有类型：barcode/qrcode/nfc）

**动作（Actions）：**

动作 1 - 显示扫码结果：
```json
{
  "type": "set_element_prop",
  "elementId": "scan_result_text",
  "propName": "text",
  "value": "{{$trigger.value}}"
}
```

动作 2（可选）- Toast 提示：
```json
{
  "type": "show_toast",
  "message": "扫到：{{$trigger.value}}"
}
```

动作 3（可选）- 控制台输出：
```json
{
  "type": "run_script",
  "script": "console.log('扫码数据:', $trigger)"
}
```

### 方式 B：通过 JSON 配置

如果 UI 支持导入 JSON，可以使用以下配置：

```json
{
  "id": "wf_serial_scan_test",
  "name": "串口扫码测试",
  "scope": "canvas",
  "source": {
    "kind": "agent_scan",
    "scanType": "any"
  },
  "actions": [
    {
      "type": "set_element_prop",
      "elementId": "scan_result_text",
      "propName": "text",
      "value": "{{$trigger.value}}"
    },
    {
      "type": "show_toast",
      "message": "扫到：{{$trigger.value}}"
    },
    {
      "type": "run_script",
      "script": "console.log('Scan event:', $trigger); console.log('Value:', $trigger.value); console.log('Type:', $trigger.event_type); console.log('Device:', $trigger.device_id);"
    }
  ],
  "enabled": true
}
```

## 步骤 3：连接串口扫码枪

1. 将 USB 串口扫码枪插入电脑
2. 点击 SCADA 编辑器右上角的 **串口扫码枪按钮**（终端图标）
3. 选择：
   - **已授权串口**：如果之前已授权，直接选择
   - **+ 添加新串口**：首次使用，浏览器会弹出设备选择器
4. 选择你的串口设备，点击"连接"
5. 按钮变为绿色 ✅ 表示连接成功

## 步骤 4：测试扫码

1. 切换到 **预览模式**（或直接在编辑器中测试）
2. 使用串口扫码枪扫描任意条码/二维码
3. 观察效果：
   - ✅ 文本组件 `scan_result_text` 应该显示扫码内容
   - ✅ Toast 提示显示"扫到：xxx"
   - ✅ 浏览器控制台打印扫码数据

## 触发源上下文变量

在 `agent_scan` 工作流中，可以使用以下上下文变量：

| 变量 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `$trigger.value` | string | 扫码内容 | `"1234567890"` |
| `$trigger.event_type` | string | 扫码类型 | `"barcode"`, `"qrcode"`, `"nfc"` |
| `$trigger.device_id` | string \| number | 设备 ID | `"web-serial"` (串口) / `123` (Agent) |

## 常见问题

### Q1: 按钮显示灰色禁用状态

**原因：** 浏览器不支持 Web Serial API

**解决：**
- 确保使用 Chrome 89+ / Edge 89+ / Opera 75+
- 检查访问地址是 `localhost` 或 `https://`
- Firefox 和 Safari 不支持

### Q2: 点击按钮没有反应

**原因：** 可能在非安全上下文中（局域网 IP）

**解决：**
- 使用 `http://localhost:5174` 而不是 `http://192.168.x.x:5174`
- 或配置 HTTPS

### Q3: 选择串口后连接失败

**原因：** 串口被其他程序占用

**解决：**
- 关闭其他串口终端程序（如 putty、minicom）
- 重新插拔 USB 串口设备
- 检查串口权限（Linux/Mac 可能需要 sudo）

### Q4: 扫码后没有触发工作流

**检查清单：**
1. ✅ 工作流已启用（`enabled: true`）
2. ✅ 工作流作用域匹配（`scope: 'canvas'` 或 `'global'`）
3. ✅ 串口扫码枪已连接（按钮显示绿色）
4. ✅ 浏览器控制台没有报错
5. ✅ 打开控制台，执行以下测试：

```javascript
// 测试事件总线是否存在
window.scadaEventBus

// 手动触发一个测试事件
window.scadaEventBus.emit('agent_scan', {
  value: 'TEST123',
  event_type: 'barcode',
  device_id: 'web-serial'
})
```

### Q5: 扫码内容不完整

**原因：** 扫码枪发送速度过快或波特率不匹配

**解决：**
- 默认配置：9600 波特率，\r\n 结束符
- 如需自定义，修改 `serialScanner.ts` 中的 `DEFAULT_CONFIG`
- 或通过配置参数传入：

```typescript
connectSerialScanner({
  baudRate: 115200,
  delimiter: '\r\n',
  minLength: 3
})
```

## 高级示例

### 示例 1：根据扫码类型执行不同动作

使用 `condition` 动作或 DAG 图：

```json
{
  "name": "分类处理扫码",
  "source": { "kind": "agent_scan" },
  "graph": {
    "nodes": [
      { "id": "start", "kind": "start" },
      {
        "id": "check_type",
        "kind": "condition",
        "label": "判断类型"
      },
      {
        "id": "handle_barcode",
        "kind": "tool",
        "action": {
          "type": "show_toast",
          "message": "条码：{{$trigger.value}}"
        }
      },
      {
        "id": "handle_qrcode",
        "kind": "tool",
        "action": {
          "type": "show_toast",
          "message": "二维码：{{$trigger.value}}"
        }
      }
    ],
    "edges": [
      { "source": "start", "target": "check_type" },
      {
        "source": "check_type",
        "target": "handle_barcode",
        "condition": { "type": "expr", "expr": "$trigger.event_type === 'barcode'" }
      },
      {
        "source": "check_type",
        "target": "handle_qrcode",
        "condition": { "type": "expr", "expr": "$trigger.event_type === 'qrcode'" }
      }
    ]
  }
}
```

### 示例 2：调用接口查询商品信息

```json
{
  "name": "扫码查询商品",
  "source": { "kind": "agent_scan", "scanType": "barcode" },
  "actions": [
    {
      "type": "call_interface",
      "interfaceId": "query_product",
      "params": {
        "barcode": "{{$trigger.value}}"
      },
      "resultVar": "product"
    },
    {
      "type": "set_element_prop",
      "elementId": "product_name_text",
      "propName": "text",
      "value": "{{$ctx.product.name}}"
    },
    {
      "type": "set_element_prop",
      "elementId": "product_price_text",
      "propName": "text",
      "value": "¥{{$ctx.product.price}}"
    }
  ]
}
```

### 示例 3：扫码控制画布切换

```json
{
  "name": "扫码跳转",
  "source": { "kind": "agent_scan" },
  "when": {
    "type": "expr",
    "expr": "$trigger.value.startsWith('CANVAS_')"
  },
  "actions": [
    {
      "type": "run_script",
      "script": "const canvasId = parseInt($trigger.value.replace('CANVAS_', '')); $actions.switchCanvas(canvasId);"
    }
  ]
}
```

## 调试技巧

### 1. 控制台监控

打开浏览器控制台，执行：

```javascript
// 监听所有扫码事件
window.scadaEventBus.on('agent_scan', (data) => {
  console.log('🔍 扫码事件:', data)
})

// 查看当前串口连接状态
window.serialScanner?.isConnected()

// 查看已授权串口
navigator.serial.getPorts().then(ports => {
  console.log('已授权串口:', ports)
  ports.forEach(port => {
    console.log('  -', port.getInfo())
  })
})
```

### 2. 检查工作流注册

```javascript
// 查看当前画布的工作流运行时（需要在 React DevTools 中找到组件）
// 或者在工作流动作中输出：
{
  "type": "run_script",
  "script": "console.log('触发上下文:', $trigger); console.log('全局上下文:', $global); console.log('画布上下文:', $canvas);"
}
```

### 3. 模拟扫码事件

无需真实扫码枪，直接在控制台触发：

```javascript
// 模拟条码扫码
window.scadaEventBus.emit('agent_scan', {
  value: '6901234567890',
  event_type: 'barcode',
  device_id: 'web-serial'
})

// 模拟二维码扫码
window.scadaEventBus.emit('agent_scan', {
  value: 'https://example.com',
  event_type: 'qrcode',
  device_id: 'web-serial'
})
```

## 串口配置参考

常见扫码枪串口参数：

| 品牌/型号 | 波特率 | 数据位 | 停止位 | 校验位 | 结束符 |
|-----------|--------|--------|--------|--------|--------|
| 通用扫码枪 | 9600 | 8 | 1 | None | `\r\n` |
| Honeywell | 9600 | 8 | 1 | None | `\r` |
| Zebra | 115200 | 8 | 1 | None | `\r\n` |
| Datalogic | 9600 | 8 | 1 | None | `\n` |

如需修改配置，编辑 `serialScanner.ts:42-49`：

```typescript
const DEFAULT_CONFIG: Required<SerialScannerConfig> = {
  baudRate: 9600,     // 根据扫码枪调整
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  delimiter: '\r\n',  // 根据扫码枪调整
  scanType: 'barcode',
  minLength: 3,       // 过滤噪音数据
}
```

## 生产环境注意事项

1. **HTTPS 强制要求**
   - 生产环境必须使用 HTTPS
   - 开发环境只有 localhost 可以使用 HTTP

2. **权限持久化**
   - 串口授权绑定到域名
   - 用户清除浏览器数据会丢失授权

3. **错误处理**
   - 工作流中添加错误处理动作
   - 串口断开时显示重连提示

4. **安全考虑**
   - 验证扫码数据格式
   - 防止 SQL 注入（如果扫码内容用于数据库查询）
   - 限制扫码触发频率（防止重复扫描）

## 相关文档

- [Web Serial API 串口选择功能](./web-serial-port-selection.md)
- [SCADA 工作流引擎](../scada-editor/README.md)
- [工作流动作参考](./workflow-actions.md)

## 技术支持

如遇问题，请提供：
1. 浏览器版本（chrome://version）
2. 访问的 URL
3. 浏览器控制台错误信息
4. 串口扫码枪型号和参数
