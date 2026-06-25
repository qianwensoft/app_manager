# Android App端工单处理模块

## 改动时间
2026-06-22

## 功能概述

为Android App端新增工单处理模块，支持admin角色查看和处理工单。

## 功能特性

### 1. 权限控制
- **角色要求**：admin角色可见工单菜单
- **认证方式**：使用 device-token 认证（`X-Device-Token` header）
- **菜单显示**：后台配置菜单时设置角色权限，App端根据用户角色显示/隐藏菜单

### 2. 工单处理列表（WorkOrderListActivity）
- **路径**：`agent/app/src/main/java/com/appmanager/agent/ui/WorkOrderListActivity.kt`
- **功能**：
  - 查看所有工单（admin权限）
  - 下拉刷新
  - 扫码快速查询（使用 `search_key` 参数）
  - 显示工单号、标题、状态、耗时、标签
  - 点击进入工单详情
- **API**：`GET /api/work-orders?limit=50&search_key=xxx`

### 3. 我的工单列表（MyWorkOrderListActivity）
- **路径**：`agent/app/src/main/java/com/appmanager/agent/ui/MyWorkOrderListActivity.kt`
- **功能**：
  - 查看当前登录账号相关的工单（与设备无关）
  - 下拉刷新
  - 扫码快速查询
  - 显示工单号、标题、状态、优先级、耗时、标签
  - 点击进入工单详情
- **API**：`GET /api/work-orders/mine?limit=50&search_key=xxx`
- **注意**：针对当前登录账号，不限制设备，多设备同步接收处理消息

### 4. 工单详情（WorkOrderDetailActivity）
- **路径**：`agent/app/src/main/java/com/appmanager/agent/ui/WorkOrderDetailActivity.kt`
- **功能**：
  - 显示工单完整信息
  - 显示工单耗时（提交至现在或至完成/关闭的时长）
  - 显示标签列表
  - 显示工单进展记录
  - 支持新增进展（待实现）
  - 图片通过网络加载（不缓存到本地）
- **API**：
  - `GET /api/work-orders/:id` - 获取工单详情
  - `GET /api/work-orders/:id/progress` - 获取进展列表

### 5. 工单耗时计算
- **未完成工单**（open/in_progress/reopened）：
  - 计算：`当前时间 - 创建时间`
  - 显示：实时更新的耗时
- **已完成工单**（closed/resolved）：
  - 计算：`关闭时间 - 创建时间`
  - 显示：固定的总耗时

### 6. 扫码快速查询
- **实现方式**：使用 `QrPhotoDecoder.pickPhotoAndDecode()` 选择图片识别二维码
- **搜索范围**：与Web端一致，使用 `search_key` 参数搜索：
  - 工单号（code）
  - 业务单号（business_no）
  - 其他编码（other_codes）
  - 标题（title）
  - 描述（description）

### 7. 标签显示
- **显示位置**：工单列表项和详情页
- **显示格式**：标签code列表，空格分隔
- **未来优化**：
  - 从后台获取标签字典，显示标签名称和颜色
  - 使用带背景色的Chip展示标签

## 文件清单

### Kotlin代码
```
agent/app/src/main/java/com/appmanager/agent/ui/
├── WorkOrderListActivity.kt          # 工单处理列表
├── MyWorkOrderListActivity.kt        # 我的工单列表
└── WorkOrderDetailActivity.kt        # 工单详情
```

### 布局文件
```
agent/app/src/main/res/layout/
├── activity_work_order_list.xml      # 工单处理列表布局
├── activity_my_work_order_list.xml   # 我的工单列表布局
├── activity_work_order_detail.xml    # 工单详情布局
├── item_work_order.xml               # 工单列表项
├── item_my_work_order.xml            # 我的工单列表项
└── item_progress.xml                 # 进展列表项
```

### AndroidManifest.xml
- 注册了3个新Activity：WorkOrderListActivity、MyWorkOrderListActivity、WorkOrderDetailActivity

## 使用流程

### 1. 后台配置菜单
在服务端配置两个agent菜单项：

#### 工单处理菜单
```json
{
  "code": "work_order_list",
  "name": "工单处理",
  "intent_action": "com.appmanager.agent.WORK_ORDER_LIST",
  "show_on_agent_home": false,
  "role": "admin"
}
```

#### 我的工单菜单
```json
{
  "code": "my_work_order_list",
  "name": "我的工单",
  "intent_action": "com.appmanager.agent.MY_WORK_ORDER_LIST",
  "show_on_agent_home": false,
  "role": null
}
```

### 2. App端接收菜单
- AgentMenuSync 同步菜单后，根据用户角色显示/隐藏菜单
- admin用户可以看到"工单处理"菜单
- 所有用户都可以看到"我的工单"菜单

### 3. 打开工单列表
- 点击菜单项触发 Intent，通过 `MenuIntentReceiver` 路由到对应Activity
- 或直接启动Activity：
```kotlin
// 工单处理
startActivity(Intent(this, WorkOrderListActivity::class.java))

// 我的工单
startActivity(Intent(this, MyWorkOrderListActivity::class.java))
```

## API调用示例

### 获取工单列表
```kotlin
val cfg = AgentConfig.get(context)
val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
val json = AgentCatalogApi.getJson(
    base, 
    "/api/work-orders?limit=50&search_key=xxx", 
    cfg.deviceToken
)
```

### 获取我的工单
```kotlin
val json = AgentCatalogApi.getJson(
    base, 
    "/api/work-orders/mine?limit=50", 
    cfg.deviceToken
)
```

### 获取工单详情
```kotlin
val json = AgentCatalogApi.getJson(
    base, 
    "/api/work-orders/$workOrderId", 
    cfg.deviceToken
)
```

### 获取工单进展
```kotlin
val json = AgentCatalogApi.getJson(
    base, 
    "/api/work-orders/$workOrderId/progress", 
    cfg.deviceToken
)
```

## 待实现功能

### 1. 新增工单进展
- 对话框输入进展内容
- 支持上传附件（图片、视频、音频、录屏、录音、日志）
- API：
  - `POST /api/work-orders/:id/progress` - 创建进展
  - `POST /api/work-orders/progress/:progress_id/attachments` - 上传附件

### 2. 工单操作
- 开始处理
- 标记解决
- 关闭工单
- 重新打开
- 转交工单
- API：`POST /api/work-orders/:id/status`

### 3. 标签颜色显示
- 获取标签字典：`GET /api/work-orders/tags`
- 使用Chip组件显示带颜色的标签

### 4. 推送通知
- 接收工单状态变更推送
- 接收新进展通知
- 使用WebSocket或STOMP订阅

## 注意事项

1. **权限控制**：确保后台菜单配置正确的角色权限
2. **认证方式**：使用device-token认证，确保token有效
3. **图片加载**：工单详情中的图片通过网络URL加载，不缓存到本地
4. **耗时计算**：根据工单状态动态计算耗时
5. **我的工单范围**：针对当前登录账号，与设备无关

## 测试建议

1. **权限测试**
   - admin用户：可见"工单处理"和"我的工单"
   - 普通用户：仅可见"我的工单"

2. **列表功能测试**
   - 下拉刷新
   - 扫码搜索（二维码/条形码）
   - 点击进入详情

3. **详情页测试**
   - 工单信息展示
   - 耗时计算准确性
   - 进展列表加载

4. **跨设备测试**
   - 同一账号在多个设备登录
   - 一个设备处理工单，其他设备同步接收通知

5. **搜索测试**
   - 扫描工单号二维码
   - 扫描业务单号二维码
   - 扫描其他编码二维码
