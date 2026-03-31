package agent

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"fmt"
	"log"
)

// PublishDeviceProfileUpdated 通知 Web 端刷新设备别名/分组等（STOMP /topic/devices）。
func PublishDeviceProfileUpdated(deviceID uint) {
	if deviceID == 0 {
		return
	}
	b, err := json.Marshal(map[string]interface{}{
		"type":      "device_profile_updated",
		"device_id": deviceID,
	})
	if err != nil {
		return
	}
	stomp.DefaultHub.PublishJSON("/topic/devices", string(b))
}

// PushDeviceProfileToAgent 将库中的服务端别名、分组推送到已连接的 Agent（与 Web 保存一致）。
func PushDeviceProfileToAgent(deviceID uint) {
	if deviceID == 0 {
		return
	}
	key, err := AgentConnectionKey(fmt.Sprintf("%d", deviceID))
	if err != nil {
		return
	}
	var d models.Device
	if err := database.DB.First(&d, deviceID).Error; err != nil {
		return
	}
	if !AgentHub.IsConnected(key) {
		return
	}
	msg := map[string]interface{}{
		"type": "device_profile_sync",
		"data": map[string]interface{}{
			"device_alias": d.ServerAlias,
			"group_name":   d.GroupName,
		},
	}
	if err := AgentHub.Send(key, msg); err != nil {
		log.Printf("PushDeviceProfileToAgent [%d]: %v", deviceID, err)
	}
}
