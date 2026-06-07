package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type deviceListenBrief struct {
	ID               uint   `json:"id"`
	Name             string `json:"name"`
	Serial           string `json:"serial"`
	AgentConnected   bool   `json:"agent_connected"`
	AgentToken       string `json:"agent_token,omitempty"`
	GroupName        string `json:"group_name"`
	AgentAlias       string `json:"agent_alias"`
	ServerAlias      string `json:"server_alias"`
}

type customListenStateOut struct {
	DeviceID         uint              `json:"device_id"`
	Active           bool              `json:"active"`
	UpdatedAt        time.Time         `json:"updated_at"`
	DefinitionIDs    []uint            `json:"definition_ids"`
	EventKeys        []string          `json:"event_keys"`
	DefinitionNames  []string          `json:"definition_names"`
	Device           *deviceListenBrief `json:"device,omitempty"`
}

func persistListenStateAfterStart(defs []models.CustomEventDefinition, results []customEventListenResult) {
	if len(defs) == 0 {
		return
	}
	ids := make([]uint, len(defs))
	keys := make([]string, len(defs))
	names := make([]string, len(defs))
	for i, d := range defs {
		ids[i] = d.ID
		keys[i] = d.Key
		names[i] = d.Name
	}
	idJSON, err := models.MarshalUintSliceJSON(ids)
	if err != nil {
		return
	}
	keyJSON, err := models.MarshalStringSliceJSON(keys)
	if err != nil {
		return
	}
	nameJSON, err := models.MarshalStringSliceJSON(names)
	if err != nil {
		return
	}
	now := time.Now()
	for _, r := range results {
		if !r.OK {
			continue
		}
		var st models.DeviceCustomListenState
		err := database.DB.Where("device_id = ?", r.DeviceID).First(&st).Error
		if err != nil {
			st = models.DeviceCustomListenState{DeviceID: r.DeviceID}
		}
		st.Active = true
		st.DefinitionIDsJSON = idJSON
		st.EventKeysJSON = keyJSON
		st.DefinitionNamesJSON = nameJSON
		st.UpdatedAt = now
		if st.ID == 0 {
			_ = database.DB.Create(&st).Error
		} else {
			_ = database.DB.Save(&st).Error
		}
	}
}

func persistListenStateAfterStop(results []customEventListenResult) {
	// 凡在 Web 端请求停止的设备，一律将库中快照标为未激活（Agent 离线时无法下发 WS，仍应反映用户意图）
	now := time.Now()
	for _, r := range results {
		database.DB.Model(&models.DeviceCustomListenState{}).
			Where("device_id = ?", r.DeviceID).
			Updates(map[string]interface{}{
				"active":     false,
				"updated_at": now,
			})
	}
}

// DeactivateDeviceCustomListenStateForAgentKey 将库中监听标为未激活（仅 Web/Agent 显式暂停或删除时调用；断线重连不再调用，以便自动恢复）。
func DeactivateDeviceCustomListenStateForAgentKey(agentKey string) {
	devID, ok := agent.ResolveDeviceID(agentKey)
	if !ok {
		return
	}
	now := time.Now()
	database.DB.Model(&models.DeviceCustomListenState{}).
		Where("device_id = ? AND active = ?", devID, true).
		Updates(map[string]interface{}{
			"active":     false,
			"updated_at": now,
		})
}

