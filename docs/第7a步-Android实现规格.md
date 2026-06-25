# 第 7a 步 Android 实现规格（同设备跨 form-app 中继）

**状态**: TypeScript 端已实现，Android 端待实现
**前置**: A2 跨设备事件载荷契约 v1.1
**对应 TypeScript**: `form-app/src/runtime/crossDevice/`

---

## 一、Android 需要做什么

在 **FormAppBridge.kt**（或新建该文件）加一个 `@JavascriptInterface` 方法：

```kotlin
@JavascriptInterface
fun emitCrossAppEvent(jsonPayload: String) {
    // 1. 解析 CrossDeviceEvent（见下方数据结构）
    // 2. 提取目标 formCode（_target.formCode）
    // 3. 查找目标 WebView（按 formCode）
    // 4. 调目标 WebView 的 JS：window.dispatchCrossDeviceEvent(jsonPayload)
}
```

**关键点**:
- 同一个 Activity 可能持有多个 WebView（多 form-app）
- 需要一个 **WebView 注册表**：`Map<formCode, WebView>`，WebView 创建时注册，销毁时移除
- 调用 JS 需在 WebView 的线程：`webView.post { webView.evaluateJavascript("window.dispatchCrossDeviceEvent('...')", null) }`

---

## 二、数据结构（Kotlin data class）

```kotlin
data class CrossDeviceEvent(
    val event: String,                // 事件名
    val payload: Map<String, Any?>,   // 自包含数据快照
    val origin: Origin,
    val hop: Int
) {
    data class Origin(
        val formCode: String,
        val deviceId: String?,
        val emittedAt: Long,
        val eventId: String
    )
}

// 扩展字段（TS 端注入，Android 中继层提取后不再转发）
data class CrossAppPayload(
    val event: String,
    val payload: Map<String, Any?>,
    val origin: CrossDeviceEvent.Origin,
    val hop: Int,
    val _target: Target
) {
    data class Target(val formCode: String)
}
```

---

## 三、WebView 注册表（FormAppActivity 或 AgentMenuStore 持有）

```kotlin
// 全局单例或 Activity 成员
object FormAppRegistry {
    private val webViews = mutableMapOf<String, WebView>()

    fun register(formCode: String, webView: WebView) {
        webViews[formCode] = webView
    }

    fun unregister(formCode: String) {
        webViews.remove(formCode)
    }

    fun find(formCode: String): WebView? = webViews[formCode]
}
```

**调用点**:
- WebView 创建（FormAppActivity.onCreate/WebView 初始化）时 `register(formCode, webView)`
- WebView 销毁（Activity.onDestroy）时 `unregister(formCode)`

---

## 四、完整实现示例（FormAppBridge.kt）

```kotlin
package com.appmanager.agent

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import android.util.Log

class FormAppBridge(
    private val activity: FormAppActivity,
    private val webView: WebView
) {
    companion object {
        private const val TAG = "FormAppBridge"
    }

    @JavascriptInterface
    fun emitCrossAppEvent(jsonPayload: String) {
        try {
            // 1. 解析载荷
            val json = JSONObject(jsonPayload)
            val targetFormCode = json.getJSONObject("_target").getString("formCode")

            // 2. 查找目标 WebView
            val targetWebView = FormAppRegistry.find(targetFormCode)
            if (targetWebView == null) {
                Log.w(TAG, "目标 form-app 未运行: $targetFormCode")
                return
            }

            // 3. 移除扩展字段 _target（不转发给接收端）
            json.remove("_target")
            val cleanPayload = json.toString()

            // 4. 调目标 WebView 的 JS（需在其线程）
            targetWebView.post {
                val jsCode = "window.dispatchCrossDeviceEvent('${escapeJs(cleanPayload)}')"
                targetWebView.evaluateJavascript(jsCode, null)
            }

            Log.d(TAG, "跨 app emit: $targetFormCode, event: ${json.getString("event")}")
        } catch (e: Exception) {
            Log.e(TAG, "emitCrossAppEvent 失败", e)
        }
    }

    private fun escapeJs(s: String): String {
        return s.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
    }
}
```

---

## 五、集成步骤

