# 修复：菜单同步 + 工作流接口配置

## 问题 1：Agent 长时间断线重连后菜单不更新

### 现象
服务器长时间断开后重新连接，Agent 端下发的菜单未能重新拉取，导致菜单内容过期。

### 根本原因
Agent 重连时会通过 HTTP 拉取 `/api/agent/menu-manifest?since=<revision>`，如果本地存储的 `revision` 与服务器当前的 `AgentMenuRevision` 匹配，服务器会返回 `unchanged: true`，Agent 不会更新菜单。

在以下场景下会出现问题：
1. **长时间离线**：Agent 离线超过 30 分钟后，本地缓存可能已经过期
2. **服务器重启**：服务器重启或数据库恢复后，菜单数据可能已变化，但 `AgentMenuRevision` 未相应递增
3. **应用数据清理**：Agent 本地缓存被清理，但 `revision` 仍然保留在 SharedPreferences 中

### 解决方案
在 `AgentMenuStore.kt` 中添加 `last_sync_time` 字段记录最后同步时间，在 `AgentMenuSync.kt` 中：
- 如果距离上次同步超过 30 分钟，强制使用 `since=0` 拉取完整菜单（忽略本地 revision）
- 记录强制同步日志，方便排查问题

**修改文件**：
- `agent/app/src/main/java/com/appmanager/agent/AgentMenuStore.kt`
  - 添加 `KEY_LAST_SYNC` 常量
  - `save()` 方法保存 `System.currentTimeMillis()`
  - 新增 `timeSinceLastSync()` 方法计算距离上次同步的时间

- `agent/app/src/main/java/com/appmanager/agent/AgentMenuSync.kt`
  - `fetchManifestBlocking()` 中添加强制全量同步逻辑
  - 超过 30 分钟则使用 `since=0`，并记录日志

---

## 问题 2：工作流第三方应用接口配置缺少 endpoint_id 和业务编码映射

### 现象
工作流可视化编辑器中选择"第三方应用接口"动作时：
1. **执行失败**：`config` JSON 缺少 `endpoint_id` 字段，导致执行时报错"动作 1 (call_endpoint) 失败: 缺少 endpoint_id"
2. **参数映射不全**：下拉菜单中缺少 `{{business_no}}`（业务编码）选项，无法快速插入工单业务编码

### 根本原因
1. **错误的回调函数**：`call_endpoint` 类型的参数输入框 `@input` 事件调用了 `updateBuilderJSON(idx)`，该函数是为 `call_data_interface` 类型设计的（生成 `interface_id` 而非 `endpoint_id`）
2. **缺少字段映射**：模板变量下拉菜单中未包含 `business_no` 字段

### 解决方案
**修改文件**：`web/src/views/work-orders/WorkOrderWorkflows.vue`

1. **修复回调函数**（第 166、216 行）：
   - 将 `@input="updateBuilderJSON(idx)"` 改为 `@input="updateEndpointBuilderJSON(idx)"`
   - `updateEndpointBuilderJSON()` 函数会正确生成包含 `endpoint_id` 的配置

2. **添加业务编码映射**（第 183 行之后）：
   ```vue
   <el-dropdown-item command="{{business_no}}">{{business_no}} - 业务编码</el-dropdown-item>
   ```

### 验证
- **服务器端测试**：`make check` 通过，所有 Go 测试运行正常
- **前端功能**：
  1. 打开工作流编辑器，选择"调用第三方接口"动作类型
  2. 选择一个接口后，参数映射输入框右侧下拉菜单应显示"业务编码"选项
  3. 保存后，生成的 JSON 配置应包含 `endpoint_id` 字段
  4. 工作流执行时不再报"缺少 endpoint_id"错误

---

## 部署说明

### Android Agent
需要重新编译安装 Agent：
```bash
make agent          # 编译 debug APK
make install-agent  # 通过 ADB 安装到设备
```

### Web 前端
重新构建前端：
```bash
cd web && npm run build
```

### 服务器
无需修改，但建议重启服务以确保内存状态一致。

---

## 测试场景

### 菜单同步测试
1. **短时间断线**：断开网络 < 5 分钟，重连后使用增量同步（since=<revision>）
2. **长时间断线**：断开网络 > 30 分钟，重连后强制全量同步（since=0），日志中应显示 "Force full menu sync"
3. **服务器重启**：重启服务器，Agent 重连后应拉取最新菜单

### 工作流接口测试
1. 创建工作流，添加"调用第三方接口"动作
2. 选择一个已配置的第三方接口
3. 在参数映射中点击下拉菜单，验证"业务编码"选项存在
4. 插入 `{{business_no}}`，保存工作流
5. 创建一个带业务编码的工单，触发工作流，验证接口调用成功
