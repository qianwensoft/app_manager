# 审计日志界面增强

## 问题描述

原审计日志界面存在以下问题：
1. 只显示 `user_id` 数字，没有显示用户名
2. 字段名不匹配（前端用 `ip`，后端是 `ip_address`）
3. 缺少 `User-Agent` 字段显示
4. 缺少设备信息显示
5. 界面简陋，缺少可读性

## 解决方案

### 后端改进 (`server/api/app.go`)

修改 `ListAuditLogs` 函数，返回增强的数据结构：

```go
type AuditLogResponse struct {
    ID        uint      `json:"id"`
    UserID    uint      `json:"user_id"`
    Username  string    `json:"username"`        // 新增：用户名
    DeviceID  *uint     `json:"device_id"`
    DeviceName string   `json:"device_name"`     // 新增：设备名称
    Action    string    `json:"action"`
    Command   string    `json:"command"`
    IPAddress string    `json:"ip_address"`
    UserAgent string    `json:"user_agent"`      // 新增：浏览器信息
    Result    string    `json:"result"`
    CreatedAt time.Time `json:"created_at"`
}
```

**关联查询逻辑**：
- 根据 `user_id` 查询 `users` 表获取用户名
- 根据 `device_id` 查询 `devices` 表获取设备名称
- 用户不存在时显示 "用户#ID"
- 设备不存在时显示 "设备#ID"
- user_id = 0 时显示 "系统"

### 前端改进 (`web/src/views/AuditLog.vue`)

#### 界面优化

1. **添加卡片容器**
   - 使用 `el-card` 包装表格
   - 头部显示标题和记录数量

2. **用户列显示**
   ```vue
   <el-table-column label="用户" width="120">
     <template #default="{ row }">
       <div>{{ row.username }}</div>
       <el-tag size="small" type="info" v-if="row.user_id > 0">ID: {{ row.user_id }}</el-tag>
     </template>
   </el-table-column>
   ```

3. **操作列彩色标签**
   - `login` → 绿色 "登录成功"
   - `login_failed` → 红色 "登录失败"
   - `refresh_token` → 蓝色 "刷新Token"
   - `refresh_token_failed` → 橙色 "刷新失败"

4. **结果列彩色标签**
   - `success` → 绿色 "成功"
   - `user not found` → 红色 "用户不存在"
   - `invalid password` → 红色 "密码错误"
   - `unauthorized` → 橙色 "未授权"

5. **设备列显示**
   - 优先显示设备名称
   - 无名称时显示设备 ID
   - 无设备时显示 "-"

6. **User-Agent 格式化**
   ```javascript
   function formatUserAgent(ua) {
     // 智能识别浏览器类型和版本
     // Chrome/Firefox/Safari/Edge
     // 长字符串自动截断
   }
   ```

7. **时间格式化**
   ```javascript
   function formatTime(time) {
     // 转换为本地时间格式
     // 2024-01-01 12:30:45
   }
   ```

#### 列宽优化

| 列 | 宽度 | 说明 |
|---|---|---|
| ID | 70px | 数字 ID |
| 用户 | 120px | 用户名 + ID 标签 |
| 操作 | 160px | 彩色标签 |
| 命令/详情 | 150px | 溢出省略 |
| 结果 | 120px | 彩色标签 |
| 设备 | 140px | 设备名称 |
| IP 地址 | 150px | IPv4/IPv6 |
| User-Agent | 300px | 浏览器信息 |
| 时间 | 180px | 完整时间戳 |

## 效果对比

### 改进前
```
用户: 1
操作: login
资源: (空)
详情: (空)
IP: (无数据)
时间: 2024-01-01T12:30:45Z
```

### 改进后
```
用户: admin (ID: 1)
操作: [绿色标签] 登录成功
命令/详情: admin
结果: [绿色标签] 成功
设备: -
IP 地址: 192.168.1.100
User-Agent: Chrome 120.0.6099.224
时间: 2024-01-01 12:30:45
```

## 数据示例

### 登录成功
```json
{
  "id": 1,
  "user_id": 1,
  "username": "admin",
  "device_id": null,
  "device_name": "",
  "action": "login",
  "command": "admin",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
  "result": "success",
  "created_at": "2024-01-01T12:30:45Z"
}
```

### 登录失败（用户不存在）
```json
{
  "id": 2,
  "user_id": 0,
  "username": "系统",
  "device_id": null,
  "device_name": "",
  "action": "login_failed",
  "command": "wronguser",
  "ip_address": "192.168.1.200",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0",
  "result": "user not found",
  "created_at": "2024-01-01T12:35:20Z"
}
```

### Token 刷新成功
```json
{
  "id": 3,
  "user_id": 2,
  "username": "operator",
  "device_id": null,
  "device_name": "",
  "action": "refresh_token",
  "command": "operator",
  "ip_address": "10.0.0.50",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.2",
  "result": "success",
  "created_at": "2024-01-01T13:00:00Z"
}
```

### 设备操作（带设备信息）
```json
{
  "id": 4,
  "user_id": 1,
  "username": "admin",
  "device_id": 5,
  "device_name": "测试手机A",
  "action": "device_shell",
  "command": "ls -la /sdcard",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0 Chrome/120.0.0.0",
  "result": "success",
  "created_at": "2024-01-01T14:20:30Z"
}
```

## 浏览器识别

`formatUserAgent()` 函数支持识别：
- **Chrome**: `Chrome 120.0.6099.224`
- **Firefox**: `Firefox 121.0`
- **Safari**: `Safari 17.2`
- **Edge**: `Edge 120.0.2210.144`
- **其他**: 截取前 50 字符 + "..."

鼠标悬停在 User-Agent 列时会显示完整字符串（tooltip）。

## 性能考虑

### 查询优化

后端使用 `Select("username")` 和 `Select("name, serial")` 只查询必要字段：

```go
database.DB.Select("username").First(&user, log.UserID)
database.DB.Select("name, serial").First(&device, *log.DeviceID)
```

### 数据量限制

- 默认只返回最近 200 条记录
- 如需更多记录，可考虑添加分页功能

### 未来优化建议

1. **分页**: 添加前端分页，支持查询更多历史记录
2. **筛选**: 添加按用户、操作类型、日期范围筛选
3. **搜索**: 支持关键字搜索（用户名、IP、命令）
4. **导出**: 支持导出 CSV/Excel
5. **统计**: 添加统计图表（登录次数、失败率等）

## 部署

前后端都已修改，需要：
1. 重新编译后端：`make server`
2. 重新构建前端：`cd web && npm run build`
3. 或使用：`make release`

## 测试验证

1. 登录系统，访问 "审计日志" 页面
2. 查看登录记录，应显示用户名、IP、浏览器信息
3. 故意输错密码登录，查看失败记录
4. 等待 token 自动刷新（5 分钟内），查看刷新记录
5. 验证所有字段都正确显示

## 文件清单

### 修改的文件
- `server/api/app.go` - 增强 ListAuditLogs 返回数据
- `web/src/views/AuditLog.vue` - 重构界面，添加格式化和彩色标签
