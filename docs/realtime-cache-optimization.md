# 实时状态缓存优化

**日期**: 2026-06-30  
**问题**: Agent 心跳高并发导致 `device_realtime_status` 表更新慢（400ms+），数据库写入压力大

## 优化方案

### 架构变更

**优化前**：
```
Agent 心跳 → HandleHeartbeat → 同步写入 device_realtime_status 表（UPSERT）
```

**优化后**：
```
Agent 心跳 → HandleHeartbeat → 写入内存缓存（带脏字段标记）
                                    ↓
                              后台定时刷新器（3秒）
                                    ↓
                         批量写入数据库（只更新变化的字段）
```

### 核心特性

1. **内存缓存** (`agent/realtime_cache.go`)
   - 用 `map[uint]*CachedRealtimeStatus` 存储每个设备的最新状态
   - `sync.RWMutex` 保护并发读写

2. **脏字段标记**
   - 对比新旧值，只标记真正变化的字段
   - 避免无效更新（例如 battery 从 50 → 50 不会触发数据库写入）

3. **批量刷新**
   - 后台 goroutine 每 3 秒扫描所有脏数据
   - 构建 `map[string]interface{}` 仅包含变化字段
   - 先 UPDATE，失败则 INSERT（处理首次心跳场景）

4. **API 查询优化**
   - `GetDeviceInfo` 优先从内存读取实时数据
   - 回退到数据库字段（兼容缓存未命中场景）

### 性能收益

- **心跳处理延迟**: 同步 DB 写入（400ms+） → 内存写入（<1ms）
- **数据库负载**: 每次心跳一次写入 → 每 3 秒批量写入变化字段
- **并发能力**: 消除了心跳间的数据库锁竞争

### 配置

刷新间隔在 `main.go` 中配置：

```go
agent.StartRealtimeCacheFlusher(3 * time.Second)
```

**调优建议**：
- 设备数 < 50：3 秒合适
- 设备数 50-200：可调整为 5 秒
- 设备数 > 200：考虑 10 秒 + 增加数据库连接池

### 数据一致性

**写入延迟**：内存数据最多延迟 3 秒写入数据库  
**服务重启**：内存数据丢失，下次心跳会重建（可接受，心跳间隔通常 < 30 秒）  
**并发冲突**：通过脏字段标记 + 批量刷新避免重复更新

### 文件清单

- `server/agent/realtime_cache.go` - 内存缓存实现
- `server/agent/sync.go:374-377` - HandleHeartbeat 改用内存缓存
- `server/api/device.go:234-273` - GetDeviceInfo 优先读内存
- `server/main.go:78` - 启动刷新器

### 监控建议

关注以下指标：
- 内存缓存大小（设备数 × 200 字节）
- 刷新器延迟（正常 < 50ms）
- 数据库慢查询频率（应显著下降）

### 回滚方案

若出现问题，注释掉 `main.go:78` 并恢复 `sync.go:374-414` 原逻辑即可回退到同步写入模式。
