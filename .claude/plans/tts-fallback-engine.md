# Android Agent TTS Fallback 引擎集成方案

## 问题分析

### 当前状态
- **实现位置**：`agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt:22-95`
- **当前方案**：使用系统 `android.speech.tts.TextToSpeech` API
- **失败场景**：
  - Android 9 及以下部分设备没有预装 TTS 引擎
  - 用户卸载或禁用了系统 TTS 引擎
  - TTS 引擎被包可见性过滤（Android 11+ 的包可见性限制）
- **当前行为**：初始化失败时显示 Toast "语音播报不可用：设备未安装可用的 TTS 引擎"，清空待播报队列

### 需求目标
1. 在系统 TTS 不可用时，提供 fallback 方案确保语音播报功能可用
2. 优先使用系统 TTS（音质好、体积小、用户熟悉）
3. Fallback 方案需要支持中文（当前代码优先简体中文）
4. 尽量减少 APK 体积增长
5. 不依赖外部网络（考虑离线使用场景）

## 技术方案对比

### 方案 1：集成讯飞离线 TTS SDK ⭐ 推荐
**优点**：
- 中文语音质量好，专门为中文优化
- 离线 SDK，不依赖网络
- 有成熟的 Android SDK
- 支持多种音色和语速控制

**缺点**：
- 需要注册讯飞账号并申请 AppID
- SDK 和语音包会增加约 10-15MB APK 体积
- 有调用次数限制（离线版本通常足够）
- 需要遵循讯飞的许可协议

**集成步骤**：
1. 注册讯飞开放平台账号
2. 创建应用获取 AppID 和 APIKey
3. 下载离线语音合成 SDK
4. 添加依赖和语音资源
5. 实现 fallback 逻辑

### 方案 2：集成 Flite TTS（开源）
**优点**：
- 完全开源，MIT 协议
- 体积较小（约 5-8MB）
- 无需注册或 API key
- 已有 Android 移植版本

**缺点**：
- 中文支持较弱（主要是英文）
- 音质一般，机器感强
- 社区活跃度低，维护较少

**集成步骤**：
1. 添加 Flite Android 库依赖
2. 下载中文语音包（如果有）
3. 实现 fallback 逻辑

### 方案 3：集成 eSpeak NG（开源）
**优点**：
- 开源，GPL v3 协议
- 支持多种语言包括中文
- 体积较小（约 3-5MB）
- 活跃维护

**缺点**：
- 音质较差，合成感强
- 中文发音不够自然
- Android 集成相对复杂（需要 JNI）

### 方案 4：引导安装 Google TTS
**优点**：
- 不增加 APK 体积
- 音质好
- 用户可能已经熟悉

**缺点**：
- 需要用户手动操作
- 依赖 Google Play（国内用户不友好）
- 不是真正的 fallback（用户可能拒绝安装）

**实现方式**：
```kotlin
// 检测到 TTS 不可用时，弹出对话框引导安装
val intent = Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)
startActivity(intent)
```

### 方案 5：在线 TTS API（备选）
**优点**：
- 不增加 APK 体积
- 音质最好
- 支持多种音色

**缺点**：
- 依赖网络
- 有调用费用和限制
- 延迟较高
- 需要服务端配置

## 推荐方案：讯飞离线 TTS SDK

### 架构设计

