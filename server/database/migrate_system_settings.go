package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

// MigrateSystemSettings 建表：运行时系统配置（MinIO、邮件、第三方密钥等）。
// 由 db.initSchema 的迁移链统一调用。
func MigrateSystemSettings(db *gorm.DB) {
	if err := db.AutoMigrate(&models.SystemSetting{}); err != nil {
		log.Printf("[migrate] system_settings failed: %v", err)
		return
	}
	log.Printf("[migrate] system_settings ready")
}
