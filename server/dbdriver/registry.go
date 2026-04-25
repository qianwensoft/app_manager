package dbdriver

import (
	"app-manager/models"
	"database/sql"
	"log"
	"sync"

	"gorm.io/gorm"
)

// poolRegistry 缓存每个 DataSource 的长连接单例池，key 为 DataSource.ID。
// 使用 sync.Map 保证并发安全。
var poolRegistry sync.Map // map[uint]*sql.DB

// OpenOrGetPooled 返回指定数据源的单例 *sql.DB（首次调用时创建并缓存）。
// 与 OpenDataSource 的区别：不 Close，保持连接池长期可用，用于 Stats 统计。
func OpenOrGetPooled(ds *models.DataSource) (*sql.DB, error) {
	if ds == nil {
		return nil, nil
	}
	if v, ok := poolRegistry.Load(ds.ID); ok {
		return v.(*sql.DB), nil
	}
	db, err := OpenDataSource(ds)
	if err != nil {
		return nil, err
	}
	// 若并发时已有其他 goroutine 写入，保留已有的，关闭刚建的
	actual, loaded := poolRegistry.LoadOrStore(ds.ID, db)
	if loaded {
		db.Close()
		return actual.(*sql.DB), nil
	}
	return db, nil
}

// EvictFromPool 从注册表中移除指定数据源的连接池并关闭连接。
// 在数据源更新或删除时调用，避免使用过期配置的旧连接。
func EvictFromPool(dsID uint) {
	if v, ok := poolRegistry.LoadAndDelete(dsID); ok {
		v.(*sql.DB).Close()
	}
}

// GetPoolStats 返回指定数据源的连接池统计信息。
// 若该数据源尚未建立连接池，返回 false。
func GetPoolStats(dsID uint) (sql.DBStats, bool) {
	if v, ok := poolRegistry.Load(dsID); ok {
		return v.(*sql.DB).Stats(), true
	}
	return sql.DBStats{}, false
}

// WarmupPools 在启动时异步预热所有已配置的外部数据源连接池。
// 每个数据源在独立 goroutine 中并发建连，互不阻塞。
func WarmupPools(db *gorm.DB) {
	go func() {
		var sources []models.DataSource
		if err := db.Find(&sources).Error; err != nil {
			log.Printf("[dbdriver] warmup: failed to list data sources: %v", err)
			return
		}
		var wg sync.WaitGroup
		for _, s := range sources {
			s := s
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, err := OpenOrGetPooled(&s); err != nil {
					log.Printf("[dbdriver] warmup: data source %d (%s) failed: %v", s.ID, s.Name, err)
				} else {
					log.Printf("[dbdriver] warmup: data source %d (%s) ready", s.ID, s.Name)
				}
			}()
		}
		wg.Wait()
		log.Printf("[dbdriver] warmup: all data sources initialized")
	}()
}
