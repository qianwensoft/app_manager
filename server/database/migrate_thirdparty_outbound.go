package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateThirdPartyOutbound 为 third_party_providers 表添加外部应用关联和用户同步配置字段。
func MigrateThirdPartyOutbound(db *gorm.DB) {
	dialect := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))

	// 检查 outbound_app_id 列是否已存在
	var count int64
	switch dialect {
	case "sqlite":
		db.Raw(`SELECT COUNT(*) FROM pragma_table_info('third_party_providers') WHERE name='outbound_app_id'`).Scan(&count)
	case "mysql":
		db.Raw(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='third_party_providers' AND COLUMN_NAME='outbound_app_id'`).Scan(&count)
	default:
		log.Printf("migrate thirdparty outbound: unsupported dialect %q", dialect)
		return
	}

	if count > 0 {
		return // 已存在，跳过
	}

	// 添加字段
	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN outbound_app_id INTEGER NOT NULL DEFAULT 0`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add outbound_app_id: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN user_sync_enabled BOOLEAN NOT NULL DEFAULT 0`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add user_sync_enabled: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN user_info_endpoint VARCHAR(500) NOT NULL DEFAULT ''`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add user_info_endpoint: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN user_list_endpoint VARCHAR(500) NOT NULL DEFAULT ''`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add user_list_endpoint: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN role_mapping_json TEXT`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add role_mapping_json: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN default_role VARCHAR(20) NOT NULL DEFAULT 'viewer'`).Error; err != nil {
		log.Printf("migrate thirdparty outbound: add default_role: %v", err)
		return
	}

	// 添加索引
	switch dialect {
	case "sqlite":
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_third_party_providers_outbound_app_id ON third_party_providers(outbound_app_id)`)
	case "mysql":
		db.Exec(`ALTER TABLE third_party_providers ADD INDEX idx_third_party_providers_outbound_app_id (outbound_app_id)`)
	}

	log.Println("migrate thirdparty outbound: columns and index added")
}
