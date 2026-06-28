package models

import "time"

// WorkflowDefinition 工作流定义（复用 workflow-engine schema）
type WorkflowDefinition struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:200;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	Category    string `gorm:"size:32;index" json:"category"` // form | device | custom_event | manual

	// Workflow Schema（JSON，复用 workflow-engine 定义）
	SchemaJSON string `gorm:"type:longtext;column:schema_json" json:"schema_json"`

	// 触发配置
	TriggerType   string `gorm:"size:32;index" json:"trigger_type"` // custom_event | form_event | manual | schedule
	TriggerConfig string `gorm:"type:text" json:"trigger_config"`   // JSON 配置

	// 执行配置
	Enabled       bool `gorm:"default:true;index" json:"enabled"`
	Timeout       int  `gorm:"default:300" json:"timeout"`      // 秒
	MaxConcurrent int  `gorm:"default:1" json:"max_concurrent"` // 最大并发执行数

	// 权限
	CreatedBy  uint   `gorm:"index" json:"created_by"`
	Visibility string `gorm:"size:32;default:'private'" json:"visibility"` // private | team | public

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkflowExecution 工作流执行记录
type WorkflowExecution struct {
	ID         uint               `gorm:"primaryKey" json:"id"`
	WorkflowID uint               `gorm:"index;not null" json:"workflow_id"`
	Workflow   WorkflowDefinition `gorm:"foreignKey:WorkflowID" json:"workflow,omitempty"`

	// 触发来源
	TriggerType string `gorm:"size:32;index" json:"trigger_type"`
	TriggerBy   *uint  `gorm:"index" json:"trigger_by"` // 用户 ID
	DeviceID    *uint  `gorm:"index" json:"device_id"`  // 设备 ID（如果是设备触发）

	// 执行状态
	Status      string     `gorm:"size:32;index" json:"status"` // pending | running | completed | failed | timeout
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`

	// 输入输出
	InputJSON    string `gorm:"type:longtext" json:"input_json"`  // 触发时的输入数据
	OutputJSON   string `gorm:"type:longtext" json:"output_json"` // 执行结果
	ErrorMessage string `gorm:"type:text" json:"error_message,omitempty"`

	// 执行详情（节点状态等，来自 workflow-engine）
	StateJSON string `gorm:"type:longtext" json:"state_json"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName 指定表名
func (WorkflowDefinition) TableName() string {
	return "workflow_definitions"
}

func (WorkflowExecution) TableName() string {
	return "workflow_executions"
}
