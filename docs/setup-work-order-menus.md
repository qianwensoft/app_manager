# 配置工单处理菜单

## 概述

Android App 端的"工单处理"和"我的工单"菜单已自动创建，但需要**手动分配给设备**才会在 App 中显示。

## 已完成

### 1. Android 端配置
- ✅ `WorkOrderListActivity` 添加 intent-filter: `com.appmanager.agent.WORK_ORDER_LIST`
- ✅ `MyWorkOrderListActivity` 添加 intent-filter: `com.appmanager.agent.MY_WORK_ORDER_LIST`
- ✅ AndroidManifest.xml 更新完成

### 2. 后端配置
- ✅ `seed_agent_menus.go` 添加工单菜单种子数据
- ✅ 服务器启动时自动创建菜单项：
  - **工单处理** (id=9, intent_action=`com.appmanager.agent.WORK_ORDER_LIST`)
  - **我的工单** (id=10, intent_action=`com.appmanager.agent.MY_WORK_ORDER_LIST`)

### 3. 编译状态
- ✅ Go 后端编译成功
- ✅ Android APK 编译成功

## 配置步骤

### 方法一：通过 Web 管理后台配置（推荐）

1. **登录管理后台**
   ```
   http://localhost:3001
   ```

2. **进入 Agent 菜单管理**
   - 导航：设置 → Agent 菜单管理
   - 或直接访问：`http://localhost:3001/agent-menus`

3. **分配菜单到设备**
   
   **工单处理菜单（仅管理员）**：
   - 找到菜单项"工单处理" (id=9)
   - 点击"分配设备"
   - 勾选 admin 用户使用的设备
   - 保存
   
   **我的工单菜单（所有用户）**：
   - 找到菜单项"我的工单" (id=10)
   - 点击"分配设备"
   - 勾选所有需要使用工单功能的设备
   - 保存

4. **设备同步菜单**
   - App 会自动从服务器同步菜单配置
   - 或在 App 中手动触发菜单同步（如果有）

### 方法二：通过 API 分配（批量操作）

**API 端点**：`POST /api/agent-menus/:menu_id/assignments`

**工单处理菜单分配示例**：
```bash
# 获取 admin 用户的设备列表
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/devices?user_id=1

# 分配工单处理菜单 (id=9) 给设备
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_ids": [1, 2, 3]}' \
  http://localhost:8080/api/agent-menus/9/assignments
```

**我的工单菜单分配示例**：
```bash
# 分配我的工单菜单 (id=10) 给所有设备
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_ids": [1, 2, 3, 4, 5]}' \
  http://localhost:8080/api/agent-menus/10/assignments
```

### 方法三：直接数据库操作（开发环境）

**SQLite 示例**：
```bash
# 查看设备列表
sqlite3 server/data/app-manager.db "SELECT id, alias, name FROM devices;"

# 分配工单处理菜单 (id=9) 给设备 1
sqlite3 server/data/app-manager.db "INSERT INTO agent_menu_assignments (menu_id, device_id, created_at) VALUES (9, 1, datetime('now'));"

# 分配我的工单菜单 (id=10) 给设备 1
sqlite3 server/data/app-manager.db "INSERT INTO agent_menu_assignments (menu_id, device_id, created_at) VALUES (10, 1, datetime('now'));"

# 批量分配给多个设备（设备 1-5）
for i in 1 2 3 4 5; do
  sqlite3 server/data/app-manager.db "INSERT OR IGNORE INTO agent_menu_assignments (menu_id, device_id, created_at) VALUES (9, $i, datetime('now'));"
  sqlite3 server/data/app-manager.db "INSERT OR IGNORE INTO agent_menu_assignments (menu_id, device_id, created_at) VALUES (10, $i, datetime('now'));"
done
```

**MySQL 示例**：
```sql
-- 查看设备列表
SELECT id, alias, name FROM devices;

-- 分配工单处理菜单 (id=9) 给设备 1
INSERT INTO agent_menu_assignments (menu_id, device_id, created_at) 
VALUES (9, 1, NOW());

-- 分配我的工单菜单 (id=10) 给设备 1
INSERT INTO agent_menu_assignments (menu_id, device_id, created_at) 
VALUES (10, 1, NOW());

-- 批量分配给多个设备
INSERT INTO agent_menu_assignments (menu_id, device_id, created_at)
SELECT 9, id, NOW() FROM devices;

INSERT INTO agent_menu_assignments (menu_id, device_id, created_at)
SELECT 10, id, NOW() FROM devices;
```

## 验证

### 1. 检查菜单数据
```bash
# SQLite
sqlite3 server/data/app-manager.db "SELECT * FROM agent_menu_items WHERE intent_action LIKE '%WORK_ORDER%';"

# MySQL
mysql -h HOST -u USER -p DATABASE -e "SELECT * FROM agent_menu_items WHERE intent_action LIKE '%WORK_ORDER%';"
```