1. **创建/更新 FormAppBridge.kt**，加 `emitCrossAppEvent` 方法
2. **创建 FormAppRegistry**（单例或 Activity 成员），持有 `Map<formCode, WebView>`
3. **WebView 创建时注册**（FormAppActivity.onCreate）：
   ```kotlin
   val formCode = intent.getStringExtra("form_code") ?: "unknown"
   FormAppRegistry.register(formCode, webView)
   webView.addJavascriptInterface(FormAppBridge(this, webView), "AndroidBridge")
   ```
4. **WebView 销毁时移除**（FormAppActivity.onDestroy）：
   ```kotlin
   FormAppRegistry.unregister(formCode)
   ```
5. **编译并安装到测试设备**

---

## 六、测试验证

### 单元测试（可选，Robolectric）
Mock 两个 WebView，调 `emitCrossAppEvent`，验证目标 WebView 收到 `evaluateJavascript` 调用。

### 集成测试（手工 / Espresso）
1. 在测试设备安装 Agent APK
2. 打开两个 form-app（如 `app_a` 和 `app_b`）
3. 在 `app_a` 配置一个事件：按钮触发 `emit_cross_app`（target_form_code=`app_b`, event_name=`ping`, data_src=`{msg: "hello"}`）
4. 在 `app_b` 配置一个事件：监听 `custom_event` 源（event_name=`ping`），动作 `toast`（显示 `$event.msg`）
5. 在 `app_a` 点击按钮 → `app_b` 应弹 toast "hello"

### 降级场景
- 目标 formCode 不存在 → Log.w，不崩溃
- payload 非法 JSON → 捕获异常，Log.e

---

## 七、已知限制与 FAQ

**Q1: 多个 Activity 同时打开同一 form-app 怎么办？**
A: 当前设计按 formCode 唯一映射 WebView，后打开的会覆盖。若需多实例，需改注册表为 `Map<formCode, List<WebView>>`，广播给所有实例。暂不支持，待需求明确。

**Q2: 安全性：app_a 能否向任意 app_b 发事件？**
A: 同设备内默认允许（A2 决策点 3）。跨设备需过服务端权限（7b 步）。

**Q3: WebView 线程安全？**
A: `webView.post {}` 确保在 WebView 线程执行，避免跨线程崩溃。

**Q4: 与现有 AndroidBridge 的 print/speak 方法冲突吗？**
A: 不冲突。`emitCrossAppEvent` 是新增方法，其他方法保持不变。

---

## 八、TypeScript 端已实现（可直接测试）

**发送端**:
- `runtime/crossDevice/bridge.ts`: `emitCrossApp()`
- `runtime/tools/emitCrossApp.ts`: `emit_cross_app` 工具
- 动作参数：`target_form_code`, `event_name`, `data_src`

**接收端**:
- `runtime/crossDevice/receiver.ts`: `setupCrossDeviceReceiver()`
- 幂等去重（eventId LRU 256 条）
- 防回环（origin.formCode === 本机）
- hop 超限 warn（>10）

**集成点**:
- `runtime/setupAppEvents.ts`: 应用级事件挂载时注册接收器
- `runtime/eventEngine.ts`: custom_event 源提取 `_hop` 注入 EventContext
- `runtime/MultiPageRuntime.tsx`: 传递 `formAppCode` 到 deps

---

## 九、Android 开发者 Checklist

- [ ] 创建/更新 FormAppBridge.kt，加 `@JavascriptInterface fun emitCrossAppEvent(jsonPayload: String)`
- [ ] 创建 FormAppRegistry 持有 `Map<formCode, WebView>`
- [ ] WebView 创建时注册 formCode
- [ ] WebView 销毁时移除 formCode
- [ ] 解析 `_target.formCode`，查找目标 WebView
- [ ] 调用目标 `webView.evaluateJavascript("window.dispatchCrossDeviceEvent(...)", null)`
- [ ] 异常捕获 + Log
- [ ] 手工测试：两个 app 互发事件，验证 toast 显示
- [ ] （可选）单元测试：mock WebView，验证调用

完成后，第 7a 步即可端到端工作。7b 步（跨设备 STOMP）复用 TS 端接收层，只需加服务端 HTTP 端点。
