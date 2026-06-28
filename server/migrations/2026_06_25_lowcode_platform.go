package migrations

import (
	"app-manager/lowcode"

	"gorm.io/gorm"
)

func init() {
	register("2026-06-25-lowcode-platform", migrateLowCodePlatform)
}

func migrateLowCodePlatform(db *gorm.DB) error {
	return db.AutoMigrate(
		&lowcode.LowCodePage{},
		&lowcode.LowCodePageVersion{},
		&lowcode.LowCodeWorkflow{},
		&lowcode.LowCodeEvent{},
		&lowcode.LowCodeCollabSession{},
	)
}
