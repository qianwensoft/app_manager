# 键盘HID输出功能实现方案

## 功能概述

在连接器步骤中增加"模拟键盘事件HID输出"类型，允许通过连接器向Android设备发送键盘输入模拟指令，实现自动化输入场景（如扫码后自动填充表单、模拟按键操作等）。

## 架构设计

### 1. 数据流向

```
触发器（设备事件/Webhook等）
  ↓
连接器阶段执行
  ↓
keyboard_hid 步骤
  ↓
后端 ExecuteAgentOutboundStep
  ↓
WebSocket 消息 → Android Agent
  ↓
AccessibilityService 模拟键盘输入
  ↓
目标应用接收输入
```

---

## 详细实现方案

### 一、后端调整

#### 1.1 模型层（无需修改）

`server/models/outbound.go` 中的 `OutboundConnectorStep.StepType` 已支持字符串类型，无需修改表结构。

新增步骤类型常量：`keyboard_hid`

#### 1.2 执行逻辑层

**文件：** `server/outbound/agent_step.go`

**修改位置：** `ExecuteAgentOutboundStep` 函数的 switch 语句

**新增 case：**

```go
case "keyboard_hid":
    var m struct {
        Text        string `json:"text"`          // 要输入的文本内容
        Keys        []string `json:"keys"`        // 特殊按键序列（如 ["ENTER", "TAB"]）
        DelayMs     int    `json:"delay_ms"`      // 按键间延迟（毫秒）
        TargetApp   string `json:"target_app"`   // 目标应用包名（可选，用于验证前台应用）
        InputMethod string `json:"input_method"` // 输入方式：text（文本输入）| keys（按键序列）| mixed（混合）
    }
    if err := json.Unmarshal([]byte(rawCfg), &m); err != nil {
        d.Error = "config_json: " + err.Error()
        d.DurationMS = time.Since(t0).Milliseconds()
        d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
        _ = db.Create(&d).Error
        return d
    }

    // 验证输入内容
    method := strings.TrimSpace(m.InputMethod)
    if method == "" {
        method = "text"
    }
    
    if method == "text" || method == "mixed" {
        if strings.TrimSpace(m.Text) == "" && len(m.Keys) == 0 {
            d.Error = "text 和 keys 不能同时为空"
            d.DurationMS = time.Since(t0).Milliseconds()
            d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
            _ = db.Create(&d).Error
            return d
        }
    } else if method == "keys" {
        if len(m.Keys) == 0 {
            d.Error = "keys 模式下必须提供按键序列"
            d.DurationMS = time.Since(t0).Milliseconds()
            d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
            _ = db.Create(&d).Error
            return d
        }
    }

    delayMs := m.DelayMs
    if delayMs < 0 {
        delayMs = 50 // 默认50ms按键间隔
    }
    if delayMs > 5000 {
        delayMs = 5000 // 最大5秒
    }

    data := map[string]interface{}{
        "input_method": method,
        "delay_ms":     delayMs,
    }
    
    if m.Text != "" {
        data["text"] = m.Text
    }
    if len(m.Keys) > 0 {
        data["keys"] = m.Keys
    }
    if m.TargetApp != "" {
        data["target_app"] = strings.TrimSpace(m.TargetApp)
    }

    msg := map[string]interface{}{
        "type":       "command",
        "action":     "keyboard_input",
        "command_id": cmdID,
        "data":       data,
    }
    
    _ = agent.AgentHub.Send(key, msg)
    d.Status = "success"
    d.Error = ""
    d.DurationMS = time.Since(t0).Milliseconds()
    d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, cmdID, msg, "")
    _ = db.Create(&d).Error
    return d
```

#### 1.3 步骤类型规范化

**文件：** `server/outbound/agent_step.go` 或相关工具文件

确保 `NormalizeOutboundStepType` 函数识别 `keyboard_hid` 类型。

---

### 二、Android Agent 调整

#### 2.1 命令常量定义

**文件：** `agent/app/src/main/java/com/appmanager/agent/ws/CommandAction.kt`

**新增常量：**

```kotlin
const val KEYBOARD_INPUT = "keyboard_input"
```

#### 2.2 命令分发

