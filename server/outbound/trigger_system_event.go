package outbound

import (
	"log"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"

	"gorm.io/gorm"
)

// NotifySystemEvent 发布平台内部系统事件，触发 trigger_type=system_event 的连接器。
func NotifySystemEvent(eventType string, deviceID uint, eventData string) {
	eventType = strings.TrimSpace(eventType)
	if eventType == "" {
		return
	}
	go dispatchSystemEvent(database.DB, eventType, deviceID, eventData)
}

func dispatchSystemEvent(db *gorm.DB, eventType string, deviceID uint, eventData string) {
	var connectors []models.OutboundConnector
	if err := db.Where("enabled = ? AND trigger_type = ?", true, "system_event").Find(&connectors).Error; err != nil {
		log.Printf("trigger[system_event]: load connectors failed: %v", err)
		return
	}
	if len(connectors) == 0 {
		return
	}

	var dev *models.Device
	if deviceID > 0 {
		var d models.Device
		if err := db.First(&d, deviceID).Error; err == nil {
			dev = &d
		}
	}

	for _, c := range connectors {
		cfg := parseTriggerConfig(c.TriggerConfigJSON)
		if !matchesTypeFilter(eventType, cfg.MatchValues) {
			continue
		}
		if deviceID > 0 && !ConnectorAppliesToDevice(db, c.ID, deviceID) {
			continue
		}
		if deviceID > 0 && DeviceOutboundConnectorPaused(db, c.ID, deviceID) {
			continue
		}
		if !ConnectorEventPass(c, deviceID, eventType, "") {
			continue
		}

		rec := models.DeviceEvent{
			DeviceID:  deviceID,
			EventType: eventType,
			EventData: eventData,
			CreatedAt: time.Now(),
		}
		if err := db.Create(&rec).Error; err != nil {
			log.Printf("trigger[system_event]: save event %q failed: %v", eventType, err)
			continue
		}
		RunConnectorOutbound(c, rec, dev, nil)
	}
}
