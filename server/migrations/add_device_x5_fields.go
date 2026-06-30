package migrations

import (
	"log"

	"gorm.io/gorm"
)

// MigrateDeviceX5Fields 为 devices 表添加 X5 内核相关字段
func MigrateDeviceX5Fields(db *gorm.DB) {
	log.Println("[Migration] Adding X5 kernel fields to devices table...")

	// 添加 x5_kernel_version 字段
	if !db.Migrator().HasColumn(&struct{ TableName string }{TableName: "devices"}, "x5_kernel_version") {
		if err := db.Exec("ALTER TABLE devices ADD COLUMN x5_kernel_version INT DEFAULT 0").Error; err != nil {
			log.Printf("Warning: Failed to add x5_kernel_version column: %v", err)
		} else {
			log.Println("[Migration] Added x5_kernel_version column")
		}
	}

	// 添加 x5_kernel_state 字段
	if !db.Migrator().HasColumn(&struct{ TableName string }{TableName: "devices"}, "x5_kernel_state") {
		if err := db.Exec("ALTER TABLE devices ADD COLUMN x5_kernel_state VARCHAR(50) DEFAULT ''").Error; err != nil {
			log.Printf("Warning: Failed to add x5_kernel_state column: %v", err)
		} else {
			log.Println("[Migration] Added x5_kernel_state column")
		}
	}

	log.Println("[Migration] Device X5 fields migration completed")
}
