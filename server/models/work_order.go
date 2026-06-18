package models

import "time"

// WorkOrderType 工单类型：绑定 form-app 渲染类型化字段，并定义外发同步配置。
type WorkOrderType struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Code        string `gorm:"uniqueIndex;size:64" json:"code"`
	Name        string `gorm:"size:120;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	// FormAppCode 绑定的 form-app 应用编码（对应 FormAppInfo.Code），用于渲染类型化字段；空表示仅基础字段。
	FormAppCode string `gorm:"size:100" json:"form_app_code"`
	FormPageKey string `gorm:"size:64;default:'form'" json:"form_page_key"`
	// DefaultTitle 选择该类型时自动带出的默认工单标题（提交端标题为空时填充）。
	DefaultTitle string    `gorm:"size:200" json:"default_title"`
	Enabled      bool      `gorm:"default:true" json:"enabled"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (WorkOrderType) TableName() string { return "work_order_types" }

// WorkOrderWebhook 工单外发 webhook 配置：可挂在某类型下，也可全局（TypeCode 空）。
// 每条指向「第三方接口（outbound endpoint）」或「连接器接口（connector interface）」，
// 监听若干工单事件，触发时按 ParamsJSON 映射入参调用。可配置多条。
type WorkOrderWebhook struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `gorm:"size:120;not null" json:"name"`
	// TypeCode 关联工单类型 Code；空表示对所有类型生效（全局统一 webhook）。
	TypeCode string `gorm:"size:64;index" json:"type_code"`
	// Target 目标类型：endpoint（第三方接口 outbound_endpoints）| connector（连接器接口 interface_code）。
	Target string `gorm:"size:24;not null;default:endpoint" json:"target"`
	// EndpointID 当 target=endpoint 时指向 outbound_endpoints.id。
	EndpointID uint `gorm:"column:endpoint_id;index;default:0" json:"endpoint_id"`
	// ConnectorCode 当 target=connector 时指向 outbound_connectors.interface_code。
	ConnectorCode string `gorm:"size:80" json:"connector_code"`
	// Events 监听的工单事件（JSON 字符串数组），如 ["work_order.created","work_order.closed"]；空表示全部。
	Events string `gorm:"type:text" json:"events"`
	// ParamsJSON 入参映射（JSON 对象 string->string），值支持 {{占位符}}，
	// 占位符取自工单事件 payload（如 {{code}} {{status}} {{title}} {{device_id}}）。
	ParamsJSON string    `gorm:"column:params_json;type:text" json:"params_json"`
	Enabled    bool      `gorm:"default:true" json:"enabled"`
	SortOrder  int       `gorm:"default:0" json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (WorkOrderWebhook) TableName() string { return "work_order_webhooks" }

// WorkOrder 工单（问题反馈）主体。
type WorkOrder struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Code string `gorm:"uniqueIndex;size:64" json:"code"`
	// TypeCode 工单类型编码（可空=通用反馈）。
	TypeCode    string     `gorm:"size:64;index" json:"type_code"`
	DeviceID    uint       `gorm:"index" json:"device_id"`
	Title       string     `gorm:"size:200;not null" json:"title"`
	Description string     `gorm:"type:text" json:"description"`
	Status      string     `gorm:"size:32;index;default:'open'" json:"status"`  // open|in_progress|resolved|closed|reopened
	Priority    string     `gorm:"size:16;default:'normal'" json:"priority"`    // normal|high|urgent
	Visibility  string     `gorm:"size:16;default:'private'" json:"visibility"` // private|public
	AssignedTo  *uint      `gorm:"index" json:"assigned_to"`
	DataJSON    string     `gorm:"type:text" json:"data_json"` // form-app 类型化字段提交值
	CreatedBy   uint       `gorm:"index" json:"created_by"`    // 提交人 user_id；device 提交时为 0
	ClosedBy    *uint      `json:"closed_by"`
	ClosedAt    *time.Time `json:"closed_at"`
	// ExternalRef 第三方系统回写的工单号（对账/幂等）。
	ExternalRef string `gorm:"size:128;index" json:"external_ref"`
	// OtherCodes 其他编码（App 拍照识别二维码等填入），多个用逗号分隔。
	OtherCodes string `gorm:"type:text" json:"other_codes"`
	// 设备信息快照：提交时刻冻结，便于审计/对账，不随设备改名而变。
	DeviceName        string `gorm:"size:100" json:"device_name_snap"`
	DeviceAliasServer string `gorm:"size:100" json:"device_alias_server"`
	DeviceAliasAgent  string `gorm:"size:100" json:"device_alias_agent"`
	DeviceGroup       string `gorm:"size:100" json:"device_group"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`

	Items      []WorkOrderItem     `gorm:"-" json:"items,omitempty"`
	Activities []WorkOrderActivity `gorm:"-" json:"activities,omitempty"`
}

func (WorkOrder) TableName() string { return "work_orders" }

// WorkOrderItem 工单附件/采集产物。
type WorkOrderItem struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	WorkOrderID uint   `gorm:"index" json:"work_order_id"`
	Kind        string `gorm:"size:32" json:"kind"` // text|photo|video|voice|screen_record|logcat|resource
	FileName    string `gorm:"size:255" json:"file_name"`
	FilePath    string `gorm:"size:500" json:"-"`
	FileSize    int64  `json:"file_size"`
	ContentType string `gorm:"size:128" json:"content_type"`
	// TargetPkg 针对其他 app 采集时的目标包名。
	TargetPkg string    `gorm:"size:200" json:"target_pkg"`
	MetaJSON  string    `gorm:"type:text" json:"meta_json"` // 时长/分辨率/logcat 过滤条件等
	CreatedAt time.Time `json:"created_at"`
}

func (WorkOrderItem) TableName() string { return "work_order_items" }

// WorkOrderActivity 工单处理时间线/审计。
type WorkOrderActivity struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkOrderID uint      `gorm:"index" json:"work_order_id"`
	Action      string    `gorm:"size:32" json:"action"` // create|comment|assign|status_change|close|reopen|external_update
	FromStatus  string    `gorm:"size:32" json:"from_status"`
	ToStatus    string    `gorm:"size:32" json:"to_status"`
	ActorUserID uint      `gorm:"index" json:"actor_user_id"` // 0 = 第三方/系统
	ActorLabel  string    `gorm:"size:120" json:"actor_label"`
	Detail      string    `gorm:"type:text" json:"detail"`
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOrderActivity) TableName() string { return "work_order_activities" }

// WorkOrderTag 工单标签字典。
type WorkOrderTag struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Code      string    `gorm:"uniqueIndex;size:64" json:"code"`
	Name      string    `gorm:"size:120;not null" json:"name"`
	Color     string    `gorm:"size:16" json:"color"` // 展示色，如 #1677ff
	Enabled   bool      `gorm:"default:true" json:"enabled"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (WorkOrderTag) TableName() string { return "work_order_tags" }

// WorkOrderTagLink 工单-标签关联（多对多）。
type WorkOrderTagLink struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkOrderID uint      `gorm:"index:idx_wo_tag,unique,priority:1" json:"work_order_id"`
	TagCode     string    `gorm:"size:64;index:idx_wo_tag,unique,priority:2" json:"tag_code"`
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOrderTagLink) TableName() string { return "work_order_tag_links" }
