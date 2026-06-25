# 工单菜单配置完成

## 已完成操作

### 1. 服务器更新
- ✅ 上传并部署新版本服务器到 `192.168.102.40:88`
- ✅ 服务已重启，运行正常

### 2. 菜单创建
自动创建了两个工单菜单：
- **工单处理** (id=9)
  - Intent: `com.appmanager.agent.WORK_ORDER_LIST`
  - Target: `agent_native / work_order_list`
  - 排序: 100
  
- **我的工单** (id=10)
  - Intent: `com.appmanager.agent.MY_WORK_ORDER_LIST`
  - Target: `agent_native / my_work_order_list`
  - 排序: 101

### 3. 菜单分配
已将两个工单菜单分配给所有设备（38个设备）：
```
设备ID: 7,9,10,22,26,28,29,30,31,33,38,40,42,43,44,45,46,47,48,49,50,51,52,53,54,56,59,60,61,62,63,64,65,67,68,69,70,71
```

## App 端同步菜单

### 方式一：App 自动同步
App 会在以下时机自动同步菜单：
1. App 启动时
2. AgentService 定期同步（如果配置了心跳）
3. 用户进入"后台菜单"页面时

**建议操作**：
1. 在 Android App 中完全退出应用
2. 重新打开应用
3. 进入"后台菜单"
4. 应该能看到"工单处理"和"我的工单"两个菜单项

### 方式二：手动触发同步
如果 App 有"菜单同步"功能，可以手动触发。

## 验证步骤

### 1. 检查菜单是否存在
```bash
TOKEN="YOUR_ADMIN_TOKEN"
curl -H "Authorization: Bearer $TOKEN" \
  http://192.168.102.40:88/api/agent-menus | grep -A 5 "工单"
```

### 2. 检查菜单分配情况
```bash
# 查看某个菜单的分配情况
curl -H "Authorization: Bearer $TOKEN" \
  "http://192.168.102.40:88/api/agent-menus/9" | python3 -m json.tool
```

### 3. App 端验证
使用设备的 device token 查询菜单清单：
```bash
# 需要从 App 中获取 device_token
curl -H "X-Device-Token: YOUR_DEVICE_TOKEN" \
  "http://192.168.102.40:88/api/agent/menu-manifest?revision=0"
```

返回的 JSON 中应包含工单菜单：
```json
{
  "revision": 1719048997,
  "menus": [
    {
      "title": "工单处理",
      "intent_action": "com.appmanager.agent.WORK_ORDER_LIST",
      "target_type": "agent_native",
      "target_ref": "work_order_list",
      ...
    },
    {
      "title": "我的工单",
      "intent_action": "com.appmanager.agent.MY_WORK_ORDER_LIST",
      "target_type": "agent_native",
      "target_ref": "my_work_order_list",
      ...
    }
  ]
}
```

## 如果 App 中仍然显示"暂无下发菜单"

### 可能原因1：App 未更新到最新版本
**解决方案**：
1. 卸载旧版本 App
2. 安装最新编译的 APK：
   ```bash
   scp /Volumes/data/workspace/qianwen/app-manager/agent/app/build/outputs/apk/debug/app-debug.apk root@192.168.102.40:/opt/app-manager/agent-app.apk
   ```
3. 在设备上安装新 APK

### 可能原因2：设备 token 无效或未登录
**解决方案**：
1. 检查 App 是否已登录账号
2. 检查设备是否已注册到服务器
3. 在 App 设置中查看 device token 是否存在

### 可能原因3：菜单同步失败
**解决方案**：
1. 查看 App logcat 日志：
   ```bash
   adb logcat -s AgentMenuSync:* AgentMenuStore:*
   ```
2. 检查网络连接是否正常
3. 检查服务器 URL 配置是否正确

### 可能原因4：show_on_agent_home 字段问题
**当前问题**：种子数据设置 `show_on_agent_home: false`，但数据库中显示为 `true`

**临时解决方案**：通过 Web 后台手动修改菜单设置
1. 访问 `http://192.168.102.40:88/agent-menus`
2. 找到"工单处理"和"我的工单"菜单
3. 编辑菜单，设置"显示在首页"为否

**代码修复**（如需修改）：
检查 `server/database/seed_agent_menus.go` 中的 `ShowOnAgentHome` 字段默认值。

## 手动添加菜单（备选方案）

如果自动创建的菜单有问题，可以通过 Web 后台手动创建：

1. 访问 `http://192.168.102.40:88/agent-menus`
2. 点击"新建菜单"
3. 填写信息：

**工单处理菜单**：
- 标题：工单处理
- 目标类型：agent_native
- 目标引用：work_order_list
- Intent Action：`com.appmanager.agent.WORK_ORDER_LIST`
- 打开模式：push
- 显示在首页：否
- 排序：100

**我的工单菜单**：
- 标题：我的工单
- 目标类型：agent_native
- 目标引用：my_work_order_list
- Intent Action：`com.appmanager.agent.MY_WORK_ORDER_LIST`
- 打开模式：push
- 显示在首页：否
- 排序：101

4. 创建后，点击"分配设备"，选择需要的设备

## 日志调试

### 服务器端日志
```bash
ssh root@192.168.102.40 "journalctl -u app-manager -f"
```

### App 端日志
```bash
# 如果设备通过 ADB 连接
adb logcat | grep -E "WorkOrder|AgentMenu"

# 或只看特定 tag
adb logcat -s AgentMenuSync:* WorkOrderListActivity:* MyWorkOrderListActivity:*
```

## 下一步

1. **测试菜单功能**
   - 在 App 中点击"工单处理"菜单，应该打开 WorkOrderListActivity
   - 点击"我的工单"菜单，应该打开 MyWorkOrderListActivity

2. **测试工单列表**
   - 确认能否加载工单列表
   - 确认耗时计算是否正确
   - 确认标签显示是否正常

3. **测试工单详情**
   - 点击工单进入详情页
   - 确认工单进展是否正常显示

## 相关文档
- `docs/setup-work-order-menus.md` - 菜单配置详细说明
- `docs/android-work-order-module.md` - Android 工单模块文档
- `docs/work-order-complete-summary.md` - 工单系统完整实现总结

## 联系方式
如有问题，请检查：
1. 服务器日志：`journalctl -u app-manager -f`
2. App 日志：`adb logcat`
3. 网络连接：确认 App 能访问 `http://192.168.102.40:88`
