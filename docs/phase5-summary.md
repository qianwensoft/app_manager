# Phase 5 完成总结：Agent 集成

## 完成时间
2026-05-01

## 目标
扩展 Agent 端支持 Form App 入口，实现菜单下发和事件路由集成。

## 已完成任务

### 1. 后端扩展

#### 1.1 AgentMenuItem 模型扩展
**文件**：`server/models/agent_menu.go`

**新增字段**：
```go
FormAppCode    string `gorm:"size:64" json:"form_app_code"`
FormAppPageKey string `gorm:"size:64" json:"form_app_page_key"`
```

**新增 TargetType**：`form_app_entry`

#### 1.2 菜单下发 API
**文件**：`server/api/form_app_deploy.go`（78 行）

**端点**：`POST /api/form-app/infos/:id/deploy-to-devices`

**请求体**：
```json
{
  "device_ids": [1, 2, 3],
  "entry_page_key": "form",
  "menu_title": "员工管理",
  "menu_icon": "",
  "show_on_agent_home": true
}
```

**功能**：
- 创建 AgentMenuItem（TargetType = form_app_entry）
- 批量创建 AgentMenuAssignment
- 返回 menu_id 和 device_count

### 2. Android Agent 端

#### 2.1 FormAppActivity
**文件**：`agent/app/src/main/java/com/appmanager/agent/FormAppActivity.kt`（44 行）

**功能**：
- WebView 容器
- 加载 Form App 运行时页面
- JavaScript Bridge 集成
- 返回键处理（WebView 历史记录）

**Intent 参数**：
- `form_app_code` - 应用编码
- `page_key` - 入口页面
- `server_url` - 服务器地址

#### 2.2 FormAppBridge
**文件**：`agent/app/src/main/java/com/appmanager/agent/FormAppBridge.kt`（38 行）

**功能**：
- `@JavascriptInterface getDeviceInfo()` - 获取设备信息
- `@JavascriptInterface scanBarcode()` - 触发扫码
- `onScanResult(data)` - 扫码结果回调
- `@JavascriptInterface toast(message)` - 显示提示

**JavaScript 调用**：
```javascript
// 前端调用
window.AndroidBridge.getDeviceInfo()
window.AndroidBridge.scanBarcode()
window.AndroidBridge.toast('提交成功')

// 扫码结果回调
window.eventManager.emit('barcode', data)
```

#### 2.3 MenuIntentReceiver 扩展
**文件**：`agent/app/src/main/java/com/appmanager/agent/MenuIntentReceiver.kt`

**新增逻辑**：
```kotlin
if (menuItem.targetType == "form_app_entry") {
    startActivity(FormAppActivity)
    return
}
```

#### 2.4 AgentMenuStore 扩展
**文件**：`agent/app/src/main/java/com/appmanager/agent/AgentMenuStore.kt`

**新增方法**：
- `getMenuByIntent(intentAction)` - 返回 MenuItem 数据类
- `getServerUrl()` - 获取 HTTP 服务器地址

**新增数据类**：
```kotlin
data class MenuItem(
    val targetType: String?,
    val targetRef: String?,
    val formAppCode: String?,
    val formAppPageKey: String?
)
```

## 代码统计

| 模块 | 文件 | 行数 | 说明 |
|------|------|------|------|
| 后端 | form_app_deploy.go | 78 | 菜单下发 API |
| 后端 | agent_menu.go | +2 | 模型字段扩展 |
| Android | FormAppActivity.kt | 44 | WebView 容器 |
| Android | FormAppBridge.kt | 38 | JavaScript Bridge |
| Android | MenuIntentReceiver.kt | +20 | 菜单路由扩展 |
| Android | AgentMenuStore.kt | +25 | 数据访问扩展 |
| **总计** | **6 个文件** | **~207** | |

## 集成流程

### 1. 菜单下发流程
```
管理后台 → POST /api/form-app/infos/:id/deploy-to-devices
    ↓
创建 AgentMenuItem (target_type=form_app_entry)
    ↓
创建 AgentMenuAssignment (绑定设备)
    ↓
Agent 同步菜单 → AgentMenuStore.save()
    ↓
MenuIntentReceiver.reregister() 注册广播
```

