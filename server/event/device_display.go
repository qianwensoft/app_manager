package event

import (
	"app-manager/models"
	"fmt"
	"strings"
)

// DeviceDisplayName 控制台展示用名称：优先台账名称 → Agent 别名 → 服务端别名 → 合理 serial。
func DeviceDisplayName(d *models.Device) string {
	if d == nil {
		return ""
	}
	if s := strings.TrimSpace(d.Name); s != "" {
		return s
	}
	if s := strings.TrimSpace(d.AgentAlias); s != "" {
		return s
	}
	if s := strings.TrimSpace(d.ServerAlias); s != "" {
		return s
	}
	if s := strings.TrimSpace(d.Serial); s != "" && !strings.HasPrefix(s, "agent-") {
		return s
	}
	return ""
}

// DeviceIdentifierTail 用于与名称组合的标识尾（序列号优先，否则 Agent Token 前缀）。
func DeviceIdentifierTail(d *models.Device) string {
	if d == nil {
		return ""
	}
	if s := strings.TrimSpace(d.Serial); s != "" && !strings.HasPrefix(s, "agent-") {
		return s
	}
	if t := strings.TrimSpace(d.AgentToken); t != "" {
		if len(t) <= 12 {
			return t
		}
		return t[:8] + "…"
	}
	return ""
}

// DeviceDisplayLine 单行展示：[#id] 名称（标识），便于事件流列表。
func DeviceDisplayLine(deviceID uint, d *models.Device) string {
	name := DeviceDisplayName(d)
	tail := DeviceIdentifierTail(d)
	prefix := fmt.Sprintf("[#%d]", deviceID)
	if name != "" && tail != "" {
		return prefix + " " + name + "（" + tail + "）"
	}
	if name != "" {
		return prefix + " " + name
	}
	if tail != "" {
		return prefix + " " + tail
	}
	return prefix + " 设备"
}
