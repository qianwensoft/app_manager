package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

func migrateDocumentProjects(db *gorm.DB) {
	log.Println("[Migration] Adding DocumentProject and DocumentProjectCategory tables...")
	if err := db.AutoMigrate(
		&models.DocumentProject{},
		&models.DocumentProjectCategory{},
	); err != nil {
		log.Printf("Warning: Failed to migrate document projects: %v", err)
		return
	}
	log.Println("[Migration] Document projects tables migration completed")
}
