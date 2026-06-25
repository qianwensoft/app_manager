# 语音转文字（Speech-to-Text）功能实现规划

## 需求概述

在 form-app 中增加语音输入组件，用户点击后录音，录音结束后上传到服务端进行语音识别，将识别结果填充到绑定的表单字段。

### 用户场景
1. 用户在 form-app 表单页面看到"语音输入"按钮
2. 点击按钮开始录音，再次点击停止录音
3. 录音自动上传到服务端
4. 服务端调用第三方 STT API 进行识别
5. 识别结果自动填充到表单字段

## 技术架构

### 整体流程

```
form-app (React)
  ↓ 点击语音按钮
AndroidBridge.startRecording()
  ↓
Android Agent (Kotlin)
  ↓ MediaRecorder 录音
AndroidBridge.stopRecording() → 返回音频文件路径/base64
  ↓
form-app 上传音频到服务端
  ↓ POST /api/stt/recognize
Go Server
  ↓ 调用第三方 STT API
阿里云/腾讯云/百度 STT API
  ↓ 返回识别文本
form-app 接收结果并填充字段
```

## 组件层级设计

### 1. form-app 前端

#### 1.1 语音输入组件（VoiceInputField）

**位置**：`form-app/src/runtime/componentLibraries/shadcn.tsx`（或新建 `form-app/src/runtime/components/VoiceInputField.tsx`）

**功能**：
- 显示语音输入按钮（麦克风图标）
- 点击开始录音，显示录音中状态（红点、波形动画）
- 再次点击停止录音
- 显示上传进度
- 显示识别结果并填充到字段
- 支持重新录制

**Props**：
```typescript
interface VoiceInputFieldProps {
  field: string          // 绑定的表单字段名
  maxDuration?: number   // 最大录音时长（秒），默认 60s
  autoStop?: boolean     // 达到最大时长自动停止，默认 true
  language?: string      // 识别语言，默认 'zh-CN'
  placeholder?: string   // 占位符文本
}
```

**状态**：
```typescript
type VoiceInputState = 
  | 'idle'           // 待录制
  | 'recording'      // 录音中
  | 'uploading'      // 上传中
  | 'recognizing'    // 识别中
  | 'success'        // 识别成功
  | 'error'          // 错误
```

#### 1.2 录音桥接（voiceRecordBridge.ts）

**位置**：`form-app/src/runtime/voiceRecordBridge.ts`

**功能**：
- 检测 AndroidBridge 是否可用
- 调用 Android 录音接口
- 处理录音回调
- 降级到浏览器 MediaRecorder（可选）

**接口**：
```typescript
interface AndroidVoiceRecordBridge {
  startRecording?: () => void
  stopRecording?: () => string  // 返回音频文件路径或 base64
  isRecording?: () => boolean
}

// 暴露的方法
export function isVoiceRecordAvailable(): boolean
export function startRecording(): Promise<void>
export function stopRecording(): Promise<{
  type: 'file' | 'base64'
  data: string  // 文件路径或 base64 编码
  format: 'aac' | 'mp3' | 'wav'
  duration: number  // 录音时长（毫秒）
}>
```

#### 1.3 STT API 调用（sttApi.ts）

**位置**：`form-app/src/api/stt.ts`

**功能**：
- 上传音频文件到服务端
- 调用服务端 STT 识别接口
- 返回识别结果

**接口**：
```typescript
export async function recognizeSpeech(
  audioData: Blob | string,  // Blob 或 base64
  language: string = 'zh-CN'
): Promise<{
  text: string
  confidence: number
}>
```

#### 1.4 事件系统集成

在 `eventTypes.ts` 中添加新的动作类型：

```typescript
export interface VoiceInputAction extends ActionBase {
  type: 'voice_input'
  field: string          // 目标字段
  language?: string      // 识别语言
  max_duration?: number  // 最大时长
}
```

### 2. Android Agent

#### 2.1 FormAppBridge 扩展