**文件：** `agent/app/src/main/java/com/appmanager/agent/command/CommandDispatcher.kt`

**在 `dispatch` 函数的 `when (msg.action)` 分支中新增：**

```kotlin
CommandAction.KEYBOARD_INPUT -> SystemCommandHandler.keyboardInput(msg, service)
```

#### 2.3 键盘输入处理器

**文件：** `agent/app/src/main/java/com/appmanager/agent/command/SystemCommandHandler.kt`

**新增方法：**

```kotlin
fun keyboardInput(msg: Message, service: AgentService) {
    val data = msg.data as? Map<*, *>
    if (data == null) {
        CommandDispatcher.sendResult(service, msg.commandId, false, "missing data")
        return
    }

    val inputMethod = (data["input_method"] as? String)?.trim() ?: "text"
    val text = (data["text"] as? String) ?: ""
    val keysRaw = data["keys"] as? List<*>
    val keys = keysRaw?.mapNotNull { it?.toString()?.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
    val delayMs = (data["delay_ms"] as? Number)?.toLong() ?: 50L
    val targetApp = (data["target_app"] as? String)?.trim()

    try {
        // 验证前台应用（如果指定）
        if (!targetApp.isNullOrEmpty()) {
            val currentApp = getCurrentForegroundApp(service)
            if (currentApp != targetApp) {
                CommandDispatcher.sendResult(
                    service, msg.commandId, false, 
                    "Target app mismatch: current=$currentApp, expected=$targetApp"
                )
                return
            }
        }

        // 调用 AccessibilityService 模拟输入
        val success = when (inputMethod) {
            "text" -> {
                KeyboardInputHelper.inputText(service, text, delayMs)
            }
            "keys" -> {
                KeyboardInputHelper.inputKeys(service, keys, delayMs)
            }
            "mixed" -> {
                KeyboardInputHelper.inputText(service, text, delayMs) &&
                KeyboardInputHelper.inputKeys(service, keys, delayMs)
            }
            else -> false
        }

        if (success) {
            CommandDispatcher.sendResult(service, msg.commandId, true, "Input completed")
        } else {
            CommandDispatcher.sendResult(service, msg.commandId, false, "Input failed or accessibility service not enabled")
        }
    } catch (e: Exception) {
        Log.e("SystemCommandHandler", "keyboardInput failed", e)
        CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "Unknown error")
    }
}

private fun getCurrentForegroundApp(service: AgentService): String? {
    // 通过 UsageStatsManager 或现有逻辑获取前台应用包名
    // 可复用现有的前台应用检测逻辑
    return null // TODO: 实现前台应用获取
}
```

#### 2.4 键盘输入辅助工具类

**新建文件：** `agent/app/src/main/java/com/appmanager/agent/util/KeyboardInputHelper.kt`

