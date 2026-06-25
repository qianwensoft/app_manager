package api

import (
	"app-manager/models"
	"fmt"
	"strconv"
	"strings"
)

// wirelessAdbPort 返回设备已保存的无线 ADB 端口（兼容旧版 wireless_adb_serial 中的 ip:port）。
func wirelessAdbPort(d *models.Device) int {
	if d == nil {
		return 0
	}
	if d.WirelessAdbPort > 0 && d.WirelessAdbPort <= 65535 {
		return d.WirelessAdbPort
	}
	return parsePortFromLegacyWirelessSerial(d.WirelessAdbSerial)
}

func parsePortFromLegacyWirelessSerial(serial string) int {
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

func wirelessAdbIP(d *models.Device, override string) string {
	if o := strings.TrimSpace(override); o != "" {
		return o
	}
	if d == nil {
		return ""
	}
	return strings.TrimSpace(d.IP)
}

// wirelessAdbSerial 用当前设备 IP + 已保存端口拼出 adb serial（ip:port）。
func wirelessAdbSerial(d *models.Device) string {
	port := wirelessAdbPort(d)
	if port <= 0 {
		return ""
	}
	ip := wirelessAdbIP(d, "")
	if ip == "" {
		return ""
	}
	return fmt.Sprintf("%s:%d", ip, port)
}
