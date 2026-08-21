package database

import (
	"log"

	"gorm.io/gorm"
)

// MigrateAuditLogUserAgent 为 audit_logs 表添加 user_agent 字段
func MigrateAuditLogUserAgent(db *gorm.DB) {
	if db.Migrator().HasColumn(&struct {
		UserAgent string `gorm:"size:500"`
	}{}, "user_agent") {
		return
	}

	log.Println("[migrate] Adding user_agent column to audit_logs...")
	if err := db.Migrator().AddColumn(&struct {
		UserAgent string `gorm:"size:500"`
	}{}, "user_agent"); err != nil {
		log.Printf("[migrate] Failed to add user_agent column: %v", err)
	} else {
		log.Println("[migrate] user_agent column added successfully")
	}
}