```kotlin
// TTS 策略接口
interface TtsStrategy {
    fun initialize(context: Context, callback: (Boolean) -> Unit)
    fun speak(text: String, queueMode: Int): Boolean
    fun stop()
    fun shutdown()
    fun isAvailable(): Boolean
}

// 系统 TTS 策略（当前实现）
class SystemTtsStrategy : TtsStrategy { ... }

// 讯飞离线 TTS 策略（fallback）
class XunfeiTtsStrategy : TtsStrategy { ... }

// TTS 管理器（策略模式）
class TtsManager(private val context: Context) {
    private val strategies = listOf(
        SystemTtsStrategy(),     // 优先
        XunfeiTtsStrategy()      // fallback
    )
    
    private var currentStrategy: TtsStrategy? = null
    
    fun initialize(callback: (Boolean) -> Unit) {
        tryNextStrategy(0, callback)
    }
    
    private fun tryNextStrategy(index: Int, callback: (Boolean) -> Unit) {
        if (index >= strategies.size) {
            callback(false)
            return
        }
        
        strategies[index].initialize(context) { success ->
            if (success) {
                currentStrategy = strategies[index]
                callback(true)
            } else {
                tryNextStrategy(index + 1, callback)
            }
        }
    }
    
    fun speak(text: String, queueMode: Int): Boolean {
        return currentStrategy?.speak(text, queueMode) ?: false
    }
}
```

### 实现步骤

#### 阶段 1：重构现有代码（准备工作）
1. **创建 TTS 策略接口**
   - 文件：`agent/app/src/main/java/com/appmanager/agent/tts/TtsStrategy.kt`
   - 定义统一的 TTS 接口

2. **提取系统 TTS 为策略实现**
   - 文件：`agent/app/src/main/java/com/appmanager/agent/tts/SystemTtsStrategy.kt`
   - 将 `FormAppBridge` 中的 TTS 代码提取到独立类

3. **创建 TTS 管理器**
   - 文件：`agent/app/src/main/java/com/appmanager/agent/tts/TtsManager.kt`
   - 实现策略链和自动 fallback 逻辑

4. **更新 FormAppBridge**
   - 替换直接使用 `TextToSpeech` 为使用 `TtsManager`
   - 保持 `@JavascriptInterface` 方法签名不变

#### 阶段 2：集成讯飞 TTS SDK
1. **注册讯飞开放平台**
   - 访问 https://www.xfyun.cn/
   - 注册账号并创建应用
   - 获取 AppID（需要记录到配置或 BuildConfig）

2. **下载并集成 SDK**
   - 下载讯飞离线语音合成 SDK
   - 将 `.aar` 或 `.jar` 添加到 `agent/app/libs/`
   - 更新 `agent/app/build.gradle` 添加依赖

3. **添加语音资源**
   - 将离线语音包放到 `agent/app/src/main/assets/`
   - 配置首次运行时解压到私有目录

4. **实现讯飞 TTS 策略**
   - 文件：`agent/app/src/main/java/com/appmanager/agent/tts/XunfeiTtsStrategy.kt`
   - 实现 `TtsStrategy` 接口
   - 处理初始化、合成、播放

5. **注册到 TTS 管理器**
   - 在 `TtsManager` 的策略列表中添加 `XunfeiTtsStrategy`

6. **配置管理**
   - 在 `agent/app/build.gradle` 中添加 `buildConfigField` 存储 AppID
   - 或从 `AgentConfig` 读取（可选，用于多环境）

#### 阶段 3：测试和优化
1. **功能测试**
   - 在有系统 TTS 的设备上测试（应使用系统 TTS）
   - 在无系统 TTS 的设备上测试（应 fallback 到讯飞）
   - 测试队列模式（QUEUE_FLUSH 和 QUEUE_ADD）
   - 测试中文语音质量

2. **资源优化**
   - 评估 APK 体积增长
   - 考虑是否需要分离语音包（通过动态下载）

3. **错误处理**
   - 处理讯飞初始化失败的情况
   - 添加日志记录便于排查

## 文件变更清单

### 新增文件
```
agent/app/src/main/java/com/appmanager/agent/tts/
├── TtsStrategy.kt              # TTS 策略接口
├── TtsManager.kt               # TTS 管理器（策略链）
├── SystemTtsStrategy.kt        # 系统 TTS 实现
└── XunfeiTtsStrategy.kt        # 讯飞 TTS 实现

agent/app/libs/
└── [讯飞 TTS SDK aar 文件]

agent/app/src/main/assets/
└── [讯飞离线语音包]
```

