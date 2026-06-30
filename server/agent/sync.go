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
	PublishAgentConnectionChange()

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
		PublishAgentConnectionChange()
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

	// 显式查找：优先按 serial，其次按 agent_token
	serial := "agent-" + key
	var existing models.Device

	// 先按 serial 查找
	err := database.DB.Where("serial = ?", serial).First(&existing).Error
	if err == nil && existing.ID > 0 {
		// 找到了，更新 agent_token 和时间戳
		return database.DB.Model(&existing).Updates(map[string]interface{}{
			"agent_token":  key,
			"last_seen_at": now,
		}).Error
	}

	// 再按 agent_token 查找
	err = database.DB.Where("agent_token = ?", key).First(&existing).Error
	if err == nil && existing.ID > 0 {
		// 找到了，更新 serial 和时间戳
		return database.DB.Model(&existing).Updates(map[string]interface{}{
			"serial":       serial,
			"last_seen_at": now,
		}).Error
	}

	// 都没找到，创建新记录
	d := models.Device{
		Serial:     serial,
		Name:       "Agent 设备",
		AgentToken: key,
		LastSeenAt: &now,
		CreatedAt:  now,
	}
	err = database.DB.Create(&d).Error
	if err != nil && strings.Contains(err.Error(), "Duplicate entry") {
		// 并发冲突：在我们检查和插入之间，另一个 goroutine 已创建了该设备
		// 此时设备已存在，静默返回成功（后续心跳会更新状态）
		return nil
	}
	return err
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

	now := time.Now()

	// 高频更新字段：写入实时状态表，避免频繁更新 Device 主表
	realtimeUpdates := map[string]interface{}{
		"last_seen_at":    now, // 仅在内存中记录，不写数据库
		"agent_connected": true,
		"status":          "online",
	}
	if battery, ok := info["battery"].(float64); ok {
		realtimeUpdates["battery"] = int(battery)
	}
	if cpu, ok := info["cpu_usage"].(float64); ok {
		realtimeUpdates["cpu_usage"] = cpu
	}
	if memUsed, ok := info["memory_used"].(float64); ok {
		realtimeUpdates["memory_used"] = int64(memUsed)
	}
	if stUsed, ok := info["storage_used"].(float64); ok {
		realtimeUpdates["storage_used"] = int64(stUsed)
	}
	if wifiSignal, ok := info["wifi_signal"].(float64); ok {
		realtimeUpdates["wifi_signal"] = int(wifiSignal)
	}
	if wifiSpeed, ok := info["wifi_speed"].(float64); ok {
		realtimeUpdates["wifi_speed"] = int(wifiSpeed)
	}
	if fg, ok := strFromInfo(info["foreground_package"]); ok && fg != "" {
		realtimeUpdates["foreground_package"] = fg
	}

	// 低频/静态字段：仅在变化时更新 Device 主表
	updates := map[string]interface{}{}
	if memTotal, ok := info["memory_total"].(float64); ok {
		mt := int64(memTotal)
		updates["memory_total"] = mt
		// Web 设备详情「内存」列与 ADB 入库字段 total_memory 对齐
		updates["total_memory"] = mt
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
	if wv, ok := strFromInfo(info["webview_version"]); ok && wv != "" {
		updates["webview_version"] = wv
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

	// 更新实时状态到内存缓存（高频字段，异步批量写入数据库）
	if haveID {
		UpdateRealtimeStatus(dbID, realtimeUpdates)
	}

	// 只在低频字段有变化时才更新 Device 主表
	if len(updates) > 0 {
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
	} else if !haveID {
		// 没有低频字段更新但设备不存在时，仍需自动注册
		if err := ensureAgentDevice(deviceID, androidSerial); err != nil {
			log.Printf("HandleHeartbeat ensureAgentDevice [%s]: %v", deviceID, err)
			return
		}
	}

	profileChanged := false
	foregroundAppChanged := false
	agentVersionChanged := false
	if haveID {
		if v, ok := updates["agent_alias"].(string); ok && v != old.AgentAlias {
			profileChanged = true
		}
		if v, ok := updates["group_name"].(string); ok && v != old.GroupName {
			profileChanged = true
		}
		if v, ok := updates["agent_version"].(string); ok && v != old.AgentVersion {
			agentVersionChanged = true
		}
		if v, ok := realtimeUpdates["foreground_package"].(string); ok && v != old.ForegroundPackage {
			foregroundAppChanged = true
		}
	}
	if profileChanged {
		PublishDeviceProfileUpdated(dbID)
	}
	if foregroundAppChanged || agentVersionChanged {
		// 前台应用变化或 Agent 版本变化时推送到监控页面
		PublishAgentConnectionChange()
	}
}

// PublishAgentConnectionChange 推送 Agent 连接状态变化事件到 STOMP
func PublishAgentConnectionChange() {
	keys := AgentHub.ConnectedDeviceIDs()

	// 预加载所有 APK 应用的包名-名称映射
	var apps []models.App
	database.DB.Select("package_name, name").Find(&apps)
	appNameMap := make(map[string]string, len(apps))
	for _, app := range apps {
		if app.PackageName != "" {
			appNameMap[app.PackageName] = app.Name
		}
	}

	// 构建设备信息列表
	agents := make([]map[string]interface{}, 0, len(keys))
	for _, k := range keys {
		if d, ok := LookupDeviceByConnectionKey(k); ok {
			agent := map[string]interface{}{
				"device_id":          d.ID,
				"conn_key":           k,
				"name":               d.Name,
				"serial":             d.Serial,
				"android_serial":     d.AndroidSerial,
				"os_version":         d.OSVersion,
				"status":             d.Status,
				"last_seen_at":       d.LastSeenAt,
				"foreground_package": d.ForegroundPackage,
				"agent_version":      d.AgentVersion,
				"webview_version":    d.WebViewVersion,
				"x5_kernel_version":  d.X5KernelVersion,
				"x5_kernel_state":    d.X5KernelState,
			}
			// 如果前台应用包名在 APK 管理中存在，填充应用名称
			if d.ForegroundPackage != "" {
				if appName, ok := appNameMap[d.ForegroundPackage]; ok {
					agent["foreground_app_name"] = appName
				}
			}
			// 计算在线时长（从连接时间到现在）
			if connTime, ok := AgentHub.GetConnectionTime(k); ok {
				agent["online_duration"] = int64(time.Since(connTime).Seconds())
			}
			agents = append(agents, agent)
		}
	}

	payload := map[string]interface{}{
		"type":         "agent_connection_change",
		"online_count": len(keys),
		"agents":       agents,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}

	if data, err := json.Marshal(payload); err == nil {
		stomp.DefaultHub.PublishJSON("/topic/monitor/agent-connections", string(data))
	}
}
