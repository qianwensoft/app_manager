package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateThirdPartyAuthorizerAppID 为 third_party_tokens 表补充 authorizer_appid 列（旧库升级）。
func MigrateThirdPartyAuthorizerAppID(db *gorm.DB) {
	dialect := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))

	// 检查列是否已存在
	var count int64
	switch dialect {
	case "sqlite":
		db.Raw(`SELECT COUNT(*) FROM pragma_table_info('third_party_tokens') WHERE name='authorizer_appid'`).Scan(&count)
	case "mysql":
		db.Raw(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='third_party_tokens' AND COLUMN_NAME='authorizer_appid'`).Scan(&count)
	default:
		log.Printf("migrate thirdparty authorizer_appid: unsupported dialect %q", dialect)
		return
	}

	if count > 0 {
		return // 已存在，跳过
	}

	if err := db.Exec(`ALTER TABLE third_party_tokens ADD COLUMN authorizer_appid VARCHAR(128) NOT NULL DEFAULT ''`).Error; err != nil {
		log.Printf("migrate thirdparty authorizer_appid: alter table: %v", err)
		return
	}

	// 补索引
	switch dialect {
	case "sqlite":
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_third_party_tokens_authorizer_app_id ON third_party_tokens(authorizer_appid)`)
	case "mysql":
		db.Exec(`ALTER TABLE third_party_tokens ADD INDEX idx_third_party_tokens_authorizer_app_id (authorizer_appid)`)
	}

	log.Println("migrate thirdparty authorizer_appid: column and index added")
}
