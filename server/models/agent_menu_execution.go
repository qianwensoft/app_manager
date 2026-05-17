package models

import "time"

type AgentMenuExecutionLog struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	DeviceID       uint      `gorm:"index" json:"device_id"`
	IntentAction   string    `gorm:"size:200;index" json:"intent_action"`
	EventType      string    `gorm:"size:64;index" json:"event_type"`
	ScanValue      string    `gorm:"size:512" json:"scan_value"`
	MatchedRule    string    `gorm:"size:200" json:"matched_rule"`
	TargetURL      string    `gorm:"type:text" json:"target_url"`
	Status         string    `gorm:"size:32;index" json:"status"` // success | fail
	ErrorMessage   string    `gorm:"type:text" json:"error_message"`
	BundleRevision uint      `gorm:"default:0;index" json:"bundle_revision"`
	CreatedAt      time.Time `json:"created_at"`
}
