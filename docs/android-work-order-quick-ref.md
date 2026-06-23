# Android 工单模块 - 快速参考卡片

## 🚀 快速开始

### 构建和安装
```bash
# 构建 APK
make agent

# 安装到设备
make install-agent

# 或使用测试工具
./scripts/test-work-order.sh full
```

### 访问入口
1. 打开 Agent 应用
2. 点击**后台菜单**
3. 选择：
   - **我的工单** - 查看本设备工单
   - **工单处理** - 查看所有工单（需权限）

---

## 📱 核心功能

### 1️⃣ 下拉刷新
- **操作**: 在列表顶部下拉
- **效果**: 重新加载工单数据
- **状态**: 显示刷新指示器

### 2️⃣ 扫码搜索
- **操作**: 点击相机悬浮按钮 (FAB)
- **权限**: 首次需要授予相机权限
- **支持**: QR码、条形码
- **搜索**: 工单编号、业务单号、其他编码

### 3️⃣ 清除搜索
- **位置**: 工具栏右上角 "X" 按钮
- **效果**: 清除过滤，显示完整列表
- **状态**: 清除后按钮隐藏

### 4️⃣ 查看详情
- **操作**: 点击列表中的工单
- **内容**: 完整信息 + 进展记录
- **返回**: 工具栏返回按钮

---

## 🔧 故障排查

### 菜单不显示
```bash
# 1. 检查设备是否在线
adb shell dumpsys package com.appmanager.agent | grep Agent

# 2. 强制同步菜单（重启应用）
adb shell am force-stop com.appmanager.agent
adb shell am start -n com.appmanager.agent/.MainActivity
```

### 列表加载失败
```bash
# 查看日志
adb logcat | grep WorkOrder

# 检查网络
adb shell ping -c 3 <服务器IP>

# 查看应用配置
adb shell "run-as com.appmanager.agent cat /data/data/com.appmanager.agent/shared_prefs/agent_config.xml"
```

### 扫码无反应
```bash
# 检查相机权限
adb shell dumpsys package com.appmanager.agent | grep CAMERA

# 授予相机权限
adb shell pm grant com.appmanager.agent android.permission.CAMERA
```

---

## 📊 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/work-orders/mine` | GET | 我的工单列表 |
| `/api/work-orders` | GET | 所有工单列表 |
| `/api/work-orders/:id` | GET | 工单详情 |
| `/api/work-orders/:id/progress` | GET | 工单进展 |

**认证**: `X-Device-Token` Header

**查询参数**:
- `limit=50` - 每页数量
- `search_key=xxx` - 搜索关键词

---

## 🎯 测试清单

- [ ] 菜单能正常打开两个页面
- [ ] 下拉刷新能重新加载数据
- [ ] 扫码能识别并搜索
- [ ] 搜索状态显示在工具栏
- [ ] 清除搜索能恢复完整列表
- [ ] "我的工单"只显示本设备数据
- [ ] 点击工单能打开详情页
- [ ] 详情页显示完整信息

---

## 📂 文件位置

### 代码
```
agent/app/src/main/java/com/appmanager/agent/ui/
├── MyWorkOrderListActivity.kt      # 我的工单
├── WorkOrderListActivity.kt        # 工单处理
└── WorkOrderDetailActivity.kt      # 工单详情
```

### 布局
```
agent/app/src/main/res/layout/
├── activity_my_work_order_list.xml
├── activity_work_order_list.xml
└── activity_work_order_detail.xml
```

### 文档
```
docs/
├── android-work-order-fixes-2026-06-23.md       # 实现文档
├── android-work-order-deployment-guide.md       # 部署指南
├── android-work-order-summary.md                # 项目总结
└── android-work-order-implementation-report.md  # 实施报告
```

### 工具
```
scripts/test-work-order.sh   # 测试脚本
```

---

## 🔍 调试命令

```bash
# 启动应用
adb shell am start -n com.appmanager.agent/.MainActivity

# 查看实时日志
adb logcat | grep -E "WorkOrder|MyWorkOrderList|WorkOrderList"

# 清除应用数据
adb shell pm clear com.appmanager.agent

# 查看应用信息
adb shell dumpsys package com.appmanager.agent

# 收集诊断信息
./scripts/test-work-order.sh diag
```

---

## 💡 快捷提示

### 开发环境设置
```bash
# 设置 Android SDK
export ANDROID_HOME=/path/to/android-sdk

# 添加工具到 PATH
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 常用操作
```bash
# 快速重新安装
make agent && make install-agent

# 启动并监控日志
make install-agent && adb logcat -c && adb logcat | grep WorkOrder
```

### 性能分析
```bash
# 查看内存使用
adb shell dumpsys meminfo com.appmanager.agent

# 查看 CPU 使用
adb shell top -n 1 | grep appmanager

# 查看电池统计
adb shell dumpsys batterystats | grep appmanager
```

---

## 📞 获取帮助

1. **查看文档**: `docs/android-work-order-*.md`
2. **运行测试脚本**: `./scripts/test-work-order.sh`
3. **收集诊断信息**: `./scripts/test-work-order.sh diag`
4. **查看 Git 历史**: `git log --grep="工单"`

---

## 📋 版本信息

- **实施日期**: 2026-06-23
- **APK 版本**: Debug
- **Git 提交**: 095bb28, 3c11314
- **文档版本**: 1.0

---

**打印提示**: 建议打印此卡片作为快速参考
