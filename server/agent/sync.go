package agent

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"log"
	"strings"
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
// deviceID 始终是 Agent WebSocket 连接键（手机机器码 / 扫码 token / 硬件串号），
// 不会是 Web 端的数据库数字 id，因此按连接键解析、并对纯数字机器码也照常自动注册。
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
	result := DeviceScopeByConnKey(deviceID).Updates(updates)
	if result.Error != nil {
		log.Printf("Failed to sync device status [%s]: %v", deviceID, result.Error)
		return
	}
	if connected {
		persistAgentConnectionKey(deviceID)
	}
	// 首次上线：库中尚无对应行时自动建一条；连接键为硬件机器码时同时写入 android_serial
	if connected && result.RowsAffected == 0 {
		androidSerial := ""
		if shouldTryAndroidSerialLookup(deviceID) {
			androidSerial = normalizeAndroidSerial(deviceID)
		}
		if err := ensureAgentDevice(deviceID, androidSerial); err != nil {
			log.Printf("Failed to auto-register agent device [%s]: %v", deviceID, err)
			return
		}
		if err := DeviceScopeByConnKey(deviceID).Updates(updates).Error; err != nil {
			log.Printf("Failed to sync device status after register [%s]: %v", deviceID, err)
		}
	}

	// 推送 Agent 连接状态变化到 STOMP（用于实时更新监控页面）
	publishAgentConnectionChange()

	// 同时推送设备资料更新到 /topic/devices，触发设备详情/列表页实时 reload 状态。
	if id, ok := ResolveConnDeviceID(deviceID); ok {
		PublishDeviceProfileUpdated(id)
	}
}

// staleDeviceTimeout 是兜底判定离线的阈值。须明显大于 readPump 的 agentReadTimeout(75s)，
// 让正常的 ping/超时链路优先生效；该 reaper 只兜底处理服务器重启后内存 Hub 丢失、
// 或 readPump 异常未走到 Unregister 等边缘情况。
const staleDeviceTimeout = 3 * time.Minute

// StartStaleDeviceReaper 定期把 agent_connected=true 但 last_seen_at 已过期、
// 且当前并无活跃 Hub 连接的设备标记为离线，并推送状态变更。在 main.go DB 就绪后启动。
func StartStaleDeviceReaper() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			reapStaleDevices()
		}
	}()
}

func reapStaleDevices() {
	cutoff := time.Now().Add(-staleDeviceTimeout)
	var devices []models.Device
	// last_seen_at 为空也视为过期（上线时会写入；为空说明从未真正心跳过）。
	err := database.DB.Where("agent_connected = ? AND (last_seen_at IS NULL OR last_seen_at < ?)", true, cutoff).
		Find(&devices).Error
	if err != nil {
		log.Printf("reapStaleDevices query failed: %v", err)
		return
	}
	for _, d := range devices {
		// 仍有活跃连接则跳过（避免误杀：心跳字段未及时刷新但连接仍在）。
		if AgentHub.LiveConnectionKeyForDeviceID(d.ID) != "" {
			continue
		}
		if err := database.DB.Model(&models.Device{}).Where("id = ?", d.ID).
			Updates(map[string]interface{}{
				"agent_connected": false,
				"status":          "offline",
			}).Error; err != nil {
			log.Printf("reapStaleDevices mark offline [%d] failed: %v", d.ID, err)
			continue
		}
		log.Printf("Device %d marked offline by stale reaper", d.ID)
		PublishDeviceProfileUpdated(d.ID)
	}
	if len(devices) > 0 {
		publishAgentConnectionChange()
	}
}

// persistAgentConnectionKey 在 Agent 上线时把当前 WebSocket 连接键写入 agent_token（若为空），
// 避免 ADB 预注册设备仅有 serial/android_serial 时无法向 Hub 下发命令。
func persistAgentConnectionKey(deviceKey string) {
	key := strings.TrimSpace(deviceKey)
	if key == "" {
		return
	}
	id, ok := resolveConnKeyToID(key)
	if !ok {
		return
	}
	var d models.Device
	if err := database.DB.First(&d, id).Error; err != nil {
		return
	}
	if strings.TrimSpace(d.AgentToken) == key {
		return
	}
	if err := database.DB.Model(&d).Update("agent_token", key).Error; err != nil {
		log.Printf("Failed to persist agent_token for device %d key=%s: %v", id, key, err)
	}
}

func normalizeAndroidSerial(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.EqualFold(s, "unknown") {
		return ""
	}
	return s
}

