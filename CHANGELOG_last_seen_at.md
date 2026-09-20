# last_seen_at 优化变更记录

## 变更概述
将 `last_seen_at` 字段从数据库持久化改为仅内存存储，消除高频心跳导致的慢 SQL 问题。

## 变更时间
2026-09-16

## 问题描述
Agent 心跳每 30 秒更新一次 `last_seen_at` 字段到 `devices` 表，在大量设备同时在线时导致：
- 每次更新耗时 200ms - 1200ms（SLOW SQL >= 200ms）
- 数据库写入压力过大
- 事务冲突和锁等待

## 解决方案

### 1. 内存缓存层（agent/realtime_cache.go）
- `last_seen_at` 只在内存中更新，不标记为脏字段
- 新增 `GetLastSeenAt()` 专用查询函数
- 定期批量刷新其他脏字段到数据库（排除 last_seen_at）

### 2. 心跳处理优化（agent/sync.go）
- `SyncDeviceStatus()`: 连接/断开时不再写 last_seen_at 到数据库
- `HandleHeartbeat()`: 仅更新内存中的 last_seen_at
- `ensureAgentDevice()`: 创建设备后立即在内存中设置 last_seen_at
- `reapStaleDevices()`: 改为检查内存中的 last_seen_at 判定离线

### 3. API 层适配（api/device.go）
- `ListDevices()`: 扫描设备时只更新内存 last_seen_at
- `ConnectDevice()`: 无线 ADB 连接成功时更新内存 last_seen_at
- `GetDeviceInfo()`: ADB 信息查询时更新内存 last_seen_at
- `CreateDevice()`: 新建设备时在内存中设置 last_seen_at

### 4. 查询优化（api/system_monitor.go）
- `GetAgentConnections()`: 优先从内存缓存读取 last_seen_at
- 保持向后兼容，内存无数据时回退到 DB 字段

## 影响范围

### 数据库表结构
- `devices.last_seen_at` 字段保留（用于服务器重启后恢复）
- 不再高频更新，仅在特定场景写入（如手动创建设备）

### 内存使用
- 每个在线设备增加约 200 字节内存（CachedRealtimeStatus 结构）
- 1000 台设备约增加 200KB 内存

### 离线判定
- 依然准确：优先检查 Hub 活跃连接，其次检查内存 last_seen_at
- 服务器重启后 3 分钟内完成内存重建（通过心跳）

## 性能提升
- 消除 200ms-1200ms 的慢 SQL
- 数据库写压力降低约 40%（心跳字段从 10+ 减少到 6-8 个脏字段）
- 支持更大规模设备并发

## 向后兼容性
- API 响应格式不变
- 数据库字段保留，只读不写
- 监控页面无需改动

## 测试验证
- [x] 心跳更新测试
- [x] 设备创建测试
- [x] 离线判定测试
- [x] API 查询测试
- [x] 服务器重启恢复测试

## 相关文件
- server/agent/realtime_cache.go
- server/agent/sync.go
- server/agent/hub.go
- server/api/device.go
- server/api/system_monitor.go
- server/main.go
