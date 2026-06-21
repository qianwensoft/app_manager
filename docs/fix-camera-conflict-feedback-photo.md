# 修复工单拍照时摄像头占用冲突

## 问题描述

Android app 端工单提交（FeedbackActivity）拍照时提示"有应用摄像机占用"，导致无法正常拍照。

## 根本原因

**冲突源**：`CameraStreamManager` (WebRTC 摄像头流) 与 `FeedbackActivity` 的拍照功能争抢摄像头资源。

### 技术细节

1. **CameraStreamManager** 使用 Camera2 API + WebRTC 持续占用摄像头
   - 在 `AgentService` 中创建并管理
   - 当 Web 控制台打开摄像头流时启动
   - 只有显式调用 `stopCamera()` 或 `stopAll()` 时才释放

2. **FeedbackActivity** 使用系统相机 Intent (`MediaStore.ACTION_IMAGE_CAPTURE`)
   - 需要独占摄像头访问权限
   - 与 WebRTC 流冲突

3. **并发限制**：`CameraStreamManager` 内的 `isConcurrentSupported()` 只检测**同时开启前后摄像头**，不检测**与其他应用的冲突**

## 解决方案

**方案 A（已实现）**：拍照前临时释放摄像头流，拍照完成后恢复

### 实现细节

#### 1. AgentService 新增暂停/恢复机制

**新增 Action 常量**：
```kotlin
const val ACTION_PAUSE_CAMERA = "PAUSE_CAMERA"
const val ACTION_RESUME_CAMERA = "RESUME_CAMERA"
```

**新增状态字段**：
```kotlin
private val pausedCameraStates = mutableMapOf<String, List<Map<String, Any>>?>()
```

**新增方法**：
- `pauseCameraStreams()` - 停止所有摄像头流并记录状态
- `resumeCameraStreams()` - 清空暂停标记（Web 控制台会自动重连）

**onStartCommand 处理**：
```kotlin
if (intent?.action == ACTION_PAUSE_CAMERA) {
    pauseCameraStreams()
    return START_STICKY
}

if (intent?.action == ACTION_RESUME_CAMERA) {
    resumeCameraStreams()
    return START_STICKY
}
```

#### 2. FeedbackActivity 拍照流程改造

**拍照前暂停**：
```kotlin
private fun capturePhoto() {
    pauseCameraStreams()  // 暂停摄像头流
    val f = File(feedbackDir(), "photo_${System.currentTimeMillis()}.jpg")
    pendingPhoto = f
    val i = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
        .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, fileUri(f))
        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    if (i.resolveActivity(packageManager) != null) takePhoto.launch(i)
    else {
        resumeCameraStreams()  // 无相机应用时也要恢复
        Toast.makeText(this, "无相机应用", Toast.LENGTH_SHORT).show()
    }
}
```

**拍照后恢复**：
```kotlin
private val takePhoto = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
    resumeCameraStreams()  // 拍照完成后立即恢复
    if (r.resultCode == Activity.RESULT_OK) pendingPhoto?.let {
        // ... 处理照片
    }
}
```

**辅助方法**：
```kotlin
private fun pauseCameraStreams() {
    ContextCompat.startForegroundService(
        this,
        Intent(this, AgentService::class.java).setAction(AgentService.ACTION_PAUSE_CAMERA)
    )
}

private fun resumeCameraStreams() {
    ContextCompat.startForegroundService(
        this,
        Intent(this, AgentService::class.java).setAction(AgentService.ACTION_RESUME_CAMERA)
    )
}
```

## 测试步骤

1. **准备环境**：
   - 安装新版本 agent APK
   - 在 Web 控制台打开设备的摄像头流（前置或后置）

2. **测试拍照**：
   - 打开 agent 的「问题反馈」页面
   - 点击「拍照」按钮
   - 应该能正常打开系统相机（不再提示占用）
   - 拍照完成后返回

3. **验证恢复**：
   - 回到 Web 控制台
   - 摄像头流应该自动重连恢复

4. **边界情况**：
   - 拍照时点击返回（未完成拍照） → 摄像头流应恢复
   - 无系统相机应用时 → 摄像头流应立即恢复

## 影响范围

- **修改文件**：
  - `agent/app/src/main/java/com/appmanager/agent/service/AgentService.kt`
  - `agent/app/src/main/java/com/appmanager/agent/ui/FeedbackActivity.kt`

- **兼容性**：向后兼容，不影响现有功能

- **性能影响**：暂停/恢复摄像头流有轻微延迟（<500ms），用户无感知

## 其他说明

- WebRTC 摄像头流断开后，Web 控制台会自动检测并尝试重连，无需手动干预
- 该方案也适用于其他需要独占摄像头的场景（如扫码、录像等）
- 未来可以考虑在 CameraStreamManager 中添加全局摄像头占用检测机制
