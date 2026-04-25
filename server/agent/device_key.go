package agent

import (
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// isNumericID is true when key is a decimal database id（Web / API）.
func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

var hexOnlyPattern = regexp.MustCompile(`^[0-9a-fA-F]+$`)

// looksLikeHexAgentToken 纯十六进制且长度为常见 Token/哈希，避免误当作硬件串号解析。
func looksLikeHexAgentToken(key string) bool {
	if !hexOnlyPattern.MatchString(key) {
		return false
	}
	switch len(key) {
	case 20, 32, 40, 64:
		return true
	default:
		return false
	}
}

// shouldTryAndroidSerialLookup 在 agent_token / serial 未命中时再尝试 android_serial。
func shouldTryAndroidSerialLookup(key string) bool {
	if len(key) < 4 || len(key) > 64 {
		return false
	}
	if strings.HasPrefix(strings.ToLower(key), "agent-") {
		return false
	}
	if looksLikeHexAgentToken(key) {
		return false
	}
	return true
}

func resolveDeviceKeyToID(key string) (uint, bool) {
	key = strings.TrimSpace(key)
	if key == "" {
		return 0, false
	}
	var d models.Device
	sess := database.DB.Session(&gorm.Session{NewDB: true})

	if isNumericID(key) {
		id, err := strconv.ParseUint(key, 10, 64)
		if err == nil {
			if err := sess.First(&d, uint(id)).Error; err == nil {
				return d.ID, true
			}
		}
	}
	if err := sess.Where("agent_token = ? OR serial = ?", key, key).First(&d).Error; err == nil {
		return d.ID, true
	}
	if shouldTryAndroidSerialLookup(key) {
		if err := sess.Where("android_serial = ?", key).First(&d).Error; err == nil {
			return d.ID, true
		}
	}
	return 0, false
}

// DeviceScope scopes updates to exactly one device row（避免 OR 命中多行批量更新）。
func DeviceScope(deviceKey string) *gorm.DB {
	sess := database.DB.Session(&gorm.Session{NewDB: true}).Table("devices")
	key := strings.TrimSpace(deviceKey)
	if key == "" {
		return sess.Where("1 = 0")
	}
	if id, ok := resolveDeviceKeyToID(key); ok {
		return sess.Where("id = ?", id)
	}
	return sess.Where("1 = 0")
}

// ResolveDeviceID returns the DB primary key for a WebSocket / Agent / X-Device-Token key:
// 数字 id、agent_token、ADB serial（devices.serial），或硬件串号 android_serial。
func ResolveDeviceID(deviceKey string) (uint, bool) {
	return resolveDeviceKeyToID(strings.TrimSpace(deviceKey))
}

// LookupDeviceByConnectionKey 与 /ws/agent/:key、ResolveDeviceID 规则一致，供仅凭 X-Device-Token 的 HTTP 接口使用。
func LookupDeviceByConnectionKey(key string) (*models.Device, bool) {
	id, ok := ResolveDeviceID(strings.TrimSpace(key))
	if !ok {
		return nil, false
	}
	var d models.Device
	if err := database.DB.First(&d, id).Error; err != nil {
		return nil, false
	}
	return &d, true
}

// AgentConnectionKey 将 Web/API 中的设备参数（数字 id、Token、ADB serial、硬件串号）映射为 Android Agent 使用的连接键
//（与 /ws/agent/:key 路径段一致），供 Screen/Shell/Logcat 信令与 Hub 路由使用。
func AgentConnectionKey(webParam string) (string, error) {
	key := strings.TrimSpace(webParam)
	id, ok := resolveDeviceKeyToID(key)
	if !ok {
		return "", fmt.Errorf("未找到对应设备（请检查 id、Token、ADB Serial 或硬件串号）")
	}
	var d models.Device
	sess := database.DB.Session(&gorm.Session{NewDB: true})
	if err := sess.First(&d, id).Error; err != nil {
		return "", err
	}
	if d.AgentToken != "" {
		return d.AgentToken, nil
	}
	if strings.HasPrefix(d.Serial, "agent-") {
		return strings.TrimPrefix(d.Serial, "agent-"), nil
	}
	return "", fmt.Errorf("该设备未绑定 Agent Token，无法与手机端 WebSocket 对齐。请在「设备详情 → 设备管理」填写与 Agent 扫码配置一致的 Token，或删除本条后仅用扫码接入")
}
