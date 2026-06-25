package database

import (
	"app-manager/models"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// MigrateWirelessAdbPort 将旧版 wireless_adb_serial（ip:port）迁移为仅保存端口，并清空 serial 列。
func MigrateWirelessAdbPort(db *gorm.DB) {
	var devices []models.Device
	if err := db.Where("wireless_adb_serial != '' AND wireless_adb_port = 0").Find(&devices).Error; err != nil {
		return
	}
	for _, d := range devices {
		port := legacyWirelessPort(d.WirelessAdbSerial)
		if port <= 0 {
			continue
		}
		_ = db.Model(&models.Device{}).Where("id = ?", d.ID).Updates(map[string]interface{}{
			"wireless_adb_port":   port,
			"wireless_adb_serial": "",
		}).Error
	}
}

func legacyWirelessPort(serial string) int {
	s := strings.TrimSpace(serial)
	if s == "" {
		return 0
	}
	if idx := strings.LastIndex(s, ":"); idx >= 0 && idx < len(s)-1 {
		if p, err := strconv.Atoi(strings.TrimSpace(s[idx+1:])); err == nil && p > 0 && p <= 65535 {
			return p
		}
	}
	if p, err := strconv.Atoi(s); err == nil && p > 0 && p <= 65535 {
		return p
	}
	return 0
}