### 修改文件
```
agent/app/build.gradle           # 添加讯飞 SDK 依赖和 AppID
agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt
                                 # 替换 TTS 实现为 TtsManager
agent/app/src/main/AndroidManifest.xml
                                 # 可能需要添加讯飞相关权限
```

## 依赖和权限

### build.gradle 变更
```gradle
android {
    defaultConfig {
        // 讯飞 AppID（实际使用时需要替换为真实值）
        buildConfigField "String", "XUNFEI_APP_ID", "\"12345678\""
    }
}

dependencies {
    // 讯飞离线语音合成 SDK
    implementation files('libs/Msc.jar')  // 实际文件名取决于 SDK 版本
    // 或者如果是 aar：
    // implementation files('libs/xunfei-tts-offline.aar')
}
```

### AndroidManifest.xml 变更
```xml
<!-- 讯飞 TTS 可能需要的权限 -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

## APK 体积影响评估

| 组件 | 预估体积 |
|------|---------|
| 讯飞 TTS SDK | ~2-3 MB |
| 中文离线语音包 | ~8-12 MB |
| 代码重构 | ~20 KB |
| **总计** | **~10-15 MB** |

## 备选方案：轻量级实现

如果讯飞的体积或许可协议不合适，可以考虑：

### 方案 A：仅引导安装
- 不集成第三方 SDK
- 检测到 TTS 不可用时，弹出友好对话框引导用户：
  1. 安装 Google TTS（Play Store 链接）
  2. 或安装其他 TTS 引擎（提供推荐列表）
- 提供"稍后提醒"选项，不阻塞用户

### 方案 B：服务端 TTS
- 在 Go 服务端集成 TTS API（阿里云、腾讯云等）
- Agent 发送文本到服务端，服务端返回音频文件 URL
- Agent 下载并播放音频
- 优点：不增加 APK 体积，音质好
- 缺点：依赖网络和服务端配置

## 风险和注意事项

1. **许可协议**：确认讯飞 SDK 的商业使用条款
2. **隐私合规**：讯飞 SDK 是否上传数据（离线版本通常不会）
3. **维护成本**：SDK 版本更新和兼容性
4. **多语言支持**：当前只考虑中文，未来可能需要其他语言
5. **测试覆盖**：需要在多个 Android 版本上测试（特别是 Android 9）

## 实施优先级

### P0（必须）
- [ ] 重构现有 TTS 代码为策略模式
- [ ] 实现 TTS 管理器和 fallback 机制
- [ ] 决定最终使用的 fallback 方案（讯飞或其他）

### P1（重要）
- [ ] 集成选定的 fallback TTS SDK
- [ ] 在无系统 TTS 的设备上测试
- [ ] 评估 APK 体积和性能影响

### P2（可选）
- [ ] 支持在线 TTS API 作为第三选项
- [ ] 添加 TTS 设置界面（选择引擎、音速等）
- [ ] 支持多语言语音包动态下载

## 时间估算

- **阶段 1（重构）**：2-3 天
- **阶段 2（集成讯飞）**：3-4 天（包括申请 AppID、下载 SDK、实现和调试）
- **阶段 3（测试优化）**：2-3 天
- **总计**：约 7-10 天

## 下一步行动

1. **立即行动**：确认是否选择讯飞方案
   - 如果是，开始注册讯飞账号并申请 AppID
   - 如果不是，评估其他开源方案（Flite、eSpeak）

2. **代码重构**：先进行策略模式重构，不依赖具体 fallback 实现
   - 这样可以并行进行 SDK 申请和代码重构

3. **验证可行性**：创建简单的 demo 项目验证讯飞 SDK 集成
   - 确认音质、体积、兼容性是否满足要求

4. **开发实施**：按照阶段 1 → 2 → 3 顺序实施