```kotlin
package com.appmanager.agent.util

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.appmanager.agent.service.AgentService
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

object KeyboardInputHelper {

    private const val TAG = "KeyboardInputHelper"

    /**
     * 输入文本内容
     * @param service AgentService 实例
     * @param text 要输入的文本
     * @param delayMs 字符间延迟（毫秒）
     * @return 是否成功
     */
    fun inputText(service: AgentService, text: String, delayMs: Long): Boolean {
        if (text.isEmpty()) return true

        try {
            val accessibilityService = getAccessibilityService(service) ?: return false
            
            // 方法1：使用剪贴板粘贴（快速但可能影响用户剪贴板）
            if (delayMs == 0L || text.length > 50) {
                return pasteText(service, text)
            }

            // 方法2：逐字符模拟输入（适用于短文本）
            return runBlocking {
                text.forEach { char ->
                    if (!inputCharacter(accessibilityService, char)) {
                        return@runBlocking false
                    }
                    if (delayMs > 0) {
                        delay(delayMs)
                    }
                }
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "inputText failed", e)
            return false
        }
    }

    /**
     * 输入特殊按键序列
     * @param service AgentService 实例
     * @param keys 按键名称列表（如 ["ENTER", "TAB", "BACK"]）
     * @param delayMs 按键间延迟（毫秒）
     * @return 是否成功
     */
    fun inputKeys(service: AgentService, keys: List<String>, delayMs: Long): Boolean {
        if (keys.isEmpty()) return true

        try {
            val accessibilityService = getAccessibilityService(service) ?: return false

            return runBlocking {
                keys.forEach { keyName ->
                    if (!performKeyAction(accessibilityService, keyName)) {
                        Log.w(TAG, "Failed to perform key: $keyName")
                        return@runBlocking false
                    }
                    if (delayMs > 0) {
                        delay(delayMs)
                    }
                }
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "inputKeys failed", e)
            return false
        }
    }

    /**
     * 使用剪贴板粘贴文本（快速方式）
     */
    private fun pasteText(service: AgentService, text: String): Boolean {
        try {
            val clipboardManager = service.getSystemService(android.content.Context.CLIPBOARD_SERVICE) 
                as? android.content.ClipboardManager ?: return false
            
            val clip = android.content.ClipData.newPlainText("keyboard_input", text)
            clipboardManager.setPrimaryClip(clip)

            // 模拟 Ctrl+V 或调用粘贴 Action
            val accessibilityService = getAccessibilityService(service) ?: return false
            
            // 尝试在焦点节点执行粘贴
            val focusedNode = accessibilityService.rootInActiveWindow
                ?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            
            return if (focusedNode != null) {
                val args = Bundle()
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            } else {
                accessibilityService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_PASTE)
            }
        } catch (e: Exception) {
            Log.e(TAG, "pasteText failed", e)
            return false
        }
    }

    /**
     * 输入单个字符
     */
    private fun inputCharacter(service: AccessibilityService, char: Char): Boolean {
        try {
            val focusedNode = service.rootInActiveWindow
                ?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
            
            val currentText = focusedNode.text?.toString() ?: ""
            val args = Bundle()
            args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                currentText + char
            )
            return focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } catch (e: Exception) {
            Log.e(TAG, "inputCharacter failed", e)
            return false
        }
    }

    /**
     * 执行特殊按键操作
     */
    private fun performKeyAction(service: AccessibilityService, keyName: String): Boolean {
        return when (keyName.uppercase()) {
            "ENTER", "RETURN" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS) // 占位，需根据实际API调整
                // 或查找当前输入框并模拟回车
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                focusedNode?.performAction(AccessibilityNodeInfo.ACTION_IME_ACTION) ?: false
            }
            "TAB" -> {
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                focusedNode?.performAction(AccessibilityNodeInfo.ACTION_NEXT_AT_MOVEMENT_GRANULARITY) ?: false
            }
            "BACK", "BACKSPACE" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            }
            "HOME" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            }
            "RECENT", "RECENTS" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            }
            "DELETE", "DEL" -> {
                // 模拟删除键
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val currentText = focusedNode.text?.toString() ?: ""
                    if (currentText.isNotEmpty()) {
                        val args = Bundle()
                        args.putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            currentText.dropLast(1)
                        )
                        focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    } else false
                } else false
            }
            else -> {
                Log.w(TAG, "Unknown key: $keyName")
                false
            }
        }
    }

    /**
     * 获取 AccessibilityService 实例
     * 注意：AgentService 需要继承或持有 AccessibilityService 引用
     */
    private fun getAccessibilityService(service: AgentService): AccessibilityService? {
        // 如果 AgentService 本身是 AccessibilityService，直接返回
        // 否则需要通过其他方式获取（如单例模式）
        return if (service is AccessibilityService) {
            service
        } else {
            // 假设有全局 AccessibilityService 单例
            // TouchAccessibilityService.instance
            null // TODO: 根据实际架构调整
        }
    }
}
```

#### 2.5 权限说明

**文件：** `agent/app/src/main/AndroidManifest.xml`

确保已声明 AccessibilityService 权限（项目中已有 TouchAccessibilityService，可复用）。

---

### 三、前端UI调整

#### 3.1 步骤类型选择器

**文件：** `web/src/views/OutboundConnectorEdit.vue`

**修改位置：** 第530-537行的 `el-select` 选项

**新增选项：**

```vue
<el-option label="键盘HID输出" value="keyboard_hid" />
```

#### 3.2 步骤配置表单

**文件：** `web/src/views/OutboundConnectorEdit.vue`

**在步骤行配置区域（约第588行之后）新增：**

