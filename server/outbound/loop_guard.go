package outbound

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"app-manager/models"
)

// OutboundBroadcastMarkerExtra 出站 broadcast_intent 自动注入的 Intent extra 键；Agent 监听可配置忽略带此键的广播以防回环。
const OutboundBroadcastMarkerExtra = "_appmanager_outbound"

type loopCooldownKey struct {
	DeviceID    uint
	ConnectorID uint
}

var (
	loopCooldownMu sync.Mutex
	loopCooldownAt = map[loopCooldownKey]time.Time{}
)

// OutboundLoopGuardPayload 下发给 Agent 监听的回环防护配置。
func OutboundLoopGuardPayload() map[string]interface{} {
	return map[string]interface{}{
		"ignore_extra_key": OutboundBroadcastMarkerExtra,
	}
}

// ScanValueFromEventData 从 device_event.event_data JSON 提取扫码 value 字段（用于同码防抖）。
func ScanValueFromEventData(eventData string) string {
	trimmed := strings.TrimSpace(eventData)
	if trimmed == "" {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &m); err != nil || m == nil {
		return ""
	}
	if v, ok := m["value"]; ok && v != nil {
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}

// RecordConnectorLoopCooldown 连接器执行 broadcast_intent 成功后，在冷却期内同设备不再触发该连接器。
func RecordConnectorLoopCooldown(connectorID, deviceID uint, cooldownMS int) {
	if connectorID == 0 || deviceID == 0 || cooldownMS <= 0 {
		return
	}
	until := time.Now().Add(time.Duration(cooldownMS) * time.Millisecond)
	key := loopCooldownKey{DeviceID: deviceID, ConnectorID: connectorID}
	loopCooldownMu.Lock()
	loopCooldownAt[key] = until
	loopCooldownMu.Unlock()
}

// ConnectorLoopCooldownPass 冷却期内返回 false（应跳过触发）。
func ConnectorLoopCooldownPass(connectorID, deviceID uint) bool {
	if connectorID == 0 || deviceID == 0 {
		return true
	}
	key := loopCooldownKey{DeviceID: deviceID, ConnectorID: connectorID}
	now := time.Now()
	loopCooldownMu.Lock()
	defer loopCooldownMu.Unlock()
	until, ok := loopCooldownAt[key]
	if !ok {
		return true
	}
	if now.Before(until) {
		return false
	}
	delete(loopCooldownAt, key)
	return true
}

// ConnectorEventPass 触发前综合检查：回环冷却 + 防抖（事件类型 / 扫码值）。
func ConnectorEventPass(c models.OutboundConnector, deviceID uint, eventType, eventData string) bool {
	if !ConnectorLoopCooldownPass(c.ID, deviceID) {
		return false
	}
	return connectorDebouncePass(c, deviceID, eventType, eventData)
}
