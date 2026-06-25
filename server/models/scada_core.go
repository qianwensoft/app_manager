package models

import "time"

// ScadaGroup 组态分组
type ScadaGroup struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ParentID    *uint     `gorm:"index" json:"parent_id"`
	Name        string    `gorm:"size:200" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ScadaInfo 组态画布元数据
type ScadaInfo struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	GroupID         *uint      `gorm:"index" json:"group_id"`
	ScadaName       string     `gorm:"size:200" json:"scada_name"`
	ScadaCode       string     `gorm:"uniqueIndex;size:100" json:"scada_code"`
	Description     string     `gorm:"type:text" json:"description"`
	CanvasData      string     `gorm:"type:text" json:"canvas_data"`
	PreviewImage    string     `gorm:"type:text" json:"preview_image"`
	PublishStatus   int        `gorm:"default:0" json:"publish_status"` // 0 未发布 1 已发布
	ShareToken      string     `gorm:"size:64;index" json:"share_token,omitempty"`
	ShareExpireTime *time.Time `json:"share_expire_time,omitempty"`
	ContentVersion  int64      `gorm:"default:0" json:"content_version"` // 发布/画布变更递增，供 Agent 缓存
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}