```vue
<template v-else-if="st.step_type === 'keyboard_hid'">
  <div class="keyboard-hid-config" style="flex: 1; display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
    <el-select v-model="st.config.input_method" style="width: 140px" size="small">
      <el-option label="文本输入" value="text" />
      <el-option label="按键序列" value="keys" />
      <el-option label="混合模式" value="mixed" />
    </el-select>
    
    <template v-if="st.config.input_method === 'text' || st.config.input_method === 'mixed'">
      <el-input 
        v-model="st.config.text" 
        placeholder="输入文本，支持占位符 {{context.value}}" 
        style="flex: 1; min-width: 200px"
        size="small"
      />
    </template>
    
    <template v-if="st.config.input_method === 'keys' || st.config.input_method === 'mixed'">
      <el-select 
        v-model="st.config.keys" 
        multiple 
        filterable 
        allow-create 
        default-first-option
        placeholder="选择按键（如ENTER, TAB）"
        style="flex: 1; min-width: 180px"
        size="small"
      >
        <el-option label="ENTER（回车）" value="ENTER" />
        <el-option label="TAB（制表符）" value="TAB" />
        <el-option label="BACK（返回）" value="BACK" />
        <el-option label="DELETE（删除）" value="DELETE" />
        <el-option label="HOME（主页）" value="HOME" />
      </el-select>
    </template>
    
    <el-input-number
      v-model="st.config.delay_ms"
      :min="0"
      :max="5000"
      :step="10"
      controls-position="right"
      placeholder="按键间隔ms"
      style="width: 130px"
      size="small"
      title="按键/字符间延迟（毫秒），0表示无延迟"
    />
    
    <el-input
      v-model="st.config.target_app"
      placeholder="目标应用包名（可选）"
      style="width: 200px"
      size="small"
      clearable
      title="可选：验证前台应用包名，不匹配则跳过输入"
    />
  </div>
</template>
```

#### 3.3 步骤类型切换处理

**文件：** `web/src/views/OutboundConnectorEdit.vue`

**在 `onConnStepTypeChange` 函数中（约第2000行附近）新增：**

```javascript
function onConnStepTypeChange(ph, si) {
  const st = ph.steps[si]
  if (!st.config) st.config = {}
  
  // ... 现有逻辑 ...
  
  if (st.step_type === 'keyboard_hid') {
    if (!st.config.input_method) st.config.input_method = 'text'
    if (!st.config.text) st.config.text = ''
    if (!st.config.keys) st.config.keys = []
    if (st.config.delay_ms === undefined) st.config.delay_ms = 50
    if (!st.config.target_app) st.config.target_app = ''
  }
}
```

#### 3.4 步骤摘要显示

**文件：** `web/src/views/OutboundConnectorEdit.vue`

**在步骤行显示区域（用于显示步骤摘要）新增：**

```vue
<template v-else-if="st.step_type === 'keyboard_hid'">
  <span class="step-summary">
    {{ st.config.input_method === 'keys' ? '按键: ' + (st.config.keys || []).join(', ') : '文本: ' + (st.config.text || '(空)') }}
  </span>
</template>
```

---

### 四、配置初始化

#### 4.1 新建步骤默认值

**文件：** `web/src/views/OutboundConnectorEdit.vue`

**在 `addConnStep` 函数中确保初始化：**

```javascript
function addConnStep(pi) {
  const st = {
    step_type: 'http',
    endpoint_id: null,
    delay_before_ms: 0,
    delay_after_ms: 0,
    config: {
      context_merge_before: 'off',
      context_merge_after: 'off',
      // keyboard_hid 相关字段会在 onConnStepTypeChange 中初始化
    },
    // ... 其他字段
  }
  form.phases[pi].steps.push(st)
}
```

---

### 五、测试场景

#### 5.1 基础文本输入

**连接器配置：**
- 触发器：设备事件（扫码）
- 步骤类型：keyboard_hid
- 输入方式：text
- 文本内容：`{{context.value}}`（扫码值）
- 按键间隔：50ms

**预期结果：** 扫码后，扫码值自动输入到当前焦点输入框

#### 5.2 按键序列操作

**连接器配置：**
- 步骤类型：keyboard_hid
- 输入方式：keys
- 按键序列：["TAB", "TAB", "ENTER"]

