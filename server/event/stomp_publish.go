package event

import (
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// PublishDeviceCustomEventSTOMP 将单条设备自定义事件推送到 STOMP：全量主题 + 按设备主题。
// d 可为 nil（库中无该设备行时仍推送 device_id）。
func PublishDeviceCustomEventSTOMP(rec models.DeviceEvent, d *models.Device) {
	payload := map[string]interface{}{
		"type":       "device_custom_event",
		"id":         rec.ID,
		"device_id":  rec.DeviceID,
		"event_type": rec.EventType,
		"event_data": rec.EventData,
		"created_at": rec.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
	if d != nil {
		payload["device_name"] = DeviceDisplayName(d)
		payload["device_serial"] = strings.TrimSpace(d.Serial)
		payload["agent_token"] = strings.TrimSpace(d.AgentToken)
		payload["agent_alias"] = strings.TrimSpace(d.AgentAlias)
		payload["group_name"] = strings.TrimSpace(d.GroupName)
		payload["server_alias"] = strings.TrimSpace(d.ServerAlias)
		payload["device_display"] = DeviceDisplayLine(rec.DeviceID, d)
	} else {
		payload["device_name"] = ""
		payload["device_serial"] = ""
		payload["agent_token"] = ""
		payload["agent_alias"] = ""
		payload["group_name"] = ""
		payload["server_alias"] = ""
		payload["device_display"] = fmt.Sprintf("[#%d] 设备", rec.DeviceID)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	s := string(b)
	stomp.DefaultHub.PublishJSON("/topic/events", s)
	stomp.DefaultHub.PublishJSON(fmt.Sprintf("/topic/device/%d/events", rec.DeviceID), s)
}
