package api

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

type outboundDeviceStateRow struct {
	DeviceID  uint               `json:"device_id"`
	Paused    bool               `json:"paused"`
	Excluded  bool               `json:"excluded"`
	Status    string             `json:"status"` // active | paused | excluded
	UpdatedAt time.Time          `json:"updated_at"`
	Device    *deviceListenBrief `json:"device,omitempty"`
}

func outboundDeviceStatus(paused, excluded bool) string {
	if excluded {
		return "excluded"
	}
	if paused {
		return "paused"
	}
	return "active"
}

func upsertOutboundDeviceState(deviceID, connectorID uint, paused, excluded bool) error {
	now := time.Now()
	st := models.DeviceOutboundConnectorState{
		DeviceID:    deviceID,
		ConnectorID: connectorID,
		Paused:      paused,
		Excluded:    excluded,
		UpdatedAt:   now,
	}
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "device_id"}, {Name: "connector_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"paused", "excluded", "updated_at"}),
	}).Create(&st).Error
}

func clearOutboundDeviceState(deviceID, connectorID uint) error {
	return database.DB.Where("connector_id = ? AND device_id = ?", connectorID, deviceID).
		Delete(&models.DeviceOutboundConnectorState{}).Error
}

// GetOutboundConnectorDeviceStates GET /api/outbound/connectors/:id/device-states
func GetOutboundConnectorDeviceStates(c *gin.Context) {
	cid, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil || cid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid connector id"})
		return
	}
	var co models.OutboundConnector
	if err := database.DB.First(&co, uint(cid)).Error; err != nil {
		// 与「路由不存在」区分：响应体为 JSON，便于前端与 Network 面板排查
		c.JSON(http.StatusNotFound, gin.H{"error": "connector_not_found", "message": "出站连接器不存在或 ID 无效"})
		return
	}

	var scopeIDs []uint
	database.DB.Model(&models.OutboundConnectorDevice{}).Where("connector_id = ?", co.ID).Pluck("device_id", &scopeIDs)

	var stateRows []models.DeviceOutboundConnectorState
	if err := database.DB.Where("connector_id = ?", co.ID).Find(&stateRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	stateByDev := make(map[uint]models.DeviceOutboundConnectorState, len(stateRows))
	for _, r := range stateRows {
		stateByDev[r.DeviceID] = r
	}

	deviceIDs := make([]uint, 0)
	if len(scopeIDs) > 0 {
		deviceIDs = append(deviceIDs, scopeIDs...)
	} else {
		for did := range stateByDev {
			deviceIDs = append(deviceIDs, did)
		}
	}

	out := make([]outboundDeviceStateRow, 0, len(deviceIDs))
	for _, did := range deviceIDs {
		st, hasSt := stateByDev[did]
		paused := hasSt && st.Paused && !st.Excluded
		excluded := hasSt && st.Excluded
		row := outboundDeviceStateRow{
			DeviceID: did,
			Paused:   paused,
			Excluded: excluded,
			Status:   outboundDeviceStatus(paused, excluded),
		}
		if hasSt {
			row.UpdatedAt = st.UpdatedAt
		}
		out = append(out, row)
	}
	devMap := loadDeviceBriefMap(deviceIDs)
	for i := range out {
		if b, ok := devMap[out[i].DeviceID]; ok {
			out[i].Device = &b
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": out, "connector_id": co.ID, "scoped": len(scopeIDs) > 0})
}

func parseUintParam(c *gin.Context, name string) (uint, bool) {
	v, err := strconv.ParseUint(c.Param(name), 10, 32)
	if err != nil || v == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + name})
		return 0, false
	}
	return uint(v), true
}

// PostOutboundConnectorDevicePause POST /api/outbound/connectors/:id/devices/:device_id/pause
func PostOutboundConnectorDevicePause(c *gin.Context) {
	cid, ok1 := parseUintParam(c, "id")
	did, ok2 := parseUintParam(c, "device_id")
	if !ok1 || !ok2 {
		return
	}
	if err := assertConnectorAndDeviceScope(cid, did); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := upsertOutboundDeviceState(did, cid, true, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PostOutboundConnectorDeviceEnable POST /api/outbound/connectors/:id/devices/:device_id/enable
func PostOutboundConnectorDeviceEnable(c *gin.Context) {
	cid, ok1 := parseUintParam(c, "id")
	did, ok2 := parseUintParam(c, "device_id")
	if !ok1 || !ok2 {
		return
	}
	if err := assertConnectorExists(cid); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if err := clearOutboundDeviceState(did, cid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PostOutboundConnectorDeviceExclude POST /api/outbound/connectors/:id/devices/:device_id/exclude
// 「删除」：排除该设备对此连接器的出站，直至再次「启用」清除状态行。
func PostOutboundConnectorDeviceExclude(c *gin.Context) {
	cid, ok1 := parseUintParam(c, "id")
	did, ok2 := parseUintParam(c, "device_id")
	if !ok1 || !ok2 {
		return
	}
	if err := assertConnectorAndDeviceScope(cid, did); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := upsertOutboundDeviceState(did, cid, false, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func assertConnectorExists(connectorID uint) error {
	var n int64
	database.DB.Model(&models.OutboundConnector{}).Where("id = ?", connectorID).Count(&n)
	if n == 0 {
		return errors.New("connector not found")
	}
	return nil
}

func assertConnectorAndDeviceScope(connectorID, deviceID uint) error {
	if err := assertConnectorExists(connectorID); err != nil {
		return err
	}
	var n int64
	database.DB.Model(&models.Device{}).Where("id = ?", deviceID).Count(&n)
	if n == 0 {
		return errors.New("device not found")
	}
	if !outbound.DeviceInConnectorScope(database.DB, connectorID, deviceID) {
		return fmt.Errorf("device %d is not in scope for connector %d", deviceID, connectorID)
	}
	return nil
}

// AgentOutboundConnectorPause POST /api/agent/outbound-connectors/:id/pause
func AgentOutboundConnectorPause(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	cid, ok1 := parseUintParam(c, "id")
	if !ok1 {
		return
	}
	if err := assertConnectorAndDeviceScope(cid, dev.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := upsertOutboundDeviceState(dev.ID, cid, true, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AgentOutboundConnectorEnable POST /api/agent/outbound-connectors/:id/enable
func AgentOutboundConnectorEnable(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	cid, ok1 := parseUintParam(c, "id")
	if !ok1 {
		return
	}
	if err := assertConnectorExists(cid); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !outbound.DeviceInConnectorScope(database.DB, cid, dev.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device not in scope for this connector"})
		return
	}
	if err := clearOutboundDeviceState(dev.ID, cid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AgentOutboundConnectorExclude POST /api/agent/outbound-connectors/:id/exclude
func AgentOutboundConnectorExclude(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	cid, ok1 := parseUintParam(c, "id")
	if !ok1 {
		return
	}
	if err := assertConnectorAndDeviceScope(cid, dev.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := upsertOutboundDeviceState(dev.ID, cid, false, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
