package models

import "time"

// ScadaCustomizeComponent 自定义库图元（图片/SVG 等），对齐 dbscada customize 组件
type ScadaCustomizeComponent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:200" json:"name"`
	Code      string    `gorm:"uniqueIndex;size:100" json:"code"`
	Type      string    `gorm:"size:32;default:image" json:"type"` // image | svg
	FilePath  string    `gorm:"size:500" json:"file_path"`         // 相对 storage 路径
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
