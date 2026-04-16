package outbound

import (
	"app-manager/models"

	"gorm.io/gorm"
)

// DeviceInConnectorScope 连接器未绑定具体设备时为 true；否则仅列表内设备为 true。
func DeviceInConnectorScope(db *gorm.DB, connectorID uint, deviceID uint) bool {
	var n int64
	db.Model(&models.OutboundConnectorDevice{}).Where("connector_id = ?", connectorID).Count(&n)
	if n == 0 {
		return true
	}
	var m int64
	db.Model(&models.OutboundConnectorDevice{}).Where("connector_id = ? AND device_id = ?", connectorID, deviceID).Count(&m)
	return m > 0
}

// ConnectorDeviceExcluded 本设备被标记为排除后，不再参与该连接器出站。
func ConnectorDeviceExcluded(db *gorm.DB, connectorID, deviceID uint) bool {
	var st models.DeviceOutboundConnectorState
	if err := db.Where("connector_id = ? AND device_id = ?", connectorID, deviceID).First(&st).Error; err != nil {
		return false
	}
	return st.Excluded
}

// ConnectorAppliesToDevice 在范围内且未被排除时可投递。
func ConnectorAppliesToDevice(db *gorm.DB, connectorID uint, deviceID uint) bool {
	if ConnectorDeviceExcluded(db, connectorID, deviceID) {
		return false
	}
	return DeviceInConnectorScope(db, connectorID, deviceID)
}

// DeviceOutboundConnectorPaused 暂停时仍「在范围内」，但 processDeviceEvent 会跳过执行。
func DeviceOutboundConnectorPaused(db *gorm.DB, connectorID, deviceID uint) bool {
	var st models.DeviceOutboundConnectorState
	if err := db.Where("connector_id = ? AND device_id = ?", connectorID, deviceID).First(&st).Error; err != nil {
		return false
	}
	return st.Paused && !st.Excluded
}
