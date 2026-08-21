package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateThirdPartySSOSecurity 为 third_party_providers 表添加 SSO 跳转安全相关字段
// （P0：redirect_to 白名单 + HMAC 签名）。
func MigrateThirdPartySSOSecurity(db *gorm.DB) {
	dialect := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))

	addColumn := func(name, ddl string) {
		var count int64
		switch dialect {
		case "sqlite":
			db.Raw(`SELECT COUNT(*) FROM pragma_table_info('third_party_providers') WHERE name=?`, name).Scan(&count)
		case "mysql":
			db.Raw(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='third_party_providers' AND COLUMN_NAME=?`, name).Scan(&count)
		default:
			log.Printf("migrate thirdparty sso security: unsupported dialect %q", dialect)
			return
		}
		if count > 0 {
			return
		}
		if err := db.Exec(`ALTER TABLE third_party_providers ADD COLUMN ` + ddl).Error; err != nil {
			log.Printf("migrate thirdparty sso security: add %s: %v", name, err)
		}
	}

	addColumn("redirect_allowlist_json", `redirect_allowlist_json TEXT`)
	addColumn("redirect_allow_enabled", `redirect_allow_enabled BOOLEAN NOT NULL DEFAULT 1`)
	addColumn("hmac_secret", `hmac_secret VARCHAR(128) NOT NULL DEFAULT ''`)
	addColumn("hmac_clock_skew_sec", `hmac_clock_skew_sec INTEGER NOT NULL DEFAULT 300`)

	log.Println("migrate thirdparty sso security: columns added (redirect_allowlist_json, redirect_allow_enabled, hmac_secret, hmac_clock_skew_sec)")
}
