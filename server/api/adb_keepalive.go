package api

import (
	"app-manager/database"
	"app-manager/models"
	"log"
	"strconv"
	"strings"
	"time"
)

// StartAdbKeepalive 启动后台 goroutine，每 30 秒对所有有 wireless_adb_serial 的设备
// 执行 adb connect，确保 adb server 重启后连接自动恢复，直到手动断开或设备离线。
func StartAdbKeepalive() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			keepaliveOnce()
		}
	}()
}

func keepaliveOnce() {
	var devices []models.Device
	if err := database.DB.Where("wireless_adb_serial != ''").Find(&devices).Error; err != nil {
		return
	}
	if len(devices) == 0 {
		return
	}
	cli := getADB()
	for _, d := range devices {
		serial := d.WirelessAdbSerial
		parts := strings.SplitN(serial, ":", 2)
		if len(parts) != 2 {
			continue
		}
		port, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		out, err := cli.ConnectTCP(parts[0], port)
		if err != nil {
			log.Printf("[adb-keepalive] device %d %s connect error: %v", d.ID, serial, err)
			continue
		}
		outLow := strings.ToLower(out)
		// 连接失败（设备真的离线）时更新状态
		if strings.Contains(outLow, "failed") || strings.Contains(outLow, "cannot") || strings.Contains(outLow, "refused") {
			database.DB.Model(&models.Device{}).Where("id = ?", d.ID).Update("status", "offline")
			log.Printf("[adb-keepalive] device %d %s offline: %s", d.ID, serial, out)
		}
	}
}
