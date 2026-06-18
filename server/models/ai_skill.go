package models

import "time"

// AISkill 可复用的 AI 技能：集中管理给 Claude 的系统指令与可选字段片段。
// 在 form-app 的 AI Chat 中可勾选若干技能，其 SystemPrompt 会注入到 Claude system。
type AISkill struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Name             string    `gorm:"size:200;index" json:"name"`
	Description      string    `gorm:"type:text" json:"description"`
	Category         string    `gorm:"size:64;index" json:"category"`
	SystemPrompt     string    `gorm:"type:text" json:"system_prompt"`      // 注入 Claude system 的指令
	FieldSnippetJSON string    `gorm:"type:text" json:"field_snippet_json"` // 可选 FieldDef[] 片段/示例（JSON 字符串）
	Enabled          bool      `gorm:"default:true" json:"enabled"`
	SortOrder        int       `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (AISkill) TableName() string { return "ai_skills" }
