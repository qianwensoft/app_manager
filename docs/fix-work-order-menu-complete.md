# 工单菜单问题修复完整记录

## 问题描述
1. App 端缺少"工单处理"和"我的工单"菜单
2. 菜单下发后 App 端提示"暂无下发菜单"
3. 菜单能看到但"点不开"

## 根本原因

### 问题1：表缺失
`work_order_progress` 和 `work_order_progress_attachments` 表未在 `db.go` 的 `migrateGroups` 中注册，导致未自动创建。

### 问题2：菜单未创建
后端未包含工单菜单的种子数据。

### 问题3：菜单字段错误
- `ShowOnAgentHome` 模型定义为 `gorm:"default:true"`，导致即使代码设置为 `false`，数据库仍为 `true`
- `BackendMenuActivity` 只显示 `show_on_agent_home=false` 的菜单
- 结果：菜单创建后显示为 `true`，不会出现在后台菜单列表中

### 问题4：Intent 跳转逻辑缺失
`BackendMenuActivity.openMenuInternal()` 只处理了 `form_app_entry` 类型，`agent_native` 类型走了 `else` 分支，试图打开 WebView 而不是启动 Activity。

## 修复步骤

### 1. 修复数据库表缺失
**文件**：`server/database/db.go:195`

添加模型到 Group 9：
```go
&models.WorkOrderProgress{},
&models.WorkOrderProgressAttachment{},
```

### 2. 添加菜单种子数据
**文件**：`server/database/seed_agent_menus.go`

新增 `seedWorkOrderMenus()` 函数，创建两个菜单：
- 工单处理 (intent: `com.appmanager.agent.WORK_ORDER_LIST`)
- 我的工单 (intent: `com.appmanager.agent.MY_WORK_ORDER_LIST`)

### 3. 添加 Intent 跳转逻辑
**文件**：`agent/app/src/main/java/com/appmanager/agent/ui/BackendMenuActivity.kt:161`

添加 `agent_native` 类型处理：
```kotlin
"agent_native" -> {
    val intentAction = (menu["intent_action"] as? String)?.trim()
    if (intentAction.isNullOrEmpty()) {
        Toast.makeText(this, "菜单配置错误：缺少 intent_action", Toast.LENGTH_SHORT).show()
        return
    }
    try {
        val intent = Intent(intentAction)
        startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(this, "打开失败: ${e.message}", Toast.LENGTH_SHORT).show()
        Log.e("BackendMenuActivity", "Failed to open menu with intent: $intentAction", e)
    }
}
```

### 4. 添加 Activity Intent Filter
**文件**：`agent/app/src/main/AndroidManifest.xml`

为两个 Activity 添加 intent-filter：
```xml
<activity android:name=".ui.WorkOrderListActivity" ...>
    <intent-filter>
        <action android:name="com.appmanager.agent.WORK_ORDER_LIST" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>

<activity android:name=".ui.MyWorkOrderListActivity" ...>
    <intent-filter>
        <action android:name="com.appmanager.agent.MY_WORK_ORDER_LIST" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

## 部署记录（192.168.102.40）

### 服务器端
1. **编译新版本**
   ```bash
   cd /Volumes/data/workspace/qianwen/app-manager
   make server-linux-amd64
   ```

2. **上传并部署**
   ```bash
   scp bin/app-manager-linux-amd64 root@192.168.102.40:/opt/app-manager/app-manager-new
   ssh root@192.168.102.40 "cd /opt/app-manager && cp app-manager app-manager.bak && mv app-manager-new app-manager && chmod +x app-manager && systemctl restart app-manager"
   ```

3. **验证服务**
   - 服务状态：✅ active (running)
   - 菜单创建：✅ id=9 (工单处理), id=10 (我的工单)

4. **分配菜单到所有设备**
   ```bash
   curl -X PUT -H "Authorization: Bearer $TOKEN" \
     -d '{"menu_id": 9, "device_ids": [7,9,10,22,26,28,29,30,31,33,38,40,42,43,44,45,46,47,48,49,50,51,52,53,54,56,59,60,61,62,63,64,65,67,68,69,70,71]}' \
     http://192.168.102.40:88/api/agent-menus/assignments
   ```

5. **修复菜单字段**
   由于 `show_on_agent_home` 默认值问题，手动更新菜单：
   ```bash
   curl -X PUT -H "Authorization: Bearer $TOKEN" \
     -d '{"title":"工单处理","target_type":"agent_native","target_ref":"work_order_list","intent_action":"com.appmanager.agent.WORK_ORDER_LIST","show_on_agent_home":false,"open_mode":"push","sort_order":100}' \
     http://192.168.102.40:88/api/agent-menus/9
   ```

### Android 端
1. **编译新版本**
   ```bash
   cd agent && ./gradlew assembleDebug
   ```

2. **上传 APK**
   ```bash
   scp agent/app/build/outputs/apk/debug/app-debug.apk root@192.168.102.40:/opt/app-manager/agent-app.apk
   ```

3. **APK 信息**
   - 文件大小：28MB
   - 上传时间：2026-06-22 17:49
   - 路径：`/opt/app-manager/agent-app.apk`

## 验证清单

### 服务器端
- [x] 服务正常运行
- [x] 菜单已创建（id=9, id=10）
- [x] 菜单字段正确（title, intent_action, show_on_agent_home=false）
- [x] 菜单已分配给所有设备

### App 端（需要用户操作）
- [ ] 安装新版本 APK
- [ ] 重启 App 同步菜单
- [ ] 在"后台菜单"中能看到两个工单菜单
- [ ] 点击"工单处理"能打开 WorkOrderListActivity
- [ ] 点击"我的工单"能打开 MyWorkOrderListActivity
- [ ] 工单列表能正常加载
- [ ] 工单详情能正常打开
- [ ] 工单进展能正常显示

## 用户操作指南

### 安装新版本 App
1. 从服务器下载 APK：`http://192.168.102.40:88/api/agent-updates/latest`
2. 或通过 ADB 安装：
   ```bash
   adb install -r /opt/app-manager/agent-app.apk
   ```

