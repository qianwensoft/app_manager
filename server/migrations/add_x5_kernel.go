package migrations

import (
	"log"

	"app-manager/models"

	"gorm.io/gorm"
)

// MigrateX5Kernel 创建 X5 内核管理表
func MigrateX5Kernel(db *gorm.DB) {
	log.Println("[Migration] Creating x5_kernel_versions table...")

	if err := db.AutoMigrate(&models.X5KernelVersion{}); err != nil {
		log.Fatalf("Failed to migrate x5_kernel_versions: %v", err)
	}

	log.Println("[Migration] x5_kernel_versions table created successfully")
}
