package models

import "time"

// FormPageSnapshot 表单页面字段快照：AI 编辑每次保存/回滚时记录，支持回滚到任意历史节点。
type FormPageSnapshot struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	PageID       uint      `gorm:"index" json:"page_id"`
	FormAppID    uint      `gorm:"index" json:"form_app_id"`
	ConfigJSON   string    `gorm:"type:text" json:"config_json"`
	DesignSchema string    `gorm:"type:longtext" json:"design_schema"`
	Source       string    `gorm:"size:500" json:"source"` // 触发指令/来源说明
	Kind         string    `gorm:"size:32" json:"kind"`    // ai_save | rollback | manual
	CreatedAt    time.Time `json:"created_at"`
}

func (FormPageSnapshot) TableName() string { return "form_page_snapshots" }
