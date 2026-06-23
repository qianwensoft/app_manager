package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

const wirelessAdbMenuIntent = "com.appmanager.agent.ACTION_OPEN_WIRELESS_ADB"
const workOrderListIntent = "com.appmanager.agent.WORK_ORDER_LIST"
const myWorkOrderListIntent = "com.appmanager.agent.MY_WORK_ORDER_LIST"

// SeedDefaultAgentMenus 确保内置 Agent 菜单存在（可下发到设备后在端上点击）。
func SeedDefaultAgentMenus(db *gorm.DB) {
	seedWirelessAdbMenu(db)
	seedWorkOrderMenus(db)
}

func seedWirelessAdbMenu(db *gorm.DB) {
	var n int64
	if err := db.Model(&models.AgentMenuItem{}).
		Where("intent_action = ?", wirelessAdbMenuIntent).
		Count(&n).Error; err != nil {
		log.Printf("seed agent menu check (wireless adb): %v", err)
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

func seedWorkOrderMenus(db *gorm.DB) {
	// 工单处理菜单（需手动分配给 admin 用户的设备）
	var n1 int64
	if err := db.Model(&models.AgentMenuItem{}).
		Where("intent_action = ?", workOrderListIntent).
		Count(&n1).Error; err != nil {
		log.Printf("seed agent menu check (work order list): %v", err)
	} else if n1 == 0 {
		item := models.AgentMenuItem{
			Title:           "工单处理",
			Icon:            "",
			TargetType:      "agent_native",
			TargetRef:       "work_order_list",
			ShowOnAgentHome: false,
			IntentAction:    workOrderListIntent,
			SortOrder:       100,
			OpenMode:        "push",
		}
		if err := db.Create(&item).Error; err != nil {
			log.Printf("seed agent menu work order list: %v", err)
		} else {
			log.Printf("seed agent menu: work order list (id=%d)", item.ID)
		}
	}

	// 我的工单菜单（需手动分配给设备）
	var n2 int64
	if err := db.Model(&models.AgentMenuItem{}).
		Where("intent_action = ?", myWorkOrderListIntent).
		Count(&n2).Error; err != nil {
		log.Printf("seed agent menu check (my work order list): %v", err)
	} else if n2 == 0 {
		item := models.AgentMenuItem{
			Title:           "我的工单",
			Icon:            "",
			TargetType:      "agent_native",
			TargetRef:       "my_work_order_list",
			ShowOnAgentHome: false,
			IntentAction:    myWorkOrderListIntent,
			SortOrder:       101,
			OpenMode:        "push",
		}
		if err := db.Create(&item).Error; err != nil {
			log.Printf("seed agent menu my work order list: %v", err)
		} else {
			log.Printf("seed agent menu: my work order list (id=%d)", item.ID)
		}
	}
}