### 2. 检查分配情况
```bash
# SQLite
sqlite3 server/data/app-manager.db "SELECT a.menu_id, m.title, a.device_id, d.alias FROM agent_menu_assignments a JOIN agent_menu_items m ON a.menu_id = m.id JOIN devices d ON a.device_id = d.id WHERE m.intent_action LIKE '%WORK_ORDER%';"

# MySQL
mysql -h HOST -u USER -p DATABASE -e "SELECT a.menu_id, m.title, a.device_id, d.alias FROM agent_menu_assignments a JOIN agent_menu_items m ON a.menu_id = m.id JOIN devices d ON a.device_id = d.id WHERE m.intent_action LIKE '%WORK_ORDER%';"
```

### 3. App 端验证

#### 方式一：AgentMenuSync API
```
GET /api/agent/menu-manifest?revision=0
Headers:
  X-Device-Token: YOUR_DEVICE_TOKEN
```

返回的 JSON 中应包含：
```json
{
  "revision": 123456789,
  "menus": [
    {
      "title": "工单处理",
      "intent_action": "com.appmanager.agent.WORK_ORDER_LIST",
      "target_type": "agent_native",
      ...
    },
    {
      "title": "我的工单",
      "intent_action": "com.appmanager.agent.MY_WORK_ORDER_LIST",
      "target_type": "agent_native",
      ...
    }
  ]
}
```

#### 方式二：App 内查看
1. 打开 Android App
2. 进入"后台菜单"
3. 查看菜单列表，应显示：
   - **工单处理**（如果当前设备已分配）
   - **我的工单**（如果当前设备已分配）
4. 点击菜单项，应能正常打开对应页面

## 菜单同步机制

### 自动同步
- App 启动时同步
- AgentService 定期同步（间隔由服务器配置）
- revision 机制：仅当服务器 revision 变化时才下载完整菜单

### 手动同步
App 可以通过以下方式触发同步：
```kotlin
AgentMenuSync.syncIfNeeded(context, force = true)
```

## 权限控制说明

### 当前实现
- 菜单通过 `AgentMenuAssignment` 表分配给设备
- 一个菜单可以分配给多个设备
- 一个设备可以拥有多个菜单
- **没有基于用户角色的自动过滤**

### 权限建议
1. **工单处理菜单**：仅分配给 admin 用户使用的设备
2. **我的工单菜单**：分配给所有需要查看自己工单的用户设备

### 未来优化方向
如需基于用户角色自动控制菜单可见性，可以：
1. 在 `AgentMenuItem` 模型添加 `required_role` 字段
2. 在 `/api/agent/menu-manifest` 接口根据设备登录用户的角色过滤菜单
3. 或使用 `UserID` 字段实现用户级菜单（当前支持但未使用）

## 菜单数据结构

### agent_menu_items 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| title | VARCHAR(200) | 菜单标题 |
| intent_action | VARCHAR(200) | Intent Action（App 接收） |
| target_type | VARCHAR(32) | 类型（agent_native 表示原生 Activity） |
| target_ref | VARCHAR(200) | 引用（work_order_list / my_work_order_list） |
| show_on_agent_home | BOOLEAN | 是否显示在首页 |
| sort_order | INT | 排序顺序 |
| open_mode | VARCHAR(16) | 打开模式（push / replace） |

### agent_menu_assignments 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| menu_id | INT | 菜单ID |
| device_id | INT | 设备ID |
| created_at | TIMESTAMP | 分配时间 |

## 故障排查

### 问题1：App 中看不到工单菜单

**检查步骤**：
1. 确认菜单已创建：
   ```bash
   sqlite3 server/data/app-manager.db "SELECT id, title FROM agent_menu_items WHERE intent_action LIKE '%WORK_ORDER%';"
   ```
2. 确认菜单已分配给设备：
   ```bash
   sqlite3 server/data/app-manager.db "SELECT * FROM agent_menu_assignments WHERE menu_id IN (9, 10) AND device_id = YOUR_DEVICE_ID;"
   ```
3. 确认 App 已同步最新菜单（查看 App 日志或重启 App）

### 问题2：点击菜单无响应

**检查步骤**：
1. 确认 AndroidManifest.xml 中已注册 intent-filter
2. 确认 APK 是最新版本：
   ```bash
   cd agent && ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
3. 查看 logcat 日志：
   ```bash
   adb logcat -s AgentMenuSync:* WorkOrderListActivity:* MyWorkOrderListActivity:*
   ```

### 问题3：菜单分配后不生效

**解决方案**：
1. 强制 App 重新同步菜单（重启 App）
2. 或在服务器端触发 revision 更新（修改任意菜单项）

## 相关文档
- `docs/android-work-order-module.md` - Android 工单模块功能文档
- `docs/work-order-complete-summary.md` - 工单系统完整实现总结
- `server/database/seed_agent_menus.go` - 菜单种子数据
- `agent/app/src/main/AndroidManifest.xml` - Android 清单文件
