package models

import "time"

// ScadaSimPoint 模拟点位（按组态维度）
type ScadaSimPoint struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ScadaCode  string    `gorm:"size:100;index:idx_scada_link,unique" json:"scada_code"`
	LinkName   string    `gorm:"size:200;index:idx_scada_link,unique" json:"link_name"`
	Enabled    bool      `gorm:"default:true" json:"enabled"`
	Mode       string    `gorm:"size:32" json:"mode"` // random, random_walk, sine, ramp, constant
	IntervalMs int       `gorm:"default:1000" json:"interval_ms"`
	ParamsJSON string    `gorm:"type:text" json:"params_json"` // JSON: min,max,step,amplitude,period,...
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
