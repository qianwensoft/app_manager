package models

import "time"

// AgentMenuItem Agent 侧菜单项（组态入口等）
type AgentMenuItem struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	Title             string    `gorm:"size:200" json:"title"`
	Icon              string    `gorm:"size:500" json:"icon"`
	TargetType        string    `gorm:"size:32" json:"target_type"` // scada_preview, webview_url, form_app, form_app_preview, form_app_scan_entry, form_app_entry
	TargetRef         string    `gorm:"size:200" json:"target_ref"` // scada_code 或 URL 或 form_app_code
	FormAppCode       string    `gorm:"size:64" json:"form_app_code"`
	FormAppPageKey    string    `gorm:"size:64" json:"form_app_page_key"`
	ShowOnAgentHome   bool      `gorm:"default:true" json:"show_on_agent_home"`
	IntentAction      string    `gorm:"size:200;index" json:"intent_action"`
	DefaultExtrasJSON string    `gorm:"type:text" json:"default_extras_json"`
	ScanConfigJSON    string    `gorm:"type:text" json:"scan_config_json"`
	OpenMode          string    `gorm:"size:16;default:'replace'" json:"open_mode"` // replace | new
	MinAgentVersion   string    `gorm:"size:32;default:''" json:"min_agent_version"`
	RequiredCapsJSON  string    `gorm:"type:text" json:"required_caps_json"`
	SortOrder         int       `gorm:"default:0" json:"sort_order"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// AgentMenuAssignment 菜单项与设备绑定
type AgentMenuAssignment struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	MenuID    uint      `gorm:"uniqueIndex:idx_menu_device;index" json:"menu_id"`
	DeviceID  uint      `gorm:"uniqueIndex:idx_menu_device;index" json:"device_id"`
	CreatedAt time.Time `json:"created_at"`
}
