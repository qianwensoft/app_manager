# Android Agent TTS Fallback 系统使用指南

## 概述

Android Agent 现在支持多引擎 TTS fallback 机制，当系统 TTS 不可用时自动尝试其他引擎。

## 当前实现状态

### ✅ 已完成
1. **架构重构**
   - 策略模式接口 `TtsStrategy`
   - TTS 管理器 `TtsManager` 支持策略链和自动 fallback
   - 系统 TTS 策略 `SystemTtsStrategy`（优先使用）
   - 引导安装策略 `InstallGuideTtsStrategy`（当系统 TTS 不可用时引导用户安装）

2. **集成到 FormAppBridge**
   - `FormAppBridge.speak()` 现在使用 `TtsManager`
   - 保持向后兼容，JS 接口不变
   - 异步初始化，未就绪时文本自动排队

### 🚧 待集成（可选）
- 讯飞离线 TTS SDK（框架已就绪，等待 SDK 和 AppID）
- 在线 TTS API（如需要）

## 工作原理

### 策略链顺序
1. **SystemTtsStrategy**（优先）
   - 使用 Android 系统 `android.speech.tts.TextToSpeech`
   - 优先简体中文，回退到默认语言
   - 音质好，不增加 APK 体积

2. **InstallGuideTtsStrategy**（当前 fallback）
   - 检测到系统 TTS 不可用时，自动打开 TTS 引擎安装页面
   - 引导用户安装 Google TTS 或其他 TTS 引擎
   - 只触发一次引导流程

3. **XunfeiTtsStrategy**（未来）
   - 讯飞离线 TTS，中文音质好
   - 需要集成 SDK 和配置 AppID
   - 框架已就绪，取消注释即可使用

### 初始化流程

```
用户调用 speak()
  ↓
ensureTts() 首次调用
  ↓
TtsManager.initialize()
  ↓
尝试 SystemTtsStrategy
  ├─ 成功 → 使用系统 TTS
  └─ 失败 → 尝试 InstallGuideTtsStrategy
      ├─ 引导用户安装
      └─ 继续尝试下一个策略（如果有）
```

### 播报队列机制

- **初始化前**：文本自动加入 `TtsManager` 的待播报队列
- **初始化后**：立即播报队列中的所有文本
- **队列模式**：
  - 第一条文本：`QUEUE_FLUSH`（清空队列）
  - 后续文本：`QUEUE_ADD`（追加到队列）

## 代码示例

### JavaScript 调用（form-app）

```javascript
// 使用方式不变
AndroidBridge.speak("扫码成功");
```

### Kotlin 调用（Agent 内部）

```kotlin
// FormAppBridge 已集成，直接调用
formAppBridge.speak("语音播报测试")

// 释放资源（Activity 销毁时）
formAppBridge.release()
```

## 添加新的 TTS 策略

### 1. 创建策略类

```kotlin
package com.appmanager.agent.tts

class MyCustomTtsStrategy : TtsStrategy {
    override fun initialize(context: Context, callback: (Boolean) -> Unit) {
        // 初始化你的 TTS 引擎
        callback(true) // 成功时调用
    }

    override fun speak(text: String, queueMode: Int): Boolean {
        // 播报文本
        return true
    }

    override fun stop() {
        // 停止播报
    }

    override fun shutdown() {
        // 释放资源
    }

    override fun isAvailable(): Boolean {
        // 检查是否可用
        return true
    }

    override fun getName(): String = "MyCustomTTS"
}
```

### 2. 注册到 TtsManager

编辑 `TtsManager.kt`：

```kotlin
private val strategies = listOf<TtsStrategy>(
    SystemTtsStrategy(),
    MyCustomTtsStrategy(),  // 添加你的策略
    InstallGuideTtsStrategy()
)
```

策略按顺序尝试，第一个成功的会被使用。

## 集成讯飞离线 TTS SDK

### 前置条件

1. 注册讯飞开放平台账号：https://www.xfyun.cn/
2. 创建应用并获取 **AppID**
3. 下载**离线语音合成 SDK**

### 集成步骤

#### 1. 添加 SDK 文件

```bash
# 将 SDK jar/aar 放到 libs 目录
cp Msc.jar agent/app/libs/

# 将离线语音包放到 assets 目录
cp -r iflytek agent/app/src/main/assets/
```

#### 2. 更新 build.gradle

