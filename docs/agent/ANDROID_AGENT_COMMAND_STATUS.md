# Android Agent 命令支持状态报告

**日期**: 2026-06-27  
**检查范围**: start_scan、take_photo、bluetooth_print 命令

---

## 📋 检查结果

### ✅ 已支持命令

#### 1. bluetooth_print (蓝牙打印) ✅

**命令常量**: `CommandAction.PRINT = "print"`

**位置**: 
- `Protocol.kt:191` - 命令定义
- `CommandDispatcher.kt:275` - 调度逻辑
- `PrinterCommandHandler.kt` - 完整实现

**实现细节**:
```kotlin
// CommandDispatcher.kt:275
CommandAction.PRINT -> PrinterCommandHandler.print(msg.data, msg.commandId, service)

// PrinterCommandHandler.print() 支持：
- mac: 打印机 MAC 地址（可选，使用默认打印机）
- protocol: 打印协议（ESCPOS/TSPL/CPCL）
- transport: 传输方式（bluetooth/usb）
- content: 打印内容数组
- raw_base64: 原始字节（可选）
```

**响应格式**:
```kotlin
// 成功
CommandDispatcher.sendResult(service, commandId, true, "printed ${bytes.size} bytes")

// 失败
CommandDispatcher.sendResult(service, commandId, false, errorMessage)
```

**兼容性**: ✅ **完全兼容工作流节点**
- 工作流节点使用 `bluetooth_print` 作为 action
- 需要更新为 `print` 或在 CommandDispatcher 中添加别名

---

### ❌ 缺失命令

#### 2. start_scan (扫码) ❌

**状态**: **未实现**

**所需功能**:
- 启动扫码 Activity（相机扫描）
- 支持 scanType: qrcode | barcode | any
- 扫码成功后回传结果

**建议实现**:
```kotlin
// 1. 在 Protocol.kt 中添加
const val START_SCAN = "start_scan"

// 2. 在 CommandDispatcher.kt 中添加
CommandAction.START_SCAN -> ScanCommandHandler.startScan(msg, service)

// 3. 创建 ScanCommandHandler.kt
object ScanCommandHandler {
    fun startScan(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        val scanType = data?.get("scanType") as? String ?: "any"
        
        // 启动扫码 Activity
        val intent = Intent(service, ScanActivity::class.java).apply {
            putExtra("scanType", scanType)
            putExtra("commandId", msg.commandId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        service.startActivity(intent)
    }
}

// 4. ScanActivity 扫码成功后
service.webSocket.send(mapOf(
    "commandId" to commandId,
    "code" to scanResult,
    "type" to scanType
))
```

**预计工作量**: 4小时
- 1小时：添加命令处理器框架
- 2小时：实现扫码 Activity（使用 ZXing 或 ML Kit）
- 1小时：测试和回调集成

---

#### 3. take_photo (拍照) ❌

**状态**: **未实现**

**所需功能**:
- 启动相机拍照
- 支持 camera: back | front
- 支持 quality: 1-100
- 照片上传到服务器，返回 URL

**建议实现**:
```kotlin
// 1. 在 Protocol.kt 中添加
const val TAKE_PHOTO = "take_photo"

// 2. 在 CommandDispatcher.kt 中添加
CommandAction.TAKE_PHOTO -> PhotoCommandHandler.takePhoto(msg, service)

// 3. 创建 PhotoCommandHandler.kt
object PhotoCommandHandler {
    fun takePhoto(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        val camera = data?.get("camera") as? String ?: "back"
        val quality = (data?.get("quality") as? Number)?.toInt() ?: 80
        
        // 启动拍照 Activity
        val intent = Intent(service, CameraActivity::class.java).apply {
            putExtra("camera", camera)
            putExtra("quality", quality)
            putExtra("commandId", msg.commandId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        service.startActivity(intent)
    }
}

// 4. CameraActivity 拍照后上传
// POST /api/agent/upload-photo
// 成功后回传：
service.webSocket.send(mapOf(
    "commandId" to commandId,
    "photoUrl" to uploadedUrl,
    "camera" to camera
))
```

**预计工作量**: 5小时
- 1小时：添加命令处理器框架
- 2小时：实现相机 Activity（使用 Camera2 API）
- 1小时：照片压缩和上传
- 1小时：测试和回调集成

