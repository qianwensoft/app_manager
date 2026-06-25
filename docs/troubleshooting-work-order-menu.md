# 工单菜单无法使用 - 问题诊断指南

## 问题描述

菜单已下发到前台（或后台菜单），但点击"工单处理"或"我的工单"无法打开。

---

## 快速诊断步骤

### 1️⃣ 确认 APK 版本

**检查设备上的 APK 是否是最新版本：**

```bash
# 查看设备上安装的版本
adb shell dumpsys package com.appmanager.agent | grep versionName

# 查看构建的 APK 修改时间
ls -lh agent/app/build/outputs/apk/debug/app-debug.apk
```

**解决方案：** 如果不是最新版本，重新安装：
```bash
make install-agent
```

---

### 2️⃣ 检查菜单配置

**问题：菜单的 target_type 和 intent_action 配置错误**

在服务器后台检查菜单配置：

1. 登录管理后台
2. 进入"Agent 菜单管理"
3. 找到"工单处理"和"我的工单"菜单
4. 检查配置：

```
工单处理：
- target_type: agent_native
- intent_action: com.appmanager.agent.WORK_ORDER_LIST
- show_on_agent_home: false (显示在后台菜单)

我的工单：
- target_type: agent_native  
- intent_action: com.appmanager.agent.MY_WORK_ORDER_LIST
- show_on_agent_home: false (显示在后台菜单)
```

**常见错误：**
- ❌ `target_type` 写成了 `form_app_entry`
- ❌ `intent_action` 为空或拼写错误
- ❌ `target_type` 为空，导致走默认的 WebView 路径

---

### 3️⃣ 检查菜单同步

**问题：设备未收到最新的菜单配置**

```bash
# 查看设备日志
adb logcat | grep -E "AgentMenuSync|menu-manifest"
```

**解决方案：**
1. 在设备上重启 Agent 应用
2. 或在服务器后台点击"强制同步菜单"
3. 或在设备上清除应用数据后重新配置

---

### 4️⃣ 查看点击日志

**在设备上点击菜单，同时查看日志：**

```bash
adb logcat -c  # 清除日志
adb logcat | grep -E "BackendMenuActivity|WorkOrder|intent_action"
```

**预期看到的日志：**
```
BackendMenuActivity: menu intent received action=com.appmanager.agent.WORK_ORDER_LIST
```

**可能的错误日志：**
```
BackendMenuActivity: Failed to open menu with intent: xxx
ActivityNotFoundException: No Activity found to handle Intent
```

---

### 5️⃣ 检查 Activity 注册

**验证 Activity 是否正确注册：**

```bash
adb shell dumpsys package com.appmanager.agent | grep -A 3 "WorkOrderListActivity"
```

**预期输出：**
```
Activity #xxx:
  com.appmanager.agent.ui.WorkOrderListActivity
  exported=false
```

**如果没有输出，说明 APK 版本不对，需要重新安装。**

---

### 6️⃣ 测试显式启动

**直接通过 ADB 启动 Activity 测试：**

```bash
# 测试工单处理页面
adb shell am start -n com.appmanager.agent/.ui.WorkOrderListActivity

# 测试我的工单页面
adb shell am start -n com.appmanager.agent/.ui.MyWorkOrderListActivity
```

**结果分析：**
- ✅ 如果能正常打开 → 问题在菜单配置或同步
- ❌ 如果报错 → 问题在 APK 版本或 Activity 注册

---

## 完整排查流程

### 步骤 1：确认环境

```bash
# 1. 检查设备连接
adb devices

# 2. 检查应用是否安装
adb shell pm list packages | grep appmanager

# 3. 检查应用版本
adb shell dumpsys package com.appmanager.agent | grep versionCode
```

### 步骤 2：重新安装最新 APK

```bash
# 1. 构建最新 APK
make agent

# 2. 安装到设备（覆盖安装）
make install-agent

# 3. 验证安装
adb shell pm list packages -f | grep appmanager
```

### 步骤 3：检查服务器菜单配置

登录后台管理系统，检查：

1. **菜单是否存在**
   - 进入"Agent 菜单管理"
   - 确认"工单处理"和"我的工单"菜单存在

2. **菜单配置是否正确**
   ```json
   {
     "title": "工单处理",
     "target_type": "agent_native",
     "intent_action": "com.appmanager.agent.WORK_ORDER_LIST",
     "show_on_agent_home": false
   }
   ```

