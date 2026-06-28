package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateUserThirdParty 为 users 表添加第三方平台关联字段。
func MigrateUserThirdParty(db *gorm.DB) {
	dialect := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))

	// 检查 provider_id 列是否已存在
	var count int64
	switch dialect {
	case "sqlite":
		db.Raw(`SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='provider_id'`).Scan(&count)
	case "mysql":
		db.Raw(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='provider_id'`).Scan(&count)
	default:
		log.Printf("migrate user thirdparty: unsupported dialect %q", dialect)
		return
	}

	if count > 0 {
		return // 已存在，跳过
	}

	// 添加字段
	if err := db.Exec(`ALTER TABLE users ADD COLUMN provider_id INTEGER NOT NULL DEFAULT 0`).Error; err != nil {
		log.Printf("migrate user thirdparty: add provider_id: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE users ADD COLUMN external_user_id VARCHAR(128) NOT NULL DEFAULT ''`).Error; err != nil {
		log.Printf("migrate user thirdparty: add external_user_id: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE users ADD COLUMN external_username VARCHAR(128) NOT NULL DEFAULT ''`).Error; err != nil {
		log.Printf("migrate user thirdparty: add external_username: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE users ADD COLUMN user_info_json TEXT`).Error; err != nil {
		log.Printf("migrate user thirdparty: add user_info_json: %v", err)
		return
	}

	if err := db.Exec(`ALTER TABLE users ADD COLUMN synced_at DATETIME`).Error; err != nil {
		log.Printf("migrate user thirdparty: add synced_at: %v", err)
		return
	}

	// 添加索引
	switch dialect {
	case "sqlite":
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id)`)
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_external_user_id ON users(external_user_id)`)
	case "mysql":
		db.Exec(`ALTER TABLE users ADD INDEX idx_users_provider_id (provider_id)`)
		db.Exec(`ALTER TABLE users ADD INDEX idx_users_external_user_id (external_user_id)`)
	}

	log.Println("migrate user thirdparty: columns and indexes added")
}
