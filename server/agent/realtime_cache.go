package agent

import (
	"app-manager/database"
	"app-manager/models"
	"log"
	"sync"
	"time"

	"gorm.io/gorm"
)

// CachedRealtimeStatus 缓存的实时状态，带脏字段标记
type CachedRealtimeStatus struct {
	Status      models.DeviceRealTimeStatus
	DirtyFields map[string]bool // 记录哪些字段变化了
	LastUpdate  time.Time
}

// RealtimeCache 实时状态内存缓存
type RealtimeCache struct {
	mu   sync.RWMutex
	data map[uint]*CachedRealtimeStatus // deviceID -> cached status
}

var realtimeCache = &RealtimeCache{
	data: make(map[uint]*CachedRealtimeStatus),
}

// UpdateRealtimeStatus 更新内存中的实时状态（只标记变化的字段）
func UpdateRealtimeStatus(deviceID uint, updates map[string]interface{}) {
	realtimeCache.mu.Lock()
	defer realtimeCache.mu.Unlock()

	cached, exists := realtimeCache.data[deviceID]
	if !exists {
		cached = &CachedRealtimeStatus{
			Status: models.DeviceRealTimeStatus{
				DeviceID: deviceID,
			},
			DirtyFields: make(map[string]bool),
			LastUpdate:  time.Now(),
		}
		realtimeCache.data[deviceID] = cached
	}

	// 对比并标记变化的字段
	if battery, ok := updates["battery"].(int); ok && cached.Status.Battery != battery {
		cached.Status.Battery = battery
		cached.DirtyFields["battery"] = true
	}
	if cpu, ok := updates["cpu_usage"].(float64); ok && cached.Status.CPUUsage != cpu {
		cached.Status.CPUUsage = cpu
		cached.DirtyFields["cpu_usage"] = true
	}
	if memUsed, ok := updates["memory_used"].(int64); ok && cached.Status.MemoryUsed != memUsed {
		cached.Status.MemoryUsed = memUsed
		cached.DirtyFields["memory_used"] = true
	}
	if stUsed, ok := updates["storage_used"].(int64); ok && cached.Status.StorageUsed != stUsed {
		cached.Status.StorageUsed = stUsed
		cached.DirtyFields["storage_used"] = true
	}
	if wifiSignal, ok := updates["wifi_signal"].(int); ok && cached.Status.WifiSignal != wifiSignal {
		cached.Status.WifiSignal = wifiSignal
		cached.DirtyFields["wifi_signal"] = true
	}
	if wifiSpeed, ok := updates["wifi_speed"].(int); ok && cached.Status.WifiSpeed != wifiSpeed {
		cached.Status.WifiSpeed = wifiSpeed
		cached.DirtyFields["wifi_speed"] = true
	}
	if fg, ok := updates["foreground_package"].(string); ok && cached.Status.ForegroundPackage != fg {
		cached.Status.ForegroundPackage = fg
		cached.DirtyFields["foreground_package"] = true
	}
	if lastSeen, ok := updates["last_seen_at"].(time.Time); ok {
		// last_seen_at 只在内存中更新，不写入数据库
		cached.Status.LastSeenAt = lastSeen
	}
	if connected, ok := updates["agent_connected"].(bool); ok && cached.Status.AgentConnected != connected {
		cached.Status.AgentConnected = connected
		cached.DirtyFields["agent_connected"] = true
	}
	if status, ok := updates["status"].(string); ok && cached.Status.Status != status {
		cached.Status.Status = status
		cached.DirtyFields["status"] = true
	}

	cached.LastUpdate = time.Now()
}

// GetRealtimeStatus 获取内存中的实时状态（用于 API 查询）
func GetRealtimeStatus(deviceID uint) (models.DeviceRealTimeStatus, bool) {
	realtimeCache.mu.RLock()
	defer realtimeCache.mu.RUnlock()

	cached, exists := realtimeCache.data[deviceID]
	if !exists {
		return models.DeviceRealTimeStatus{}, false
	}
	return cached.Status, true
}

// StartRealtimeCacheFlusher 启动后台刷新器，定期将脏数据批量写入数据库
func StartRealtimeCacheFlusher(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			flushRealtimeCache()
		}
	}()
}

func flushRealtimeCache() {
	realtimeCache.mu.Lock()
	// 复制需要刷新的数据，避免长时间持锁
	toFlush := make(map[uint]*CachedRealtimeStatus)
	for deviceID, cached := range realtimeCache.data {
		if len(cached.DirtyFields) > 0 {
			// 深拷贝脏字段标记
			dirtyFieldsCopy := make(map[string]bool, len(cached.DirtyFields))
			for k, v := range cached.DirtyFields {
				dirtyFieldsCopy[k] = v
			}
			toFlush[deviceID] = &CachedRealtimeStatus{
				Status:      cached.Status,
				DirtyFields: dirtyFieldsCopy,
				LastUpdate:  cached.LastUpdate,
			}
			// 清空脏标记（已提交刷新队列）
			cached.DirtyFields = make(map[string]bool)
		}
	}
	realtimeCache.mu.Unlock()

	if len(toFlush) == 0 {
		return
	}

	// 批量更新数据库（使用事务减少网络往返）
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		for deviceID, cached := range toFlush {
			// 构建只包含脏字段的 updates map
			updates := make(map[string]interface{})
			if cached.DirtyFields["battery"] {
				updates["battery"] = cached.Status.Battery
			}
			if cached.DirtyFields["cpu_usage"] {
				updates["cpu_usage"] = cached.Status.CPUUsage
			}
			if cached.DirtyFields["memory_used"] {
				updates["memory_used"] = cached.Status.MemoryUsed
			}
			if cached.DirtyFields["storage_used"] {
				updates["storage_used"] = cached.Status.StorageUsed
			}
			if cached.DirtyFields["wifi_signal"] {
				updates["wifi_signal"] = cached.Status.WifiSignal
			}
			if cached.DirtyFields["wifi_speed"] {
				updates["wifi_speed"] = cached.Status.WifiSpeed
			}
			if cached.DirtyFields["foreground_package"] {
				updates["foreground_package"] = cached.Status.ForegroundPackage
			}
			if cached.DirtyFields["agent_connected"] {
				updates["agent_connected"] = cached.Status.AgentConnected
			}
			if cached.DirtyFields["status"] {
				updates["status"] = cached.Status.Status
			}

			// 跳过 updated_at 更新，减少不必要的数据库写入
			if len(updates) == 0 {
				continue // 没有脏字段，跳过此设备
			}

			// 先尝试 UPDATE，如果行不存在则 INSERT
			result := tx.Model(&models.DeviceRealTimeStatus{}).
				Where("device_id = ?", deviceID).
				Updates(updates)

			if result.Error != nil {
				log.Printf("flushRealtimeCache update failed [device_id=%d]: %v", deviceID, result.Error)
				return result.Error
			}

			if result.RowsAffected == 0 {
				// 行不存在，执行插入
				newStatus := cached.Status
				newStatus.UpdatedAt = now
				if err := tx.Create(&newStatus).Error; err != nil {
					log.Printf("flushRealtimeCache insert failed [device_id=%d]: %v", deviceID, err)
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		log.Printf("flushRealtimeCache transaction failed: %v", err)
	}
}

// RemoveRealtimeCache 移除设备的实时状态缓存（设备删除时调用）
func RemoveRealtimeCache(deviceID uint) {
	realtimeCache.mu.Lock()
	defer realtimeCache.mu.Unlock()
	delete(realtimeCache.data, deviceID)
}
