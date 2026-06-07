package api

import (
	"app-manager/database"
	"app-manager/models"
	"log"
	"strconv"
	"strings"
	"time"
)

// StartAdbKeepalive 启动后台 goroutine，每 30 秒对所有已保存无线 ADB 端口的设备
// 用当前 IP + 端口执行 adb connect，确保 adb server 重启后连接自动恢复。
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
	if err := database.DB.Where("wireless_adb_port > 0 OR wireless_adb_serial != ''").Find(&devices).Error; err != nil {
		return
	}
	if len(devices) == 0 {
		return
	}
	cli := getADB()
	for _, d := range devices {
		port := wirelessAdbPort(&d)
		ip := strings.TrimSpace(d.IP)
		if port <= 0 || ip == "" {
			continue
		}
		serial := ip + ":" + strconv.Itoa(port)
		st := resolveAdbSerialState(cli, serial)
		if st == "device" {
			continue
		}
		if st == "connecting" {
			continue
		}
		noteAdbConnectAttempt(serial)
		out, err := cli.ConnectTCP(ip, port)
		if err != nil {
			_ = cli.Disconnect(serial)
			clearAdbConnectingNote(serial)
			log.Printf("[adb-keepalive] device %d %s connect error: %v", d.ID, serial, err)
			continue
		}
		outLow := strings.ToLower(out)
		// 连接失败（设备真的离线）时更新状态，并断开避免 adb 长期停留在 connecting
		if strings.Contains(outLow, "failed") || strings.Contains(outLow, "cannot") || strings.Contains(outLow, "refused") {
			_ = cli.Disconnect(serial)
			clearAdbConnectingNote(serial)
			database.DB.Model(&models.Device{}).Where("id = ?", d.ID).Update("status", "offline")
			log.Printf("[adb-keepalive] device %d %s offline: %s", d.ID, serial, out)
		}
	}
}