// ensureAgentDevice 保证 Agent 接入在库中有对应设备行。
// 若提供有效硬件串号 androidSerial，则以串号为唯一键：已存在同串号行则只更新 agent_token（重装 App / 换 Token），否则新建并写入串号。
// 若无串号，则仍按 agent_token 占位，待心跳上报串号后再收敛到唯一串号行。
func ensureAgentDevice(deviceKey, androidSerial string) error {
	key := strings.TrimSpace(deviceKey)
	if key == "" {
		return nil
	}
	sn := normalizeAndroidSerial(androidSerial)
	now := time.Now()

	if sn != "" {
		var existing models.Device
		err := database.DB.Where("android_serial = ?", sn).First(&existing).Error
		if err == nil && existing.ID > 0 {
			return database.DB.Model(&existing).Updates(map[string]interface{}{
				"agent_token":     key,
				"serial":          "agent-" + key,
				"agent_connected": true,
				"status":          "online",
				"last_seen_at":    now,
			}).Error
		}
		var byTok models.Device
		if err := database.DB.Where("agent_token = ?", key).First(&byTok).Error; err == nil {
			return database.DB.Model(&byTok).Updates(map[string]interface{}{
				"android_serial":  sn,
				"serial":          "agent-" + key,
				"agent_connected": true,
				"status":          "online",
				"last_seen_at":    now,
			}).Error
		}
		d := models.Device{
			Serial:        "agent-" + key,
			Name:          "Agent 设备",
			AgentToken:    key,
			AndroidSerial: sn,
			LastSeenAt:    &now,
			CreatedAt:     now,
		}
		return database.DB.Create(&d).Error
	}

	var d models.Device
	return database.DB.Where("agent_token = ?", key).FirstOrCreate(&d, models.Device{
		Serial:     "agent-" + key,
		Name:       "Agent 设备",
		AgentToken: key,
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
	dbID, haveID := ResolveConnDeviceID(deviceID)
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
	// 前台应用包名：只有明确传递了值时才更新（避免空值覆盖）
	if fg, ok := strFromInfo(info["foreground_package"]); ok && fg != "" {
		updates["foreground_package"] = fg
	}
	// X5 内核版本和状态
	if x5Version, ok := info["x5_kernel_version"].(float64); ok {
		updates["x5_kernel_version"] = int(x5Version)
	}
	if x5State, ok := strFromInfo(info["x5_kernel_state"]); ok && x5State != "" {
		updates["x5_kernel_state"] = x5State
	}
	if caps, ok := info["capabilities"].([]interface{}); ok {
		arr := make([]string, 0, len(caps))
		for _, c := range caps {
			if s, ok := c.(string); ok && strings.TrimSpace(s) != "" {
				arr = append(arr, strings.TrimSpace(s))
			}
		}
		if b, err := json.Marshal(arr); err == nil {
			updates["agent_capabilities_json"] = string(b)
		}
	}
	androidSerial := ""
	if as, ok := strFromInfo(info["android_serial"]); ok && as != "" && as != "unknown" {
		androidSerial = normalizeAndroidSerial(as)
		if androidSerial != "" {
			updates["android_serial"] = androidSerial
		}
	}

	if androidSerial != "" && haveID {
		var dup int64
		database.DB.Model(&models.Device{}).
			Where("android_serial = ? AND id <> ?", androidSerial, dbID).
			Count(&dup)
		if dup > 0 {
			log.Printf("HandleHeartbeat: android_serial %q already bound to another device; skip writing serial on device %d", androidSerial, dbID)
			delete(updates, "android_serial")
		}
	}

	result := DeviceScopeByConnKey(deviceID).Updates(updates)
	if result.Error != nil {
		log.Printf("HandleHeartbeat [%s]: %v", deviceID, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		// 传入 androidSerial，支持重装 App 后按物理设备合并记录
		if err := ensureAgentDevice(deviceID, androidSerial); err != nil {
			log.Printf("HandleHeartbeat ensureAgentDevice [%s]: %v", deviceID, err)
			return
		}
		if err := DeviceScopeByConnKey(deviceID).Updates(updates).Error; err != nil {
			log.Printf("HandleHeartbeat retry [%s]: %v", deviceID, err)
		}
	}

	profileChanged := false
	foregroundAppChanged := false
	if haveID {
		if v, ok := updates["agent_alias"].(string); ok && v != old.AgentAlias {
			profileChanged = true
		}
		if v, ok := updates["group_name"].(string); ok && v != old.GroupName {
			profileChanged = true
		}
		if v, ok := updates["foreground_package"].(string); ok && v != old.ForegroundPackage {
			foregroundAppChanged = true
		}
	}
	if profileChanged {
		PublishDeviceProfileUpdated(dbID)
	}
	if foregroundAppChanged {
		// 前台应用变化时推送到监控页面
		publishAgentConnectionChange()
	}
}

// publishAgentConnectionChange 推送 Agent 连接状态变化事件到 STOMP
func publishAgentConnectionChange() {
	// 查询当前在线设备数量
	var onlineCount int64
	database.DB.Model(&models.Device{}).Where("agent_connected = ?", true).Count(&onlineCount)

	// 查询在线设备列表（最多100个）
	var devices []models.Device
	database.DB.Where("agent_connected = ?", true).
		Order("last_seen_at DESC").
		Limit(100).
		Find(&devices)

	// 预加载所有 APK 应用的包名-名称映射
	var apps []models.App
	database.DB.Select("package_name, name").Find(&apps)
	appNameMap := make(map[string]string, len(apps))
	for _, app := range apps {
		if app.PackageName != "" {
			appNameMap[app.PackageName] = app.Name
		}
	}

	// 构建简化的设备信息列表（包含前台应用信息）
	agents := make([]map[string]interface{}, 0, len(devices))
	for _, d := range devices {
		agent := map[string]interface{}{
			"device_id":          d.ID,
			"conn_key":           "", // 填充后续可从 AgentHub 获取
			"name":               d.Name,
			"serial":             d.Serial,
			"android_serial":     d.AndroidSerial,
			"status":             d.Status,
			"last_seen_at":       d.LastSeenAt,
			"foreground_package": d.ForegroundPackage,
		}
		// 如果前台应用包名在 APK 管理中存在，填充应用名称
		if d.ForegroundPackage != "" {
			if appName, ok := appNameMap[d.ForegroundPackage]; ok {
				agent["foreground_app_name"] = appName
			}
		}
		agents = append(agents, agent)
	}

	payload := map[string]interface{}{
		"type":         "agent_connection_change",
		"online_count": onlineCount,
		"agents":       agents,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}

	if data, err := json.Marshal(payload); err == nil {
		stomp.DefaultHub.PublishJSON("/topic/monitor/agent-connections", string(data))
	}
}
