package models

import (
	"encoding/json"
	"strings"
	"time"
)

// CustomEventGroup 自定义事件分组（仓库 / 产线 / 场景等）。
type CustomEventGroup struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	MQTTEnabled bool      `gorm:"default:false" json:"mqtt_enabled"`
	MQTTTopic   string    `gorm:"size:200" json:"mqtt_topic"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CustomEventDefinition 单条 Intent 输出映射：广播动作 + Extra 键顺序尝试 → 上报 event_type（Key）。
type CustomEventDefinition struct {
	ID                   uint             `gorm:"primaryKey" json:"id"`
	GroupID              uint             `gorm:"index;not null" json:"group_id"`
	Group                CustomEventGroup `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	Key                  string           `gorm:"size:80;uniqueIndex;not null" json:"key"`
	Name                 string           `gorm:"size:120;not null" json:"name"`
	Description          string           `gorm:"type:text" json:"description"`
	Enabled              bool             `gorm:"default:true" json:"enabled"`
	MQTTEnabled          bool             `gorm:"default:false" json:"mqtt_enabled"`
	MQTTTopic            string           `gorm:"size:200" json:"mqtt_topic"`
	BroadcastActionsJSON string           `gorm:"column:broadcast_actions_json;type:text" json:"-"`
	ExtraKeysJSON        string           `gorm:"column:extra_keys_json;type:text" json:"-"`
	CreatedAt            time.Time        `json:"created_at"`
	UpdatedAt            time.Time        `json:"updated_at"`
}

// BroadcastActions 供 API 序列化。
func (d *CustomEventDefinition) BroadcastActions() []string {
	return parseStringSliceJSON(d.BroadcastActionsJSON)
}

// ExtraKeys 供 API 序列化（按顺序依次尝试取值）。
func (d *CustomEventDefinition) ExtraKeys() []string {
	return parseStringSliceJSON(d.ExtraKeysJSON)
}

func parseStringSliceJSON(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	trimmed := make([]string, 0, len(out))
	for _, s := range out {
		s = strings.TrimSpace(s)
		if s != "" {
			trimmed = append(trimmed, s)
		}
	}
	return trimmed
}

func MarshalStringSliceJSON(a []string) (string, error) {
	if len(a) == 0 {
		return "[]", nil
	}
	b, err := json.Marshal(a)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// MarshalUintSliceJSON 将定义 ID 列表存库。
func MarshalUintSliceJSON(a []uint) (string, error) {
	if len(a) == 0 {
		return "[]", nil
	}
	b, err := json.Marshal(a)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func parseUintSliceJSON(raw string) []uint {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []uint
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}

// DeviceCustomListenState 记录已向 Agent 下发的自定义事件监听快照（每台设备一行）。
type DeviceCustomListenState struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	DeviceID            uint      `gorm:"uniqueIndex;not null" json:"device_id"`
	Active              bool      `gorm:"default:false;index" json:"active"`
	DefinitionIDsJSON   string    `gorm:"column:definition_ids_json;type:text" json:"-"`
	EventKeysJSON       string    `gorm:"column:event_keys_json;type:text" json:"-"`
	DefinitionNamesJSON string    `gorm:"column:definition_names_json;type:text" json:"-"`
	UpdatedAt           time.Time `json:"updated_at"`
}

func (s *DeviceCustomListenState) DefinitionIDs() []uint {
	return parseUintSliceJSON(s.DefinitionIDsJSON)
}

func (s *DeviceCustomListenState) EventKeys() []string {
	return parseStringSliceJSON(s.EventKeysJSON)
}

func (s *DeviceCustomListenState) DefinitionNames() []string {
	return parseStringSliceJSON(s.DefinitionNamesJSON)
}