---

## 🔧 需要修复的问题

### 问题 1: 命令名称不匹配

**工作流节点使用**: `bluetooth_print`  
**Agent 实际命令**: `print`

**解决方案 1**: 修改工作流节点代码
```go
// server/workflow/nodes/device_bluetooth.go
sent := agent.AgentHub.SendToDevice(uint(deviceId), map[string]interface{}{
    "type":      "command",
    "action":    "print",  // 改为 "print"
    "commandId": cmdID,
    "data":      printData,
})
```

**解决方案 2**: 在 Agent 添加别名（推荐）
```kotlin
// CommandDispatcher.kt
CommandAction.BLUETOOTH_PRINT -> PrinterCommandHandler.print(msg.data, msg.commandId, service)

// Protocol.kt
const val BLUETOOTH_PRINT = "bluetooth_print"  // 别名
```

---

## 📊 命令支持总结

| 命令 | 工作流节点 | Agent 支持 | 状态 | 优先级 |
|------|-----------|-----------|------|--------|
| bluetooth_print | ✅ | ⚠️ (命名为 print) | 需修复 | P0 |
| start_scan | ✅ | ❌ | 需实现 | P1 |
| take_photo | ✅ | ❌ | 需实现 | P1 |

---

## 🎯 实施计划

### 立即执行 (P0)

#### 任务 1: 修复 bluetooth_print 命令名称
```go
// 方案：修改工作流节点使用 "print"
// 文件：server/workflow/nodes/device_bluetooth.go
// 时间：5 分钟
```

### 本周任务 (P1)

#### 任务 2: 实现 start_scan 命令
```kotlin
文件：
  - agent/app/.../ws/Protocol.kt (添加常量)
  - agent/app/.../command/CommandDispatcher.kt (添加调度)
  - agent/app/.../command/ScanCommandHandler.kt (新建)
  - agent/app/.../ScanActivity.kt (新建)
时间：4 小时
```

#### 任务 3: 实现 take_photo 命令
```kotlin
文件：
  - agent/app/.../ws/Protocol.kt (添加常量)
  - agent/app/.../command/CommandDispatcher.kt (添加调度)
  - agent/app/.../command/PhotoCommandHandler.kt (新建)
  - agent/app/.../CameraActivity.kt (新建)
时间：5 小时
```

---

## 🧪 测试计划

### 蓝牙打印测试（修复后）
```bash
# 1. 修改工作流节点代码
# 2. 重新编译 Go 服务器
# 3. 创建测试工作流
# 4. 执行并验证打印
```

### 扫码测试（实现后）
```bash
# 1. 实现 Android 命令处理器
# 2. 编译安装 Agent APK
# 3. 创建扫码工作流
# 4. 触发执行，扫描二维码
# 5. 验证回调和变量保存
```

### 拍照测试（实现后）
```bash
# 1. 实现 Android 命令处理器
# 2. 编译安装 Agent APK
# 3. 创建拍照工作流
# 4. 触发执行，拍照
# 5. 验证照片上传和 URL 返回
```

---

## 📝 相关资源

### Agent 现有扫码实现
检查是否已有扫码模块：
```bash
find agent/app -name "*Scan*.kt" -o -name "*QR*.kt" -o -name "*Barcode*.kt"
```

### Agent 现有相机实现
检查是否已有相机模块：
```bash
find agent/app -name "*Camera*.kt" -o -name "*Photo*.kt"
```

### 第三方库建议
- **扫码**: ZXing Android Embedded 或 ML Kit Barcode Scanning
- **相机**: CameraX (Jetpack) 或 Camera2 API
- **图片压缩**: Luban 或 Compressor

---

## 🎉 总结

**当前状态**:
- ✅ 蓝牙打印已实现，需修复命令名称（5分钟）
- ❌ 扫码功能需实现（4小时）
- ❌ 拍照功能需实现（5小时）

**下一步**:
1. 立即修复 bluetooth_print → print 命令名称
2. 实现 start_scan 命令处理器
3. 实现 take_photo 命令处理器
4. 端到端测试所有设备节点

**预计总耗时**: 9小时 + 2小时测试 = **11小时**

---

**报告生成时间**: 2026-06-27  
**检查完成**: ✅