**预期结果：** 依次按下两次TAB键和一次回车键

#### 5.3 混合模式（文本+回车）

**连接器配置：**
- 步骤类型：keyboard_hid
- 输入方式：mixed
- 文本内容：`{{context.employee_id}}`
- 按键序列：["ENTER"]
- 按键间隔：100ms

**预期结果：** 输入员工ID后自动按下回车键

#### 5.4 前台应用验证

**连接器配置：**
- 目标应用：`com.example.warehouse`
- 文本内容：`{{context.value}}`

**预期结果：** 仅当指定应用在前台时才执行输入，否则返回失败

---

### 六、注意事项

#### 6.1 权限要求

- **无障碍服务权限：** 用户需在Android设置中启用Agent的无障碍服务
- **提示用户：** 首次使用时前端应提示用户授权

#### 6.2 安全考虑

- **输入内容过滤：** 避免注入恶意字符（如控制字符）
- **目标应用验证：** 建议配置目标应用包名，防止误输入到其他应用
- **审计日志：** 所有键盘输入操作应记录在 `outbound_deliveries` 表中

#### 6.3 兼容性

- **Android版本：** 需Android 5.0+（API 21+）
- **AccessibilityService限制：** 部分厂商ROM可能限制无障碍服务功能
- **输入法兼容：** 某些输入法可能拦截或修改输入内容

#### 6.4 性能优化

- **长文本优化：** 超过50字符自动使用剪贴板粘贴方式
- **按键间隔：** 默认50ms，可根据目标应用响应速度调整
- **超时控制：** 单次输入操作应设置合理超时（如10秒）

---

### 七、实现优先级

#### P0（核心功能）

1. ✅ 后端 `keyboard_hid` case 逻辑
2. ✅ Agent 命令分发和处理器
3. ✅ 前端步骤类型选择和基本配置UI
4. ✅ 文本输入模式（text）

#### P1（重要功能）

5. ✅ 按键序列模式（keys）
6. ✅ 混合模式（mixed）
7. ✅ 前台应用验证
8. ✅ 按键间隔配置

#### P2（优化增强）

9. 剪贴板粘贴优化（长文本）
10. 更多特殊按键支持（方向键、功能键等）
11. 输入位置指定（坐标或节点选择器）
12. 输入前清空现有内容选项

---

### 八、文件清单

**需要修改的文件：**

1. `server/outbound/agent_step.go` - 新增 keyboard_hid case
2. `agent/app/src/main/java/com/appmanager/agent/ws/CommandAction.kt` - 新增常量
3. `agent/app/src/main/java/com/appmanager/agent/command/CommandDispatcher.kt` - 新增分发逻辑
4. `agent/app/src/main/java/com/appmanager/agent/command/SystemCommandHandler.kt` - 新增处理方法
5. `web/src/views/OutboundConnectorEdit.vue` - 新增UI配置

**需要新建的文件：**

6. `agent/app/src/main/java/com/appmanager/agent/util/KeyboardInputHelper.kt` - 键盘输入工具类

---

### 九、后续扩展方向

1. **手势模拟：** 支持滑动、长按等手势操作
2. **OCR识别：** 识别屏幕内容后智能输入
3. **脚本化输入：** 支持复杂的条件判断和循环输入
4. **多设备同步：** 批量向多台设备发送相同输入指令
5. **输入宏：** 预定义常用输入序列，快速调用

---

## 实施时间估算

- **后端开发：** 2小时
- **Android Agent开发：** 4小时
- **前端UI开发：** 2小时
- **联调测试：** 2小时
- **文档完善：** 1小时

**总计：** 约11小时（1.5个工作日）

---

## 验收标准

1. ✅ 能够通过连接器向设备发送文本输入指令
2. ✅ 支持特殊按键序列（ENTER、TAB等）
3. ✅ 支持占位符动态内容（如 `{{context.value}}`）
4. ✅ 前端UI配置完整且直观
5. ✅ 错误处理完善，异常情况有明确提示
6. ✅ 执行日志完整记录在 outbound_deliveries 表

---

**文档版本：** v1.0  
**创建日期：** 2026-06-10  
**最后更新：** 2026-06-10
