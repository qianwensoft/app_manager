# 工单菜单问题快速修复指南

## ✅ 已修复的问题

数据库中的菜单配置 `show_on_agent_home` 设置错误，已修复为：
```sql
show_on_agent_home = 0  -- 显示在后台菜单，而不是主屏幕
```

---

## 📱 现在需要做的事情

### 步骤 1：重启服务器（如果服务器在运行）

```bash
# 停止服务器
# Ctrl+C 或使用进程管理工具

# 重新启动
cd server
go run . ../server/config.sqlite.yaml
```

### 步骤 2：设备上强制同步菜单

有三种方法：

**方法 A：重启应用（推荐）**
```bash
adb shell am force-stop com.appmanager.agent
adb shell am start -n com.appmanager.agent/.MainActivity
```

**方法 B：清除应用数据（需要重新配置）**
```bash
adb shell pm clear com.appmanager.agent
# 然后重新打开应用，配置服务器地址和 token
```

**方法 C：在设备上手动操作**
- 完全退出应用（从最近任务中划掉）
- 重新打开应用

### 步骤 3：验证菜单位置

现在菜单应该：
- ❌ **不会**显示在主屏幕
- ✅ **会**显示在"后台菜单"中

**访问路径：**
1. 打开 Agent 应用
2. 点击主屏幕的"后台菜单"按钮
3. 应该能看到"工单处理"和"我的工单"

---

## 🔍 如果仍然无法打开

### 诊断 A：检查 APK 版本

确保设备上安装的是最新版本（包含工单模块的版本）：

```bash
# 查看设备上的版本
adb shell dumpsys package com.appmanager.agent | grep versionCode

# 重新安装最新 APK
cd /Volumes/data/workspace/qianwen/app-manager
make agent
make install-agent
```

### 诊断 B：查看点击日志

在点击菜单时实时查看日志：

```bash
# 终端 1：清除并监控日志
adb logcat -c
adb logcat | grep -E "BackendMenuActivity|WorkOrder|intent_action"

# 终端 2：或设备上点击菜单项
# 观察日志输出
```

**预期看到：**
```
BackendMenuActivity: Opening menu with intent_action: com.appmanager.agent.MY_WORK_ORDER_LIST
```

**如果看到错误：**
```
BackendMenuActivity: Failed to open menu with intent: xxx
ActivityNotFoundException: Unable to find explicit activity class
```
→ 说明 APK 版本不对，需要重新安装

### 诊断 C：直接测试 Activity

绕过菜单，直接启动 Activity：

```bash
# 测试"我的工单"
adb shell am start -n com.appmanager.agent/.ui.MyWorkOrderListActivity

# 测试"工单处理"  
adb shell am start -n com.appmanager.agent/.ui.WorkOrderListActivity
```

**结果分析：**
- ✅ 能打开 → 问题在菜单配置或同步，重新同步即可
- ❌ 报错 → APK 版本不对，需要重新安装

---

## 📋 完整的修复流程

```bash
# 1. 确保数据库已修复（已完成）
sqlite3 server/data/app-manager.db \
  "SELECT id, title, show_on_agent_home FROM agent_menu_items WHERE intent_action LIKE '%WORK_ORDER%';"
# 应该看到 show_on_agent_home = 0

# 2. 重启服务器（如果在运行）
# Ctrl+C 停止，然后重新启动

# 3. 检查设备连接
adb devices

# 4. 重新安装最新 APK
make agent
make install-agent

# 5. 重启应用触发菜单同步
adb shell am force-stop com.appmanager.agent
adb shell am start -n com.appmanager.agent/.MainActivity

# 6. 在设备上测试
# - 打开应用
# - 点击"后台菜单"
# - 点击"我的工单"或"工单处理"
```

---

## 🎯 预期结果

修复后：

1. **菜单位置**：在"后台菜单"中，而不是主屏幕
2. **点击效果**：能正常打开对应的工单列表页面
3. **功能测试**：
   - 下拉刷新正常工作
   - 扫码按钮可以启动相机
   - 列表显示工单数据

---

## ⚠️ 常见问题

### Q1: 重新安装后还是无法打开

**A**: 检查 AndroidManifest.xml 中的 Activity 注册：

```bash
adb shell dumpsys package com.appmanager.agent | grep "WorkOrderListActivity"
```

如果没有输出，说明 APK 构建有问题：
```bash
# 清理重新构建
cd agent
./gradlew clean
cd ..
make agent
make install-agent
```

### Q2: 提示"菜单配置错误：缺少 intent_action"

**A**: 菜单数据同步有问题，检查：
```bash
# 查看应用存储的菜单数据
adb shell "run-as com.appmanager.agent ls /data/data/com.appmanager.agent/files/" 2>/dev/null
```

解决方法：清除应用数据重新同步
```bash
adb shell pm clear com.appmanager.agent
```

### Q3: 应用崩溃

**A**: 查看崩溃日志：
```bash
adb logcat -d | grep -E "AndroidRuntime|FATAL" > crash.log
cat crash.log
```

---

## 📞 需要更多帮助？

如果以上步骤都无法解决，请提供：

1. **点击菜单后的具体现象**（截图或描述）
2. **logcat 日志**
   ```bash
   adb logcat -d > full.log
   ```
3. **应用版本信息**
   ```bash
   adb shell dumpsys package com.appmanager.agent | head -50 > app-info.txt
   ```

参考完整诊断文档：`docs/troubleshooting-work-order-menu.md`

---

**修复时间**: 2026-06-23  
**修复内容**: 数据库菜单配置 show_on_agent_home 从 1 改为 0
