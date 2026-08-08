package models

import "time"

// MDMEnterprise 企业MDM授权标识。
// 一个平台可配置多个企业标识；设备关联企业后才能在该企业授权范围内使用 MDM 功能。
type MDMEnterprise struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:120;not null" json:"name"`
	Code        string `gorm:"size:64;uniqueIndex;not null" json:"code"` // 企业唯一标识码，由管理员自定义
	Description string `gorm:"type:text" json:"description"`

	// AllowedCapsJSON 该企业允许使用的 MDM 能力列表（JSON 字符串数组）。
	// 留空表示全部允许。示例：["ntp_write","set_system_time","password_policy"]
	AllowedCapsJSON string `gorm:"column:allowed_caps_json;type:text" json:"allowed_caps_json"`

	Enabled   bool      `gorm:"default:true" json:"enabled"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DeviceMDMConfig 设备级 MDM 配置与能力快照。
// 主键与 Device.ID 一对一；首次开启 MDM 时自动 upsert。
type DeviceMDMConfig struct {
	DeviceID     uint `gorm:"primaryKey" json:"device_id"`
	EnterpriseID uint `gorm:"default:0;index" json:"enterprise_id"` // 关联的 MDMEnterprise.ID，0 表示未关联

	// MDMEnabled 是否已开启 MDM 模式（服务端控制，下发给 Agent）
	MDMEnabled bool `gorm:"default:false" json:"mdm_enabled"`

	// ── Agent 上报字段（通过 get_mdm_status 命令写入）────────────────────
	// IsDeviceOwner Agent 是否持有 Device Owner 权限
	IsDeviceOwner bool `gorm:"default:false" json:"is_device_owner"`
	// HasWriteSecureSettings Agent 是否持有 WRITE_SECURE_SETTINGS 权限
	HasWriteSecureSettings bool `gorm:"default:false" json:"has_write_secure_settings"`

	// CapabilitiesJSON Agent 上报的完整能力 JSON（MdmCapabilities 序列化），供前端展示。
	// 例如: {"can_set_ntp":true,"can_set_system_time":false,...}
	CapabilitiesJSON string `gorm:"column:capabilities_json;type:text" json:"capabilities_json"`

	// ── NTP 配置缓存（最后一次从设备读取的值）────────────────────────────
	NTPServer  string `gorm:"column:ntp_server;size:255" json:"ntp_server"`
	NTPTimeout int64  `gorm:"column:ntp_timeout;default:5000" json:"ntp_timeout"` // 毫秒

	// LastSyncAt Agent 最后一次上报 MDM 状态的时间
	LastSyncAt *time.Time `json:"last_sync_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

func (DeviceMDMConfig) TableName() string {
	return "device_mdm_configs"
}
