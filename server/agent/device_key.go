package agent

import (
	"app-manager/database"
	"app-manager/models"
	"fmt"
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

// DeviceScope scopes updates to the device row for a WebSocket key: numeric id, agent_token, or ADB serial.
// 使用独立 Session + 表名，避免与其它链式查询在共享 *gorm.DB 上串条件。
func DeviceScope(deviceKey string) *gorm.DB {
	sess := database.DB.Session(&gorm.Session{NewDB: true}).Table("devices")
	if isNumericID(deviceKey) {
		id, err := strconv.ParseUint(deviceKey, 10, 64)
		if err != nil {
			return sess.Where("agent_token = ? OR serial = ?", deviceKey, deviceKey)
		}
		return sess.Where("id = ?", uint(id))
	}
	return sess.Where("agent_token = ? OR serial = ?", deviceKey, deviceKey)
}

// ResolveDeviceID returns the DB primary key for a WebSocket / Agent key.
func ResolveDeviceID(deviceKey string) (uint, bool) {
	var d models.Device
	sess := database.DB.Session(&gorm.Session{NewDB: true})
	if isNumericID(deviceKey) {
		id, err := strconv.ParseUint(deviceKey, 10, 64)
		if err != nil {
			return 0, false
		}
		if err := sess.First(&d, uint(id)).Error; err == nil {
			return d.ID, true
		}
		return 0, false
	}
	if err := sess.Where("agent_token = ? OR serial = ?", deviceKey, deviceKey).First(&d).Error; err == nil {
		return d.ID, true
	}
	return 0, false
}

// AgentConnectionKey 将 Web/API 中的设备参数（数字 id 或 token）映射为 Android Agent 使用的连接键
//（与 /ws/agent/:key 路径段一致），供 Screen/Shell/Logcat 信令与 Hub 路由使用。
func AgentConnectionKey(webParam string) (string, error) {
	var d models.Device
	sess := database.DB.Session(&gorm.Session{NewDB: true})
	if isNumericID(webParam) {
		id, err := strconv.ParseUint(webParam, 10, 64)
		if err != nil {
			return "", fmt.Errorf("invalid device id")
		}
		if err := sess.First(&d, uint(id)).Error; err != nil {
			return "", err
		}
	} else {
		if err := sess.Where("agent_token = ? OR serial = ?", webParam, webParam).First(&d).Error; err != nil {
			return "", err
		}
	}
	if d.AgentToken != "" {
		return d.AgentToken, nil
	}
	if strings.HasPrefix(d.Serial, "agent-") {
		return strings.TrimPrefix(d.Serial, "agent-"), nil
	}
	return "", fmt.Errorf("该设备未绑定 Agent Token，无法与手机端 WebSocket 对齐。请在「设备详情 → 设备管理」填写与 Agent 扫码配置一致的 Token，或删除本条后仅用扫码接入")
}