**位置**：`agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt`

**新增方法**：
```kotlin
@JavascriptInterface
fun startRecording(): String

@JavascriptInterface
fun stopRecording(): String

@JavascriptInterface
fun isRecording(): Boolean

@JavascriptInterface
fun cancelRecording()
```

#### 2.2 录音管理器（VoiceRecordManager）

**位置**：`agent/app/src/main/java/com/appmanager/agent/voice/VoiceRecordManager.kt`

**功能**：
- 使用 MediaRecorder 录音
- 保存为 AAC/MP3 格式
- 管理录音文件生命周期
- 提供录音时长、音量等信息

**参考现有实现**：
- `FeedbackActivity.kt` 中已有 MediaRecorder 录音实现
- `AgentService.kt` 中有 `startAudioRecording()` 和 `stopAudioRecording()`

**设计**：
```kotlin
class VoiceRecordManager(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startTime: Long = 0
    
    fun startRecording(): File
    fun stopRecording(): RecordResult
    fun cancelRecording()
    fun isRecording(): Boolean
    fun getDuration(): Long
    
    data class RecordResult(
        val file: File,
        val duration: Long,
        val format: String
    )
}
```

#### 2.3 权限处理

需要的权限（已在 AndroidManifest.xml 中）：
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

运行时权限请求：
- 首次调用 `startRecording()` 时检查权限
- 无权限时返回错误 JSON：`{"success": false, "error": "需要录音权限"}`

### 3. Go Server 服务端

#### 3.1 API 接口

**位置**：`server/api/stt.go`

**接口设计**：

##### POST /api/stt/recognize
上传音频并识别

**请求**：
- Content-Type: multipart/form-data
- 字段：
  - `audio`: 音频文件（AAC/MP3/WAV）
  - `language`: 语言代码（zh-CN, en-US 等）
  - `format`: 音频格式（aac, mp3, wav）

**响应**：
```json
{
  "data": {
    "text": "识别的文本内容",
    "confidence": 0.95,
    "duration": 3500
  }
}
```

##### GET /api/stt/config
获取 STT 配置（管理员）

**响应**：
```json
{
  "data": {
    "provider": "aliyun",  // aliyun, tencent, baidu
    "enabled": true,
    "supported_languages": ["zh-CN", "en-US"]
  }
}
```

##### POST /api/stt/config
更新 STT 配置（管理员）

**请求**：
```json
{
  "provider": "aliyun",
  "app_key": "xxx",
  "app_secret": "xxx",
  "enabled": true
}
```

#### 3.2 STT 提供商抽象

**位置**：`server/stt/provider.go`

**接口设计**：
```go
package stt

type Provider interface {
    Name() string
    Recognize(audioFile string, language string) (*RecognizeResult, error)
    SupportedLanguages() []string
}

type RecognizeResult struct {
    Text       string  `json:"text"`
    Confidence float64 `json:"confidence"`
    Duration   int64   `json:"duration"` // 毫秒
}
```

#### 3.3 阿里云 STT 实现

**位置**：`server/stt/aliyun.go`

**功能**：
- 集成阿里云语音识别 API
- 支持一句话识别（录音文件识别）
- 处理 token 刷新

**SDK**：使用阿里云 Go SDK
```bash
go get github.com/aliyun/alibaba-cloud-sdk-go/services/nls
```

**实现**：
```go
type AliyunProvider struct {
    appKey    string
    appSecret string
    endpoint  string
}

func (p *AliyunProvider) Recognize(audioFile string, language string) (*RecognizeResult, error) {
    // 读取音频文件
    // 调用阿里云一句话识别 API
    // 返回识别结果
}
```

#### 3.4 配置管理

**位置**：`server/config/config.go`

**新增配置**：
```yaml
stt:
  enabled: true
  provider: aliyun  # aliyun, tencent, baidu
  aliyun:
    app_key: "your_app_key"
    app_secret: "your_app_secret"
    endpoint: "https://nls-gateway.cn-shanghai.aliyuncs.com"
  max_duration: 60  # 秒
  max_file_size: 10485760  # 10MB
```

