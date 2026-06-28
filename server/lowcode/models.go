package lowcode

import "time"

// LowCodePage 低代码页面
type LowCodePage struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Code          string    `gorm:"uniqueIndex;size:100" json:"code"`
	Name          string    `gorm:"size:200" json:"name"`
	Category      string    `gorm:"size:32" json:"category"` // form | dashboard | workflow | custom
	PuckState     string    `gorm:"type:longtext" json:"puck_state"`
	WorkflowDef   string    `gorm:"type:longtext" json:"workflow_def"`
	DataSourceID  *uint     `gorm:"index" json:"data_source_id"`
	PublishStatus int       `gorm:"default:0" json:"publish_status"` // 0=草稿 1=已发布
	Version       int64     `gorm:"default:0" json:"version"`
	YjsDocState   []byte    `gorm:"type:blob" json:"-"` // Yjs 文档快照
	CreatedBy     uint      `gorm:"index" json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// LowCodePageVersion 页面版本历史
type LowCodePageVersion struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	PageID      uint      `gorm:"index" json:"page_id"`
	Version     int64     `json:"version"`
	PuckState   string    `gorm:"type:longtext" json:"puck_state"`
	WorkflowDef string    `gorm:"type:longtext" json:"workflow_def"`
	ChangeLog   string    `gorm:"type:text" json:"change_log"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// LowCodeWorkflow 工作流定义
type LowCodeWorkflow struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Code          string    `gorm:"uniqueIndex;size:100" json:"code"`
	Name          string    `gorm:"size:200" json:"name"`
	Description   string    `gorm:"type:text" json:"description"`
	WorkflowDef   string    `gorm:"type:longtext" json:"workflow_def"`
	TriggerType   string    `gorm:"size:32" json:"trigger_type"`     // manual | event | schedule | webhook
	TriggerConfig string    `gorm:"type:text" json:"trigger_config"` // JSON
	Enabled       bool      `gorm:"default:true" json:"enabled"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// LowCodeEvent 事件绑定
type LowCodeEvent struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	PageID          uint      `gorm:"index" json:"page_id"`
	EventType       string    `gorm:"size:32" json:"event_type"`   // lifecycle | user_interaction | data_event | external
	TriggerType     string    `gorm:"size:32" json:"trigger_type"` // mounted | clicked | changed | scanned | mqtt | webhook
	WorkflowID      *uint     `gorm:"index" json:"workflow_id"`
	WorkflowEnabled bool      `gorm:"default:true" json:"workflow_enabled"`
	Priority        int       `gorm:"default:100" json:"priority"`
	Enabled         bool      `gorm:"default:true" json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// LowCodeCollabSession 协同会话
type LowCodeCollabSession struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	PageID      uint      `gorm:"index" json:"page_id"`
	UserID      uint      `gorm:"index" json:"user_id"`
	SessionID   string    `gorm:"index;size:64" json:"session_id"`
	YjsClientID uint64    `json:"yjs_client_id"`
	JoinedAt    time.Time `json:"joined_at"`
	LastSeenAt  time.Time `json:"last_seen_at"`
}