### 同步菜单
1. 完全退出 App（清除后台）
2. 重新打开 App
3. 进入"后台菜单"
4. 应该能看到"工单处理"和"我的工单"两个菜单项

### 测试功能
1. 点击"工单处理"→ 查看所有工单列表
2. 点击"我的工单"→ 查看当前账号的工单
3. 点击任意工单 → 进入详情页
4. 查看工单进展记录

## 问题排查

### 如果看不到菜单
1. 检查是否已登录账号
2. 检查设备是否已分配菜单（Web 后台）
3. 查看 logcat 日志：
   ```bash
   adb logcat -s AgentMenuSync:* AgentMenuStore:*
   ```

### 如果菜单点不开
1. 确认已安装最新版本 APK（17:49 编译的版本）
2. 查看 logcat 错误信息：
   ```bash
   adb logcat | grep -E "BackendMenuActivity|WorkOrder|Intent"
   ```
3. 手动测试 Intent：
   ```bash
   adb shell am start -n com.appmanager.agent/.ui.WorkOrderListActivity
   ```

### 如果工单列表加载失败
1. 检查网络连接
2. 检查服务器 API：
   ```bash
   curl -H "X-Device-Token: YOUR_TOKEN" http://192.168.102.40:88/api/work-orders?limit=50
   ```
3. 查看 API 返回错误信息

## 技术债务和后续优化

### 1. GORM 默认值问题
**问题**：`ShowOnAgentHome bool gorm:"default:true"` 导致 Go 代码设置为 `false` 时，数据库仍为 `true`

**解决方案**：
- 方案A：使用指针类型 `*bool`，避免 Go 零值与数据库默认值冲突
- 方案B：显式指定 `gorm:"default:false"`（但需要迁移已有数据）
- 方案C：在代码中使用 `Select` 显式指定字段

**建议**：采用方案A，修改模型定义：
```go
ShowOnAgentHome *bool `gorm:"default:true" json:"show_on_agent_home"`
```

### 2. 菜单路由统一化
**问题**：菜单类型处理分散在多处（MainActivity、BackendMenuActivity）

**建议**：创建统一的 `MenuRouter` 类处理所有菜单类型：
```kotlin
object MenuRouter {
    fun open(context: Context, menu: Map<String, Any?>) {
        when (menu["target_type"]) {
            "form_app_entry" -> launchFormApp(context, menu)
            "agent_native" -> launchIntent(context, menu)
            "webview_url" -> launchWebView(context, menu)
            "scada_preview" -> launchScada(context, menu)
        }
    }
}
```

### 3. 菜单同步机制优化
**问题**：菜单更新后需要手动重启 App 才能生效

**建议**：
- 添加"刷新菜单"按钮
- 监听 STOMP 推送实时更新菜单
- 定期自动同步菜单（如每小时）

## 相关文档
- `docs/fix-work-order-progress-tables.md` - 数据库表修复
- `docs/setup-work-order-menus.md` - 菜单配置详细说明
- `docs/android-work-order-module.md` - Android 工单模块
- `docs/work-order-complete-summary.md` - 工单系统完整总结
- `docs/deployment-work-order-menus-192.168.102.40.md` - 本次部署记录

## 时间线
- 17:00 - 发现问题：App 端缺少工单菜单
- 17:10 - 修复数据库表缺失问题
- 17:20 - 添加菜单种子数据
- 17:30 - 部署新版本服务器
- 17:33 - 菜单自动创建成功
- 17:35 - 分配菜单到所有设备
- 17:40 - 发现菜单"点不开"问题
- 17:45 - 定位 Intent 跳转逻辑缺失
- 17:47 - 修复 BackendMenuActivity 代码
- 17:49 - 重新编译并上传 APK
- 17:50 - 完成部署

## 总结
本次修复涉及：
- 后端：数据库表、菜单种子数据、API 配置
- Android：Activity 注册、Intent 跳转逻辑、菜单处理流程
- 部署：服务器更新、APK 更新、菜单配置

所有代码已编译并部署到生产环境，用户需要安装新版本 APK 即可使用完整功能。