**数据库存储**（可选，用于管理后台配置）：
```go
type STTConfig struct {
    ID         uint   `gorm:"primaryKey"`
    Provider   string `json:"provider"`
    AppKey     string `json:"app_key"`
    AppSecret  string `json:"app_secret"`
    Enabled    bool   `json:"enabled"`
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
```

## 实现步骤

### 阶段 1：Android 录音功能（2-3天）

1. **创建 VoiceRecordManager**
   - 封装 MediaRecorder
   - 文件管理和生命周期
   - 错误处理

2. **扩展 FormAppBridge**
   - 添加录音接口方法
   - 权限检查和请求
   - 返回音频数据

3. **测试录音功能**
   - 单独测试录音、停止、取消
   - 测试权限流程
   - 测试文件生成和清理

### 阶段 2：Go 服务端 STT（3-4天）

1. **配置管理**
   - 添加 STT 配置到 config.yaml
   - 创建配置模型（可选数据库存储）

2. **实现 Provider 接口**
   - 定义抽象接口
   - 实现阿里云 Provider

3. **创建 API 接口**
   - POST /api/stt/recognize
   - 文件上传处理
   - 调用 Provider 识别
   - 返回结果

4. **测试 STT API**
   - 使用 curl 或 Postman 测试
   - 测试各种音频格式
   - 测试错误处理

### 阶段 3：form-app 前端集成（3-4天）

1. **创建录音桥接**
   - voiceRecordBridge.ts
   - Android 桥接检测
   - 浏览器降级（可选）

2. **创建 STT API 客户端**
   - sttApi.ts
   - 上传音频
   - 调用识别接口

3. **创建语音输入组件**
   - VoiceInputField 组件
   - UI 状态管理
   - 录音进度显示
   - 结果填充

4. **集成到事件系统**
   - 添加 voice_input 动作类型
   - 在 eventEngine 中处理

5. **集成到 FormRenderer**
   - 在 shadcn 组件库中注册
   - 支持 Formily schema

### 阶段 4：测试和优化（2-3天）

1. **端到端测试**
   - Agent 中打开 form-app
   - 测试完整录音识别流程
   - 测试各种场景（权限、网络、错误）

2. **性能优化**
   - 音频压缩
   - 上传进度显示
   - 识别速度优化

3. **用户体验优化**
   - 录音动画效果
   - 错误提示友好化
   - 支持重新录制

## 文件变更清单

### 新增文件

#### Android Agent
```
agent/app/src/main/java/com/appmanager/agent/voice/
├── VoiceRecordManager.kt       # 录音管理器
└── VoicePermissionHelper.kt    # 权限帮助类（可选）
```

#### Go Server
```
server/stt/
├── provider.go                  # STT Provider 接口
├── aliyun.go                    # 阿里云实现
├── tencent.go                   # 腾讯云实现（未来）
└── baidu.go                     # 百度实现（未来）

server/api/
└── stt.go                       # STT API 接口

server/models/
└── stt_config.go                # STT 配置模型（可选）
```

#### form-app
```
form-app/src/api/
└── stt.ts                       # STT API 客户端

form-app/src/runtime/
├── voiceRecordBridge.ts         # 录音桥接
└── components/
    └── VoiceInputField.tsx      # 语音输入组件
```

### 修改文件

```
agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt
  + startRecording()
  + stopRecording()
  + isRecording()
  + cancelRecording()

server/config/config.go
  + STT 配置结构

server/main.go
  + 注册 STT API 路由

form-app/src/runtime/eventTypes.ts
  + VoiceInputAction 类型

form-app/src/runtime/eventEngine.ts
  + 处理 voice_input 动作

form-app/src/runtime/componentLibraries/shadcn.tsx
  + 注册 VoiceInputField 组件
```

## 技术选型

