package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

const wirelessAdbMenuIntent = "com.appmanager.agent.ACTION_OPEN_WIRELESS_ADB"

// SeedDefaultAgentMenus 确保内置「无线 ADB」Agent 菜单存在（可下发到设备后在端上点击）。
func SeedDefaultAgentMenus(db *gorm.DB) {
	var n int64
	if err := db.Model(&models.AgentMenuItem{}).
		Where("intent_action = ?", wirelessAdbMenuIntent).
		Count(&n).Error; err != nil {
		log.Printf("seed agent menu check: %v", err)
		return
	}
	if n > 0 {
		return
	}
	item := models.AgentMenuItem{
		Title:           "无线 ADB",
		Icon:            "",
		TargetType:      "agent_native",
		TargetRef:       "wireless_adb",
		ShowOnAgentHome: true,
		IntentAction:    wirelessAdbMenuIntent,
		SortOrder:       90,
		OpenMode:        "replace",
	}
	if err := db.Create(&item).Error; err != nil {
		log.Printf("seed agent menu wireless adb: %v", err)
		return
	}
	log.Printf("seed agent menu: wireless ADB (id=%d)", item.ID)
}
