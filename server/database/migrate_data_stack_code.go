package database

import (
	"app-manager/models"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// MigrateDataStackCode 为历史行补齐唯一编码（AutoMigrate 新增列后执行）。
func MigrateDataStackCode(db *gorm.DB) {
	var sources []models.DataSource
	if err := db.Find(&sources).Error; err != nil {
		return
	}
	for _, r := range sources {
		if strings.TrimSpace(r.Code) != "" {
			continue
		}
		c := fmt.Sprintf("src_%d", r.ID)
		_ = db.Model(&models.DataSource{}).Where("id = ?", r.ID).Update("code", c).Error
	}

	var sets []models.Dataset
	if err := db.Find(&sets).Error; err != nil {
		return
	}
	for _, r := range sets {
		if strings.TrimSpace(r.Code) != "" {
			continue
		}
		c := fmt.Sprintf("dt_%d", r.ID)
		_ = db.Model(&models.Dataset{}).Where("id = ?", r.ID).Update("code", c).Error
	}

	var ifaces []models.DataInterface
	if err := db.Find(&ifaces).Error; err != nil {
		return
	}
	for _, r := range ifaces {
		if strings.TrimSpace(r.Code) != "" {
			continue
		}
		c := strings.TrimSpace(r.Slug)
		if c == "" {
			c = fmt.Sprintf("if_%d", r.ID)
		}
		_ = db.Model(&models.DataInterface{}).Where("id = ?", r.ID).Update("code", c).Error
	}
}
