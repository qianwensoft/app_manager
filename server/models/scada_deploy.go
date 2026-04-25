package models

import "time"

// ScadaDeployRule 组态下发规则
// TargetType: "device" | "device_group" | "department" | "position" | "user"
// DeployMode: "webview" (AgentMenuItem) | "apk" (独立APK安装)
type ScadaDeployRule struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ScadaID    uint      `gorm:"index;not null" json:"scada_id"`
	Name       string    `gorm:"size:100" json:"name"`
	TargetType string    `gorm:"size:32;not null" json:"target_type"`
	TargetIDs  string    `gorm:"type:text" json:"target_ids"` // JSON array of IDs
	DeployMode string    `gorm:"size:16;default:'webview'" json:"deploy_mode"`
	AutoDeploy bool      `json:"auto_deploy"` // publish时自动触发
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ScadaDeployRecord 下发记录
type ScadaDeployRecord struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	RuleID     uint      `gorm:"index" json:"rule_id"`
	ScadaID    uint      `gorm:"index" json:"scada_id"`
	DeviceID   uint      `gorm:"index" json:"device_id"`
	Status     string    `gorm:"size:16;default:'pending'" json:"status"` // pending | success | failed
	Error      string    `gorm:"type:text" json:"error,omitempty"`
	DeployedAt *time.Time `json:"deployed_at,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// ScadaAccessPolicy 组态访问权限策略（设备权限 + 限时权限）
type ScadaAccessPolicy struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	ScadaID     uint       `gorm:"index;not null" json:"scada_id"`
	TargetType  string     `gorm:"size:32;not null" json:"target_type"` // device | user | department | position
	TargetID    uint       `json:"target_id"`
	ExpireAt    *time.Time `json:"expire_at,omitempty"` // nil = 永不过期
	ExpireURL   string     `gorm:"size:512" json:"expire_url"` // 过期后跳转页面
	Enabled     bool       `gorm:"default:true" json:"enabled"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
