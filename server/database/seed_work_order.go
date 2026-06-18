package database

import (
	"log"

	"app-manager/models"

	"gorm.io/gorm"
)

// SeedDefaultWorkOrderTypes 种入默认工单类型「通用反馈」（仅当无任何类型时）。
func SeedDefaultWorkOrderTypes(db *gorm.DB) {
	var n int64
	db.Model(&models.WorkOrderType{}).Count(&n)
	if n > 0 {
		return
	}
	t := models.WorkOrderType{
		Code:        "general",
		Name:        "通用反馈",
		Description: "默认工单类型：文字 / 拍照 / 视频 / 语音 / 录屏 / 日志",
		FormPageKey: "form",
		Enabled:     true,
		SortOrder:   0,
	}
	if err := db.Create(&t).Error; err != nil {
		log.Printf("seed work order type: %v", err)
	}
}