### STT 服务商对比

| 服务商 | 优点 | 缺点 | 价格 | 推荐度 |
|--------|------|------|------|--------|
| **阿里云** | 中文识别准确率高，SDK 完善，文档齐全 | 需要备案，企业用户友好 | ¥2.5/千次 | ⭐⭐⭐⭐⭐ |
| **腾讯云** | 价格便宜，接入简单 | 文档相对少 | ¥1.5/千次 | ⭐⭐⭐⭐ |
| **百度** | 老牌厂商，稳定性好 | SDK 较旧 | ¥2.0/千次 | ⭐⭐⭐ |
| **讯飞** | 语音识别领域专家，准确率最高 | 价格贵，审核严格 | ¥4.0/千次 | ⭐⭐⭐⭐ |

**推荐**：阿里云（综合考虑准确率、价格、SDK 质量）

### 音频格式选择

| 格式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **AAC** | 压缩率高，质量好，Android 原生支持 | - | ⭐⭐⭐⭐⭐ |
| **MP3** | 兼容性最好 | 编码器 license 问题 | ⭐⭐⭐⭐ |
| **WAV** | 无损音质 | 文件体积大 | ⭐⭐⭐ |

**推荐**：AAC（Android 默认，压缩率高）

## API 使用示例

### Android 调用

```kotlin
// 启动录音
val result = formAppBridge.startRecording()
// {"success": true} 或 {"success": false, "error": "需要录音权限"}

// 停止录音
val result = formAppBridge.stopRecording()
// {"success": true, "file": "/path/to/audio.aac", "duration": 3500, "format": "aac"}
```

### JavaScript 调用

```typescript
// form-app 中使用
import { startRecording, stopRecording } from './voiceRecordBridge'
import { recognizeSpeech } from '@/api/stt'

// 开始录音
await startRecording()

// 停止录音并识别
const audioData = await stopRecording()
const result = await recognizeSpeech(audioData.data, 'zh-CN')
console.log('识别结果:', result.text)

// 填充到表单字段
form.setFieldValue('description', result.text)
```

### 事件系统使用

在页面设计器中配置：

```json
{
  "events": [
    {
      "event_type": "button_click",
      "source": {
        "element_id": "voice_btn"
      },
      "actions": [
        {
          "type": "voice_input",
          "field": "description",
          "language": "zh-CN",
          "max_duration": 60
        }
      ]
    }
  ]
}
```

## 安全考虑

1. **权限控制**
   - 录音需要运行时权限
   - STT API 需要登录认证
   - 上传文件大小限制（10MB）
   - 录音时长限制（60秒）

2. **数据隐私**
   - 音频文件临时存储，识别后删除
   - 不在服务端永久保存音频
   - 识别结果不记录日志

3. **防滥用**
   - API 调用频率限制
   - 每用户每日调用次数限制
   - 费用监控和预警

## 成本估算

### 阿里云 STT 计费

- 一句话识别：¥2.5/千次
- 假设每天 1000 次识别：¥2.5/天 = ¥75/月
- 企业用户可申请折扣

### 开发成本

- Android 开发：2-3 天
- Go 服务端：3-4 天
- form-app 前端：3-4 天
- 测试优化：2-3 天
- **总计**：10-14 天

## 未来扩展

- [ ] 支持实时语音识别（流式识别）
- [ ] 支持多语言自动检测
- [ ] 支持方言识别（粤语、四川话等）
- [ ] 支持语音翻译（中英互译）
- [ ] 支持离线识别（集成小模型）
- [ ] 语音识别结果编辑和纠错
- [ ] 语音识别历史记录
- [ ] 批量音频识别

## 参考资料

- [阿里云语音识别文档](https://help.aliyun.com/product/30413.html)
- [Android MediaRecorder 文档](https://developer.android.com/guide/topics/media/mediarecorder)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [AAC 音频格式](https://en.wikipedia.org/wiki/Advanced_Audio_Coding)