// ListCustomEventListenState GET /api/custom-events/listen-state
func ListCustomEventListenState(c *gin.Context) {
	q := database.DB.Model(&models.DeviceCustomListenState{})
	if c.Query("include_inactive") != "1" && c.Query("include_inactive") != "true" {
		q = q.Where("active = ?", true)
	}
	if did := strings.TrimSpace(c.Query("device_id")); did != "" {
		q = q.Where("device_id = ?", did)
	}
	var rows []models.DeviceCustomListenState
	if err := q.Order("updated_at DESC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	eventKeyFilter := strings.TrimSpace(c.Query("event_key"))
	out := make([]customListenStateOut, 0, len(rows))
	deviceIDs := make([]uint, 0, len(rows))
	for _, row := range rows {
		keys := row.EventKeys()
		if eventKeyFilter != "" {
			found := false
			for _, k := range keys {
				if k == eventKeyFilter {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		deviceIDs = append(deviceIDs, row.DeviceID)
		out = append(out, customListenStateOut{
			DeviceID:        row.DeviceID,
			Active:          row.Active,
			UpdatedAt:       row.UpdatedAt,
			DefinitionIDs:   row.DefinitionIDs(),
			EventKeys:       keys,
			DefinitionNames: row.DefinitionNames(),
		})
	}

	devMap := loadDeviceBriefMap(deviceIDs)
	for i := range out {
		if b, ok := devMap[out[i].DeviceID]; ok {
			out[i].Device = &b
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": out})
}

func loadDeviceBriefMap(ids []uint) map[uint]deviceListenBrief {
	m := make(map[uint]deviceListenBrief)
	if len(ids) == 0 {
		return m
	}
	uniq := make(map[uint]struct{})
	var list []uint
	for _, id := range ids {
		if _, ok := uniq[id]; ok {
			continue
		}
		uniq[id] = struct{}{}
		list = append(list, id)
	}
	var devs []models.Device
	database.DB.Where("id IN ?", list).Find(&devs)
	for _, d := range devs {
		m[d.ID] = deviceListenBrief{
			ID:             d.ID,
			Name:           strings.TrimSpace(d.Name),
			Serial:         strings.TrimSpace(d.Serial),
			AgentConnected: d.AgentConnected,
			AgentToken:     strings.TrimSpace(d.AgentToken),
			GroupName:      strings.TrimSpace(d.GroupName),
			AgentAlias:     strings.TrimSpace(d.AgentAlias),
			ServerAlias:    strings.TrimSpace(d.ServerAlias),
		}
	}
	return m
}

// ListenStateAggregates GET /api/custom-events/listen-state/aggregates 供前端「按事件 / 按设备」视图。
func ListenStateAggregates(c *gin.Context) {
	var rows []models.DeviceCustomListenState
	if err := database.DB.Where("active = ?", true).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	deviceIDs := make([]uint, 0, len(rows))
	for _, r := range rows {
		deviceIDs = append(deviceIDs, r.DeviceID)
	}
	devMap := loadDeviceBriefMap(deviceIDs)

	type deviceAgg struct {
		Device    deviceListenBrief `json:"device"`
		EventKeys []string          `json:"event_keys"`
		UpdatedAt time.Time         `json:"updated_at"`
	}

	byEvent := make(map[string][]deviceListenBrief)

	for _, st := range rows {
		brief, ok := devMap[st.DeviceID]
		if !ok {
			brief = deviceListenBrief{ID: st.DeviceID}
		}
		keys := st.EventKeys()
		for _, ek := range keys {
			if ek == "" {
				continue
			}
			byEvent[ek] = append(byEvent[ek], brief)
		}
	}

	byEventList := make([]gin.H, 0, len(byEvent))
	for k, devs := range byEvent {
		sort.Slice(devs, func(i, j int) bool { return devs[i].ID < devs[j].ID })
		byEventList = append(byEventList, gin.H{
			"event_key": k,
			"devices":   devs,
			"count":     len(devs),
		})
	}
	sort.Slice(byEventList, func(i, j int) bool {
		return byEventList[i]["event_key"].(string) < byEventList[j]["event_key"].(string)
	})

	byDeviceList := make([]deviceAgg, 0, len(rows))
	for _, st := range rows {
		brief, ok := devMap[st.DeviceID]
		if !ok {
			brief = deviceListenBrief{ID: st.DeviceID}
		}
		kk := append([]string(nil), st.EventKeys()...)
		sort.Strings(kk)
		byDeviceList = append(byDeviceList, deviceAgg{
			Device:    brief,
			EventKeys: kk,
			UpdatedAt: st.UpdatedAt,
		})
	}
	sort.Slice(byDeviceList, func(i, j int) bool {
		return byDeviceList[i].Device.ID < byDeviceList[j].Device.ID
	})

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"by_event":  byEventList,
			"by_device": byDeviceList,
		},
	})
}

// DeleteDeviceCustomListenState DELETE /api/custom-events/listen-state/device/:device_id
// 尽力向 Agent 下发 stop_custom_event_listen，并删除该设备的监听快照行（Web 端「删除」）。
func DeleteDeviceCustomListenState(c *gin.Context) {
	idStr := strings.TrimSpace(c.Param("device_id"))
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device_id"})
		return
	}
	deviceID := uint(id64)
	results := dispatchCustomEventListen([]uint{deviceID}, "stop_custom_event_listen", nil)
	persistListenStateAfterStop(results)
	if err := database.DB.Where("device_id = ?", deviceID).Delete(&models.DeviceCustomListenState{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	agentOK := len(results) > 0 && results[0].OK
	c.JSON(http.StatusOK, gin.H{"ok": true, "agent_notified": agentOK})
}