```gradle
android {
    defaultConfig {
        // 配置讯飞 AppID
        buildConfigField "String", "XUNFEI_APP_ID", "\"YOUR_APP_ID_HERE\""
    }
}

dependencies {
    // 讯飞离线语音合成 SDK
    implementation files('libs/Msc.jar')
}
```

#### 3. 取消注释 XunfeiTtsStrategy 实现

编辑 `XunfeiTtsStrategy.kt`，取消注释 TODO 部分的代码。

#### 4. 注册到 TtsManager

```kotlin
private val strategies = listOf<TtsStrategy>(
    SystemTtsStrategy(),
    XunfeiTtsStrategy(),        // 添加讯飞策略
    InstallGuideTtsStrategy()
)
```

#### 5. 编译测试

```bash
cd agent
./gradlew assembleDebug
```

## 测试建议

### 测试场景

1. **有系统 TTS 的设备**
   - 预期：使用系统 TTS，日志显示 "SystemTTS"
   
2. **无系统 TTS 的设备**
   - 预期：打开 TTS 引擎安装页面，Toast 提示
   
3. **集成讯飞后的设备**
   - 预期：系统 TTS 失败时自动使用讯飞

### 查看日志

```bash
adb logcat | grep -E "TtsManager|TtsStrategy|FormAppBridge"
```

预期日志示例：

```
I/TtsManager: 开始初始化 TTS 管理器，策略数量: 2
D/TtsManager: 尝试初始化 TTS 引擎: SystemTTS (1/2)
I/SystemTtsStrategy: 系统 TTS 初始化成功
I/TtsManager: TTS 引擎 SystemTTS 初始化成功
I/FormAppBridge: TTS 引擎初始化成功: SystemTTS
```

## 文件清单

### 新增文件

```
agent/app/src/main/java/com/appmanager/agent/tts/
├── TtsStrategy.kt                  # TTS 策略接口
├── TtsManager.kt                   # TTS 管理器（策略链）
├── SystemTtsStrategy.kt            # 系统 TTS 实现
├── InstallGuideTtsStrategy.kt      # 引导安装策略
└── XunfeiTtsStrategy.kt            # 讯飞 TTS 框架（待集成）
```

### 修改文件

```
agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt
  - 移除直接使用 TextToSpeech
  - 使用 TtsManager
  - 保持 @JavascriptInterface 接口不变
```

## 性能影响

- **APK 体积**：当前实现不增加体积（仅引导安装）
- **初始化时间**：首次调用 speak() 时异步初始化，约 100-500ms
- **运行时内存**：约 1-2MB（系统 TTS）
- **如果集成讯飞**：APK 增加约 10-15MB，内存约 5-10MB

## 已知限制

1. **引导安装策略**
   - 依赖用户手动安装 TTS 引擎
   - 国内设备可能无法访问 Google Play
   - 只触发一次引导流程

2. **系统 TTS**
   - Android 9 及以下部分设备可能没有预装
   - 包可见性限制可能导致引擎不可见（Android 11+）

3. **未来集成讯飞**
   - 需要注册账号和申请 AppID
   - 有调用次数限制（离线版本通常足够）
   - 需要遵循讯飞的许可协议

## 故障排查

### 问题：Toast 提示"语音播报不可用"

**原因**：所有 TTS 策略都初始化失败

**解决方案**：
1. 检查设备是否安装了 TTS 引擎：设置 → 语言和输入法 → 文字转语音输出
2. 安装 Google TTS 或其他 TTS 引擎
3. 或集成讯飞离线 TTS SDK

### 问题：初始化很慢

**原因**：系统 TTS 初始化是异步的，可能需要几百毫秒

**解决方案**：
- 这是正常现象，初始化期间的文本会自动排队
- 如需优化，可以在 Application 启动时预初始化 TtsManager

### 问题：中文发音不准确

**原因**：系统 TTS 可能没有安装中文语音包

**解决方案**：
1. 在 TTS 设置中下载中文语音包
2. 或集成讯飞离线 TTS（中文质量更好）

## 未来扩展

- [ ] 支持在线 TTS API（阿里云、腾讯云等）
- [ ] 支持自定义语速、音调、音量
- [ ] 支持多语言自动切换
- [ ] TTS 设置界面（让用户选择引擎）
- [ ] 语音包动态下载（减少 APK 体积）

## 相关文档

- [规划文档](./.claude/plans/tts-fallback-engine.md)
- [Android TextToSpeech 官方文档](https://developer.android.com/reference/android/speech/tts/TextToSpeech)
- [讯飞语音合成 SDK](https://www.xfyun.cn/doc/tts/offline_tts/Android-SDK.html)
