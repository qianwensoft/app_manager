package models

import "time"

// AgentMenuItem Agent 侧菜单项（组态入口等）
type AgentMenuItem struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Title              string    `gorm:"size:200" json:"title"`
	Icon               string    `gorm:"size:500" json:"icon"`
	TargetType         string    `gorm:"size:32" json:"target_type"` // scada_preview, webview_url
	TargetRef          string    `gorm:"size:200" json:"target_ref"` // scada_code 或 URL
	ShowOnAgentHome    bool      `gorm:"default:true" json:"show_on_agent_home"`
	IntentAction       string    `gorm:"size:200;index" json:"intent_action"`
	DefaultExtrasJSON  string    `gorm:"type:text" json:"default_extras_json"`
	SortOrder          int       `gorm:"default:0" json:"sort_order"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// AgentMenuAssignment 菜单项与设备绑定
type AgentMenuAssignment struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	MenuID    uint      `gorm:"uniqueIndex:idx_menu_device;index" json:"menu_id"`
	DeviceID  uint      `gorm:"uniqueIndex:idx_menu_device;index" json:"device_id"`
	CreatedAt time.Time `json:"created_at"`
}