3. **菜单是否已分配给设备**
   - 进入"设备管理"
   - 选择目标设备
   - 检查"已分配菜单"列表

### 步骤 4：触发菜单同步

```bash
# 方法 1：重启应用
adb shell am force-stop com.appmanager.agent
adb shell am start -n com.appmanager.agent/.MainActivity

# 方法 2：清除应用数据（需重新配置服务器地址）
adb shell pm clear com.appmanager.agent
```

### 步骤 5：实时查看日志

```bash
# 清除旧日志
adb logcat -c

# 实时查看相关日志
adb logcat | grep -E "BackendMenuActivity|WorkOrder|AgentMenu|intent_action"
```

**在设备上操作：**
1. 打开 Agent 应用
2. 点击"后台菜单"
3. 点击"工单处理"或"我的工单"

**观察日志输出。**

---

## 常见问题和解决方案

### 问题 1：点击菜单无反应

**可能原因：**
- 菜单配置中 `intent_action` 为空
- 设备未收到最新菜单配置

**解决方案：**
1. 检查服务器后台菜单配置
2. 重启应用触发菜单同步
3. 查看日志确认

### 问题 2：提示"打开失败"

**可能原因：**
- APK 版本太旧，没有新的 Activity
- Activity 未正确注册

**解决方案：**
```bash
# 重新安装最新 APK
make agent
make install-agent

# 验证 Activity 注册
adb shell dumpsys package com.appmanager.agent | grep WorkOrder
```

### 问题 3：提示"菜单配置错误：缺少 intent_action"

**可能原因：**
- 服务器菜单配置中 `intent_action` 字段为空

**解决方案：**
1. 登录后台管理系统
2. 编辑菜单
3. 设置正确的 `intent_action`：
   - 工单处理：`com.appmanager.agent.WORK_ORDER_LIST`
   - 我的工单：`com.appmanager.agent.MY_WORK_ORDER_LIST`

### 问题 4：菜单显示在主屏幕而不是后台菜单

**可能原因：**
- `show_on_agent_home` 设置为 `true`

**解决方案：**
1. 编辑菜单配置
2. 设置 `show_on_agent_home: false`
3. 重新分配菜单给设备

### 问题 5：打开后立即崩溃

**可能原因：**
- 网络配置错误
- 缺少必要权限

**解决方案：**
```bash
# 查看崩溃日志
adb logcat | grep -E "AndroidRuntime|FATAL"

# 检查网络权限
adb shell dumpsys package com.appmanager.agent | grep INTERNET
```

---

## 调试命令速查

```bash
# 查看应用信息
adb shell dumpsys package com.appmanager.agent

# 查看实时日志
adb logcat | grep WorkOrder

# 清除日志
adb logcat -c

# 重启应用
adb shell am force-stop com.appmanager.agent
adb shell am start -n com.appmanager.agent/.MainActivity

# 直接启动工单页面
adb shell am start -n com.appmanager.agent/.ui.MyWorkOrderListActivity

# 查看崩溃日志
adb logcat -d | grep -E "AndroidRuntime|FATAL" > crash.log

# 收集完整日志
adb logcat -d > full.log
```

---

## 使用测试工具

我提供了自动化测试脚本：

```bash
# 运行完整测试
./scripts/test-work-order.sh full

# 查看日志
./scripts/test-work-order.sh logs

# 收集诊断信息
./scripts/test-work-order.sh diag
```

---

## 联系支持

如果以上步骤都无法解决问题，请收集以下信息：

1. **设备日志**
   ```bash
   adb logcat -d > device.log
   ```

2. **应用信息**
   ```bash
   adb shell dumpsys package com.appmanager.agent > package.log
   ```

3. **菜单配置截图**
   - 后台管理系统中的菜单配置

4. **具体错误信息**
   - 点击菜单后的提示内容
   - logcat 中的错误日志

---

## 预防措施

### 开发环境
- 每次修改代码后都要重新安装 APK
- 使用 `make install-agent` 而不是手动 adb install

### 生产环境
- 修改菜单配置后通知所有用户重启应用
- 使用"强制同步菜单"功能推送最新配置
- 在正式发布前在测试设备上验证

---

**最后更新**: 2026-06-23