### 2. 菜单启动流程
```
用户点击菜单 → 发送 Intent (action=intent_action)
    ↓
MenuIntentReceiver.onReceive()
    ↓
检测 target_type == "form_app_entry"
    ↓
启动 FormAppActivity
    ↓
加载 /form-app/runtime/:code
    ↓
MultiPageRuntime 渲染
```

### 3. 扫码事件流程
```
用户扫码 → FormAppBridge.onScanResult(data)
    ↓
evaluateJavascript: eventManager.emit('barcode', data)
    ↓
EventHandler 监听器触发
    ↓
调用 /api/form-app/infos/:id/test-event
    ↓
后端匹配事件路由规则
    ↓
返回 target_page_key
    ↓
NavigationManager.push(pageKey, params)
    ↓
MultiPageRuntime 切换页面
```

## 测试场景

### 场景 1：菜单下发
```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -X POST "http://127.0.0.1:8080/api/form-app/infos/2/deploy-to-devices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_ids": [1],
    "entry_page_key": "form",
    "menu_title": "员工管理",
    "show_on_agent_home": true
  }'
```

### 场景 2：Agent 端启动
1. Agent 同步菜单
2. 点击"员工管理"菜单
3. 启动 FormAppActivity
4. 加载 `/form-app/runtime/employee_app`
5. 显示表单页

### 场景 3：扫码跳转
1. 在 FormAppActivity 中扫码 `EMP-001`
2. FormAppBridge.onScanResult("EMP-001")
3. JavaScript: eventManager.emit('barcode', 'EMP-001')
4. EventHandler 调用后端 test-event API
5. 匹配路由规则（prefix: EMP-）
6. 跳转到 detail 页面

## 待完成功能

> **状态同步（2026-06-05）**：剩余项归入 `docs/plan.md` Phase A2。

### Android 端
- [x] 集成扫码库（ZXing Android Embedded，复用 `SettingsActivity` 同款 `ScanContract`）
- [x] 实现 `scanBarcode()` → `launchBarcodeScan()`（`FormAppActivity.kt`）
- [x] 添加权限请求（CAMERA，`ActivityResultContracts.RequestPermission`）
- [x] 添加 `FormAppActivity` 到 `AndroidManifest.xml`
- [ ] 真机 E2E：WebView 加载 → 扫码 → `eventManager` 跳转

### 前端集成
- [x] 暴露 `eventManager` 到 `window`（`form-app/src/runtime/EventHandler.ts`）
- [ ] 运行时页面调用 `AndroidBridge` / `getDeviceInfo` 的完整联调
- [x] `getDeviceInfo()` Bridge 已实现（Agent 端）
- [ ] 优化移动端样式

### 测试
- [ ] 端到端测试（菜单下发 → Agent 启动 → 扫码跳转）
- [ ] 多设备下发测试
- [ ] 事件路由匹配测试
- [ ] WebView 性能测试

## 关键设计决策

### 1. WebView 容器
**决策**：使用 WebView 加载 Form App 运行时

**理由**：
- 复用前端代码
- 统一开发体验
- 支持热更新

### 2. JavaScript Bridge
**决策**：使用 @JavascriptInterface 暴露原生能力

**理由**：
- 简单直接
- 双向通信
- 易于扩展

### 3. 事件路由
**决策**：扫码结果通过 evaluateJavascript 传递到前端

**理由**：
- 前端统一处理路由逻辑
- 后端 API 验证规则
- 支持复杂匹配规则

## 总结

Phase 5 Agent 集成核心功能已完成，包括：
- ✅ 后端模型和 API 扩展
- ✅ Android Activity 和 Bridge
- ✅ 菜单路由集成
- ✅ 数据访问层扩展

**实际耗时**：约 1 小时

**预计剩余**：
- 扫码库集成：0.5 天
- 前端集成：0.5 天
- 测试和调试：1 天

**Phase 5 总进度**：核心功能 80%，完整功能 60%
