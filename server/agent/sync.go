package agent

import (
	"app-manager/database"
	"app-manager/models"
	"log"
	"time"
)

func heartbeatBool(v interface{}) (bool, bool) {
	switch x := v.(type) {
	case bool:
		return x, true
	case float64:
		return x != 0, true
	case string:
		return x == "true" || x == "1", true
	default:
		return false, false
	}
}

// SyncDeviceStatus updates device status in DB when agent connects/disconnects.
// deviceID is either numeric DB id (来自 Web 端) 或 Agent 扫码 token / ADB serial。
func SyncDeviceStatus(deviceID string, connected bool) {
	updates := map[string]interface{}{
		"agent_connected": connected,
	}
	if connected {
		updates["status"] = "online"
		updates["last_seen_at"] = time.Now()
	} else {
		updates["status"] = "offline"
	}
	result := DeviceScope(deviceID).Updates(updates)
	if result.Error != nil {
		log.Printf("Failed to sync device status [%s]: %v", deviceID, result.Error)
		return
	}
	// 扫码 token 首次上线：库中尚无对应行时自动建一条（serial 占位，避免与 id 比较混用）
	if connected && result.RowsAffected == 0 && !isNumericID(deviceID) {
		if err := ensureAgentDevice(deviceID, ""); err != nil {
			log.Printf("Failed to auto-register agent device [%s]: %v", deviceID, err)
			return
		}
		if err := DeviceScope(deviceID).Updates(updates).Error; err != nil {
			log.Printf("Failed to sync device status after register [%s]: %v", deviceID, err)
		}
	}
}

// ensureAgentDevice 保证存在 agent_token 对应的设备行（扫码 token 首次上报）。
// 若提供了 androidSerial，先按 android_serial 查找同一台物理设备（重装 App 场景），
// 找到则更新其 agent_token，避免产生重复设备记录。
func ensureAgentDevice(deviceKey, androidSerial string) error {
	if isNumericID(deviceKey) {
		return nil
	}

	// 1. 先查 android_serial 是否已有记录（重装 App 场景）
	if androidSerial != "" && androidSerial != "unknown" {
		var existing models.Device
		err := database.DB.Where("android_serial = ?", androidSerial).First(&existing).Error
		if err == nil && existing.ID > 0 {
			// 找到同一台物理设备，更新 agent_token（不更改 serial 等其他字段）
			now := time.Now()
			return database.DB.Model(&existing).Updates(map[string]interface{}{
				"agent_token":    deviceKey,
				"serial":         "agent-" + deviceKey,
				"agent_connected": true,
				"status":          "online",
				"last_seen_at":    now,
			}).Error
		}
	}

	// 2. 没有找到同一台物理设备，按 agent_token 首次创建
	var d models.Device
	now := time.Now()
	return database.DB.Where("agent_token = ?", deviceKey).FirstOrCreate(&d, models.Device{
		Serial:     "agent-" + deviceKey,
		Name:       "Agent 设备",
		AgentToken: deviceKey,
		LastSeenAt: &now,
		CreatedAt:  now,
	}).Error
}

func strFromInfo(v interface{}) (string, bool) {
	if v == nil {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

// HandleHeartbeat updates last_seen_at on heartbeat
func HandleHeartbeat(deviceID string, info map[string]interface{}) {
	dbID, haveID := ResolveDeviceID(deviceID)
	var old models.Device
	if haveID {
		_ = database.DB.First(&old, dbID).Error
	}

	updates := map[string]interface{}{
		"last_seen_at":    time.Now(),
		"agent_connected": true,
		"status":          "online",
	}
	if battery, ok := info["battery"].(float64); ok {
		updates["battery"] = int(battery)
	}
	if cpu, ok := info["cpu_usage"].(float64); ok {
		updates["cpu_usage"] = cpu
	}
	if memUsed, ok := info["memory_used"].(float64); ok {
		updates["memory_used"] = int64(memUsed)
	}
	if memTotal, ok := info["memory_total"].(float64); ok {
		mt := int64(memTotal)
		updates["memory_total"] = mt
		// Web 设备详情「内存」列与 ADB 入库字段 total_memory 对齐
		updates["total_memory"] = mt
	}
	if stUsed, ok := info["storage_used"].(float64); ok {
		updates["storage_used"] = int64(stUsed)
	}
	if stTotal, ok := info["storage_total"].(float64); ok {
		updates["total_storage"] = int64(stTotal)
	}
	if ip, ok := info["ip"].(string); ok && ip != "" {
		updates["ip"] = ip
	}
	if network, ok := info["network_type"].(string); ok {
		updates["network_type"] = network
	}
	if model, ok := info["model"].(string); ok && model != "" {
		updates["model"] = model
	}
	if brand, ok := info["brand"].(string); ok && brand != "" {
		updates["brand"] = brand
	}
	if osVersion, ok := info["os_version"].(string); ok && osVersion != "" {
		updates["os_version"] = osVersion
	}
	if sdkVersion, ok := info["sdk_version"].(float64); ok {
		updates["sdk_version"] = int(sdkVersion)
	}
	if wifiSSID, ok := info["wifi_ssid"].(string); ok {
		updates["wifi_ssid"] = wifiSSID
	}
	if wifiSignal, ok := info["wifi_signal"].(float64); ok {
		updates["wifi_signal"] = int(wifiSignal)
	}
	if wifiSpeed, ok := info["wifi_speed"].(float64); ok {
		updates["wifi_speed"] = int(wifiSpeed)
	}
	if networkConnected, ok := info["network_connected"].(bool); ok {
		updates["network_connected"] = networkConnected
	}
	if agentAlias, ok := info["agent_alias"].(string); ok {
		updates["agent_alias"] = agentAlias
	}
	if gn, ok := strFromInfo(info["group_name"]); ok {
		updates["group_name"] = gn
	}
	if resolution, ok := info["resolution"].(string); ok && resolution != "" {
		updates["resolution"] = resolution
	}
	if b, ok := heartbeatBool(info["allow_remote_screen"]); ok {
		updates["allow_remote_screen"] = b
	}
	if av, ok := strFromInfo(info["agent_version"]); ok && av != "" {
		updates["agent_version"] = av
	}
	// 手机硬件序列号（Build.SERIAL），作为物理设备唯一标识，写入专用字段用于跨重装识别
	androidSerial := ""
	if as, ok := strFromInfo(info["android_serial"]); ok && as != "" && as != "unknown" {
		androidSerial = as
		updates["android_serial"] = as
	}

	result := DeviceScope(deviceID).Updates(updates)
	if result.Error != nil {
		log.Printf("HandleHeartbeat [%s]: %v", deviceID, result.Error)
		return
	}
	if result.RowsAffected == 0 && !isNumericID(deviceID) {
		// 传入 androidSerial，支持重装 App 后按物理设备合并记录
		if err := ensureAgentDevice(deviceID, androidSerial); err != nil {
			log.Printf("HandleHeartbeat ensureAgentDevice [%s]: %v", deviceID, err)
			return
		}
		if err := DeviceScope(deviceID).Updates(updates).Error; err != nil {
			log.Printf("HandleHeartbeat retry [%s]: %v", deviceID, err)
		}
	}

	profileChanged := false
	if haveID {
		if v, ok := updates["agent_alias"].(string); ok && v != old.AgentAlias {
			profileChanged = true
		}
		if v, ok := updates["group_name"].(string); ok && v != old.GroupName {
			profileChanged = true
		}
	}
	if profileChanged {
		PublishDeviceProfileUpdated(dbID)
	}
}

