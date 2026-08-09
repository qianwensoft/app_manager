# Web Serial API 串口选择功能

## 概述

为 SCADA 编辑器的 Web Serial API 功能添加了**已授权串口选择**能力，用户无需每次都弹出设备选择器，可以直接从已授权的串口列表中选择。

## 新增功能

### 1. 已授权串口列表

- 自动获取浏览器已授权的串口设备
- 显示串口的 VendorID 和 ProductID（十六进制格式）
- 支持快速选择已授权串口进行连接

### 2. 串口选择下拉菜单

**SerialScannerPanel（浮动面板）：**
- 展开后显示"已授权串口"下拉框
- 默认选项："+ 添加新串口"（触发 `requestPort()`）
- 已授权串口列表：显示为 "USB (vid:pid)" 或 "串口 N"
- 选择已授权串口后点击"连接扫码枪"直接连接

**SerialScannerButton（工具栏按钮）：**
- `icon-only` 变体：点击未连接状态时弹出菜单
- `default` 变体：点击未连接状态时弹出菜单
- 菜单包含：
  - 已授权串口列表（带图标）
  - "添加新串口"选项（蓝色高亮）
- 点击菜单外部自动关闭

### 3. API 扩展

**新增函数（`serialScanner.ts`）：**

```typescript
// 获取已授权的串口列表
async function getAuthorizedPorts(): Promise<SerialPort[]>

// 使用已授权串口连接（不弹出选择器）
async function connectWithAuthorizedPort(
  port: SerialPort,
  config?: SerialScannerConfig,
  onScan?: (data: string, scanType: string) => void
): Promise<SerialScanner>
```

**SerialScanner 类新增方法：**

```typescript
// 使用已有串口对象连接
async connectWithPort(port: SerialPort): Promise<void>
```

## 使用场景

### 场景 1：首次使用
1. 用户打开 SCADA 预览页面
2. 点击串口扫码枪按钮
3. 选择"添加新串口"
4. 浏览器弹出设备选择器
5. 用户授权串口设备
6. 自动连接

### 场景 2：重复使用
1. 用户再次打开页面
2. 点击串口扫码枪按钮
3. 从已授权串口列表中选择
4. 直接连接（**无需重新授权**）

### 场景 3：多设备切换
1. 用户已授权多个串口设备
2. 下拉菜单显示所有已授权串口
3. 可快速切换不同扫码枪

## 浏览器兼容性

| 浏览器 | Web Serial API | `getPorts()` | 按钮状态 |
|--------|----------------|--------------|----------|
| Chrome 89+ | ✅ | ✅ | 可用 |
| Edge 89+ | ✅ | ✅ | 可用 |
| Opera 75+ | ✅ | ✅ | 可用 |
| Firefox | ❌ | ❌ | 禁用（显示提示） |
| Safari | ❌ | ❌ | 禁用（显示提示） |

**不支持的浏览器行为：**
- 按钮显示为禁用状态（灰色，半透明）
- 图标为"禁止"符号（圆圈加斜线）
- 鼠标悬停显示提示："当前浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+"
- `default` 变体显示文字"串口不可用"

## 技术实现

### 关键点

1. **`navigator.serial.getPorts()`**  
   获取用户已授权的串口列表，无需用户交互

2. **`navigator.serial.requestPort()`**  
   弹出设备选择器，需要用户手势触发（点击事件）

3. **权限持久化**  
   浏览器会记住用户授权的串口，下次访问同一域名时可以直接获取

4. **设备信息识别**  
   通过 `port.getInfo()` 获取 USB VendorID/ProductID 用于显示

### 状态管理

```typescript
const [authorizedPorts, setAuthorizedPorts] = useState<SerialPort[]>([])
const [selectedPortIndex, setSelectedPortIndex] = useState<number>(-1)

// -1 = 添加新串口（requestPort）
// 0+ = 使用已授权串口（connectWithPort）
```

## 测试

### 测试页面

创建了独立测试页面：`/tmp/test-serial-api.html`

功能：
- 检查浏览器 Web Serial API 支持
- 列出已授权串口
- 请求新串口授权
- 显示串口 VendorID/ProductID

### 测试步骤

1. **准备环境**
   ```bash
   # 确保服务运行
   cd scada-editor && npm run dev
   ```

2. **测试串口授权**
   - 打开 `file:///tmp/test-serial-api.html`
   - 点击"请求新串口"
   - 选择串口设备（如果有）
   - 查看已授权列表

3. **测试 SCADA 集成**
   - 打开 `http://localhost:5174/scada-editor/`
   - 点击右下角串口扫码枪浮标
   - 展开面板，查看已授权串口下拉框
   - 选择串口并连接

4. **测试编辑器工具栏**
   - 创建或打开一个 SCADA 项目
   - 点击顶部工具栏的串口按钮
   - 验证弹出菜单显示已授权串口

## 注意事项

### 安全限制

1. **HTTPS 要求**（生产环境）  
   Web Serial API 在非 HTTPS 环境下不可用（localhost 除外）

2. **用户手势要求**  
   `requestPort()` 必须在用户交互（如点击）中调用

3. **权限作用域**  
   串口授权绑定到域名，不同域名需要重新授权

4. **浏览器支持检测**  
   组件会自动检测 `'serial' in navigator`，不支持时显示禁用状态而非隐藏按钮

### 设备兼容性

1. **USB 串口适配器**  
   大部分 USB-to-Serial 转换器可识别 VendorID/ProductID

2. **原生串口**  
   部分原生 RS232 串口可能无 USB 信息，显示为"串口 N"

3. **蓝牙串口**  
   Web Serial API 不支持蓝牙串口

## 文件清单

### 修改文件

- `scada-editor/src/runtime/serialScanner.ts`  
  新增 `getAuthorizedPorts()`、`connectWithAuthorizedPort()` 和 `connectWithPort()`

- `scada-editor/src/components/SerialScannerPanel.tsx`  
  添加已授权串口下拉选择器

- `scada-editor/src/components/SerialScannerButton.tsx`  
  添加串口选择弹出菜单，支持 `icon-only` 和 `default` 变体

### 测试文件

- `/tmp/test-serial-api.html`  
  独立的 Web Serial API 测试页面

## 未来优化

1. **串口昵称**  
   允许用户为串口设备设置自定义名称（存储在 localStorage）

2. **自动连接**  
   记住上次使用的串口，页面加载时自动连接

3. **串口配置预设**  
   为不同品牌扫码枪预设波特率等参数

4. **连接状态通知**  
   使用 Toast 提示连接成功/失败

5. **设备断开检测**  
   监听 `disconnect` 事件，自动清理状态
