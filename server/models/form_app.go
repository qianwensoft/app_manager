package models

import "time"

// FormAppInfo 表单应用元数据
type FormAppInfo struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Code           string     `gorm:"uniqueIndex;size:100" json:"code"`
	Name           string     `gorm:"size:200" json:"name"`
	DataSourceID   *uint      `gorm:"index" json:"data_source_id"`
	Mode           string     `gorm:"size:16;default:'form'" json:"mode"` // form | wizard | survey
	Description    string     `gorm:"type:text" json:"description"`
	EntryPageKey   string     `gorm:"size:64;default:'form'" json:"entry_page_key"`
	GlobalConfig   string     `gorm:"type:text" json:"global_config"`
	DesignSchema   string     `gorm:"type:longtext" json:"design_schema,omitempty"`  // deprecated, use FormAppPage
	RuntimeSchema  string     `gorm:"type:longtext" json:"runtime_schema,omitempty"` // deprecated, use FormAppPage
	UISchema       string     `gorm:"type:longtext" json:"ui_schema,omitempty"`      // deprecated, use FormAppPage
	PublishStatus  int        `gorm:"default:0" json:"publish_status"`               // 0 未发布 1 已发布
	ShareToken     string     `gorm:"size:64;index" json:"share_token,omitempty"`
	ShareExpireAt  *time.Time `json:"share_expire_at,omitempty"`
	ContentVersion int64      `gorm:"default:0" json:"content_version"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type FormAppPage struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	FormAppID     uint      `gorm:"index" json:"form_app_id"`
	PageKey       string    `gorm:"size:64;index:idx_form_app_page,priority:2" json:"page_key"`
	PageType      string    `gorm:"size:32" json:"page_type"` // form | list | detail | custom
	Title         string    `gorm:"size:200" json:"title"`
	DesignSchema  string    `gorm:"type:longtext" json:"design_schema"`
	DatasetID     *uint     `gorm:"index" json:"dataset_id"`
	InterfaceCode string    `gorm:"size:100" json:"interface_code"`
	ConfigJSON    string    `gorm:"type:text" json:"config_json"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type FormAppPageLink struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	FormAppID     uint      `gorm:"index" json:"form_app_id"`
	FromPageKey   string    `gorm:"size:64" json:"from_page_key"`
	ToPageKey     string    `gorm:"size:64" json:"to_page_key"`
	TriggerType   string    `gorm:"size:32" json:"trigger_type"` // button_click | row_click | auto_redirect
	TriggerConfig string    `gorm:"type:text" json:"trigger_config"`
	ParamMapping  string    `gorm:"type:text" json:"param_mapping"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type FormAppEventRoute struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	FormAppID     uint      `gorm:"index" json:"form_app_id"`
	EventType     string    `gorm:"size:32" json:"event_type"`   // barcode | qrcode | nfc | custom
	MatcherType   string    `gorm:"size:32" json:"matcher_type"` // prefix | regex | exact | all
	MatcherValue  string    `gorm:"size:500" json:"matcher_value"`
	TargetPageKey string    `gorm:"size:64" json:"target_page_key"`
	ParamMapping  string    `gorm:"type:text" json:"param_mapping"`
	Priority      int       `gorm:"default:100" json:"priority"`
	Enabled       bool      `gorm:"default:true" json:"enabled"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type FormAppAccessPolicy struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	FormAppID  uint      `gorm:"index:idx_form_app_policy,priority:1" json:"form_app_id"`
	TargetType string    `gorm:"size:32;index:idx_form_app_policy,priority:2" json:"target_type"` // device | user | department | position
	TargetRef  string    `gorm:"size:128;index:idx_form_app_policy,priority:3" json:"target_ref"`
	CanView    bool      `gorm:"default:true" json:"can_view"`
	CanSubmit  bool      `gorm:"default:true" json:"can_submit"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// FormAppDraft 用户表单草稿（按 form_app + user + page_key 唯一）
type FormAppDraft struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	FormAppID uint      `gorm:"uniqueIndex:idx_form_draft;not null" json:"form_app_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_form_draft;not null" json:"user_id"`
	PageKey   string    `gorm:"size:64;uniqueIndex:idx_form_draft;not null" json:"page_key"`
	DataJSON  string    `gorm:"type:longtext" json:"data_json"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
