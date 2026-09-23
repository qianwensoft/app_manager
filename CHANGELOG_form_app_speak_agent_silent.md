# 变更日志：form-app 语音播报在 Agent 端无声

**日期：** 2026-09-23
**类型：** Bug Fix（诊断增强）
**影响范围：** `agent/app`（FormAppBridge TTS）+ `form-app/src/runtime/speakBridge.ts`

## 问题

用户反馈：form-app 在 Agent 端运行时，事件流中的"语音播报"动作没有声音（无任何错误提示）。在浏览器端模拟运行时（Web Speech API）正常播放。

## 已排查的链路

代码链路：

```
form-app/src/runtime/tools/speak.ts
  → form-app/src/runtime/speakBridge.ts:speak()
    → window.AndroidBridge.speak(text)   // Agent 通道
      → FormAppBridge.speak() (@JavascriptInterface)
        → TextToSpeech                    // 系统 TTS 引擎
    → speechSynthesis                     // 浏览器降级
```

`speakBridge.ts` 已实现双通道：优先 `window.AndroidBridge.speak(text)`，失败/不存在则降级到浏览器 `speechSynthesis`。

`FormAppBridge.kt` 已有完整的 TTS 初始化逻辑、错误处理、Toast 提示。`AndroidManifest.xml` 也已声明 `TTS_SERVICE` 包可见性 query（见注释：未声明时 TTS 初始化回调返回非 SUCCESS，文本会堆在 pendingSpeak 里，表现为「不报错但完全没声音」）。

## 本次变更：添加分级诊断日志

由于代码侧无法直接定位是哪一环断了，在前后端两侧都加了日志，便于现场抓 logcat / WebView 控制台后定位。

### Agent 端 — `FormAppBridge.kt`

- `speak()` 被调用时记录 msg、`ttsReady`、`tts` 实例状态、队列长度
- `ensureTts()` 开始初始化、回调 status、`setLanguage()` 返回值
- `flushSpeak()` 调用 `TTS.speak()` 前记录待播文本

### 前端 — `form-app/src/runtime/speakBridge.ts`

- `getBridge()` 检查 `window.AndroidBridge` 与 `speak` 方法是否存在
- `speak()` 决策路径（Android bridge / 浏览器 TTS 降级）
- 浏览器 TTS 通道被选中的原因与执行结果

## 部署后排查步骤

1. 用 Chrome `chrome://inspect` 连接 Agent WebView，打开控制台
2. 触发"语音播报"动作
3. **WebView 控制台** 找 `[speakBridge]` 前缀日志：
   - `AndroidBridge exists: true` → 桥接已注册
   - `Calling AndroidBridge.speak...` 后无异常 → 前端路径正常，问题在原生 TTS
   - `No AndroidBridge.speak, falling back to browser TTS` → 桥接未注册成功
4. **logcat** 过滤 `tag=FormAppBridge`：
   - `speak 被调用` 未出现 → JS 没调到原生桥
   - `TTS init failed, status=...` → 设备无 TTS 引擎 / 语言包缺失
   - `setLanguage(SIMPLIFIED_CHINESE) => LANG_MISSING_DATA` → 中文语言包缺失
   - `调用 TTS speak` 后仍无声 → 设备音频焦点/音量/静音问题

## 常见原因（按概率）

1. **设备未安装 TTS 引擎或中文语言包**（国产 ROM 常见）：初始化 status != SUCCESS，应安装 Google TTS / 讯飞 / 百度等引擎
2. **TTS 引擎被禁用**：系统设置 → 语言与输入法 → 文字转语音 (TTS) 输出 → 设为已安装引擎
3. **音量/静音/勿扰**：设备媒体音量为 0 或开了勿扰
4. **AndroidBridge 未注册成功**：WebView 类型（X5/System）异常，桥接口被过滤；可在 WebView 控制台执行 `typeof AndroidBridge.speak` 验证

## 后续

根据日志结果可针对性修复：
- 若 status != SUCCESS：引导用户安装 TTS 引擎或内置兜底 beep 提示
- 若桥接未注册：排查 WebView 类型与 `addJavascriptInterface` 时序
- 若音量问题：调用 `AudioManager.adjustStreamVolume` 检查/请求
