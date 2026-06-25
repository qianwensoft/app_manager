package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateConnectorInterfaceCodeIndex 修复连接器 interface_code 索引。
//
// 历史版本用 `uniqueIndex:idx_interface_code,where:interface_mode=true`（部分唯一索引）。
// 该写法仅 PostgreSQL/SQLite 支持；MySQL 会忽略 where 退化为普通唯一索引，
// 导致多条 interface_mode=false（interface_code 为空串）的连接器保存时
// 触发 `Duplicate entry ” for key 'idx_interface_code'`。
//
// 修复：把旧的「唯一」索引 idx_interface_code 降级为普通索引。
// interface_mode=true 时的 interface_code 唯一性改由应用层（saveConnector 校验）保证。
func MigrateConnectorInterfaceCodeIndex(db *gorm.DB) {
	const table = "outbound_connectors"
	const idx = "idx_interface_code"

	switch strings.ToLower(strings.TrimSpace(db.Dialector.Name())) {
	case "mysql":
		// 查询该索引是否为唯一索引（NON_UNIQUE=0 表示唯一）。
		var rows []struct {
			NonUnique int64  `gorm:"column:Non_unique"`
			KeyName   string `gorm:"column:Key_name"`
		}
		if err := db.Raw("SHOW INDEX FROM "+table+" WHERE Key_name = ?", idx).Scan(&rows).Error; err != nil {
			// 表或索引不存在（全新库）时静默：AutoMigrate 会按新 tag 建普通索引。
			return
		}
		isUnique := false
		for _, r := range rows {
			if r.NonUnique == 0 {
				isUnique = true
			}
		}
		if !isUnique {
			return // 已是普通索引或不存在，无需处理
		}
		if err := db.Exec("ALTER TABLE " + table + " DROP INDEX " + idx).Error; err != nil {
			log.Printf("migrate connector interface_code index (mysql) drop unique: %v", err)
			return
		}
		// 重建为普通索引（AutoMigrate 也会保证，但这里立即补上避免查询退化）。
		if err := db.Exec("CREATE INDEX " + idx + " ON " + table + " (interface_code)").Error; err != nil {
			log.Printf("migrate connector interface_code index (mysql) recreate: %v", err)
			return
		}
		log.Println("migrate connector interface_code index: mysql unique index downgraded to normal")
	case "sqlite":
		// SQLite 旧库可能存在带 where 的部分唯一索引；DROP 后由 AutoMigrate 重建普通索引。
		if err := db.Exec("DROP INDEX IF EXISTS " + idx).Error; err != nil {
			log.Printf("migrate connector interface_code index (sqlite) drop: %v", err)
			return
		}
		log.Println("migrate connector interface_code index: sqlite partial unique index dropped")
	default:
		log.Printf("migrate connector interface_code index: skip unknown dialect %q", db.Dialector.Name())
	}
}
