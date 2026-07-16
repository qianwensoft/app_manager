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
	DefaultTitle string `gorm:"size:200" json:"default_title"`
	// BoardCardTemplate 看板卡片正文模板：多行，每行一段，支持 {{field}} 占位符
	// （field 取工单行字段，如 title/code/priority/status/device_name/tags/other_codes）。
	// 空表示用默认卡片布局。
	BoardCardTemplate string `gorm:"type:text" json:"board_card_template"`
	// AutoArchiveEnabled 是否对该类型启用「到达约定状态并超时后自动归档」。
	AutoArchiveEnabled bool `gorm:"default:false" json:"auto_archive_enabled"`
	// AutoArchiveStatuses 触发自动归档的结算状态（逗号分隔），如 "resolved,closed"；
	// 空则默认 resolved,closed。工单进入这些状态并停留超过 AutoArchiveDelayMinutes 即归档。
	AutoArchiveStatuses string `gorm:"size:64" json:"auto_archive_statuses"`
	// AutoArchiveDelayMinutes 达到结算状态后到自动归档的等待分钟数（如 1440=24小时、43200=30天）。
	AutoArchiveDelayMinutes int `gorm:"default:0" json:"auto_archive_delay_minutes"`
	// LastAutoArchiveAt 最近一次自动归档扫描（定时或手动「立即执行」）运行时刻。
	LastAutoArchiveAt *time.Time `json:"last_auto_archive_at"`
	// LastAutoArchiveCount 最近一次扫描归档的工单数。
	LastAutoArchiveCount int       `gorm:"default:0" json:"last_auto_archive_count"`
	Enabled              bool      `gorm:"default:true" json:"enabled"`
	SortOrder            int       `gorm:"default:0" json:"sort_order"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
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
	// SettledAt 结算时刻：工单首次进入已解决/已关闭时冻结，处理耗时以此为终点、不再增长；
	// 重新打开时清空，耗时继续从 CreatedAt 起算（重开不重置起点）。
	SettledAt *time.Time `gorm:"index" json:"settled_at"`
	// Archived 归档标记：归档后默认列表不展示，需单独归档页查询。
	Archived   bool       `gorm:"index;default:false" json:"archived"`
	ArchivedAt *time.Time `json:"archived_at"`
	ArchivedBy *uint      `json:"archived_by"`
	// BusinessNo 业务单号（内部业务流程编号，可由用户输入或系统生成）。
	BusinessNo string `gorm:"size:128;index" json:"business_no"`
	// ExternalRef 第三方系统回写的工单号（对账/幂等）。
	ExternalRef string `gorm:"size:128;index" json:"external_ref"`
	// OtherCodes 其他编码（App 拍照识别二维码等填入），多个用逗号分隔。
	OtherCodes string `gorm:"type:text" json:"other_codes"`
	// 设备信息快照：提交时刻冻结，便于审计/对账，不随设备改名而变。
	DeviceName        string    `gorm:"size:100" json:"device_name_snap"`
	DeviceAliasServer string    `gorm:"size:100" json:"device_alias_server"`
	DeviceAliasAgent  string    `gorm:"size:100" json:"device_alias_agent"`
	DeviceGroup       string    `gorm:"size:100" json:"device_group"`
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

// WorkOrderProgress 工单进展记录（Web端维护、App端补充说明/催单）。
// 不记入 activities 时间线，独立展示。
type WorkOrderProgress struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	WorkOrderID uint   `gorm:"index" json:"work_order_id"`
	Content     string `gorm:"type:text;not null" json:"content"` // 进展内容
	// CreatedBy 创建人 user_id；0 表示设备/系统。
	CreatedBy   uint      `gorm:"index" json:"created_by"`
	CreatorName string    `gorm:"size:120" json:"creator_name"` // 创建人名称快照
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOrderProgress) TableName() string { return "work_order_progress" }

// WorkOrderProgressAttachment 工单进展附件（图片、视频、音频、录屏、录音、日志）。
type WorkOrderProgressAttachment struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	ProgressID uint   `gorm:"index" json:"progress_id"`
	FileName   string `gorm:"size:255" json:"file_name"`
	FilePath   string `gorm:"size:500" json:"-"`
	FileSize   int64  `json:"file_size"`
	// Kind 附件类型：photo|video|audio|screen_record|voice|logcat
	Kind        string    `gorm:"size:32" json:"kind"`
	ContentType string    `gorm:"size:128" json:"content_type"`
	MetaJSON    string    `gorm:"type:text" json:"meta_json"` // 扩展信息（时长、分辨率等）
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOrderProgressAttachment) TableName() string { return "work_order_progress_attachments" }

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
	ID          uint   `gorm:"primaryKey" json:"id"`
	WorkOrderID uint   `gorm:"index:idx_wo_tag,unique,priority:1" json:"work_order_id"`
	TagCode     string `gorm:"size:64;index:idx_wo_tag,unique,priority:2" json:"tag_code"`
	// TagName 挂载时刻的标签名称快照：字典改名后历史关联仍保留当时名称。
	TagName   string    `gorm:"size:120" json:"tag_name"`
	CreatedAt time.Time `json:"created_at"`
}

func (WorkOrderTagLink) TableName() string { return "work_order_tag_links" }

// WorkOrderWorkflow 工单工作流：监听工单事件，执行自动化动作（调接口/执行 JS/更新工单等）。
type WorkOrderWorkflow struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `gorm:"size:120;not null" json:"name"`
	// TypeCode 关联工单类型 Code；空表示对所有类型生效（全局工作流）。
	TypeCode string `gorm:"size:64;index" json:"type_code"`
	// Events 监听的工单事件（JSON 字符串数组），如 ["work_order.created","work_order.status_changed"]；空表示全部。
	Events string `gorm:"type:text" json:"events"`
	// ActionsJSON 动作列表（JSON 数组），每个动作含 type + config。
	// type: call_endpoint | call_connector | call_data_interface | execute_js | update_work_order | create_work_order | query_work_orders
	ActionsJSON string    `gorm:"column:actions_json;type:text;not null" json:"actions_json"`
	Description string    `gorm:"type:text" json:"description"`
	Enabled     bool      `gorm:"default:true" json:"enabled"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (WorkOrderWorkflow) TableName() string { return "work_order_workflows" }

// WorkOrderWorkflowLog 工作流执行日志。
type WorkOrderWorkflowLog struct {
	ID         uint `gorm:"primaryKey" json:"id"`
	WorkflowID uint `gorm:"index" json:"workflow_id"`
	// WorkOrderID 触发工单 ID。
	WorkOrderID uint   `gorm:"index" json:"work_order_id"`
	Event       string `gorm:"size:64" json:"event"`
	// ActionsExecuted 已执行动作数。
	ActionsExecuted int `json:"actions_executed"`
	// Status 执行状态：success | partial | failed。
	Status string `gorm:"size:32" json:"status"`
	// ErrorMsg 错误信息（失败时）。
	ErrorMsg string `gorm:"type:text" json:"error_msg"`
	// ExecutionLogs JS 执行日志（JSON 数组）。
	ExecutionLogs string `gorm:"type:text" json:"execution_logs"`
	// ActionDetails 每个动作的详细执行信息（JSON 数组）。
	ActionDetails string `gorm:"type:text" json:"action_details"`
	// ContextSnapshot 上下文变量快照（JSON 对象）。
	ContextSnapshot string    `gorm:"type:text" json:"context_snapshot"`
	DurationMs      int64     `json:"duration_ms"`
	CreatedAt       time.Time `json:"created_at"`
}

func (WorkOrderWorkflowLog) TableName() string { return "work_order_workflow_logs" }

// WorkOrderReportShare 工单报告分享链接
type WorkOrderReportShare struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Token       string `gorm:"uniqueIndex;size:64;not null" json:"token"`
	Title       string `gorm:"size:200" json:"title"`
	FiltersJSON string `gorm:"type:text" json:"filters_json"` // 查询条件（JSON）
	// AuthMode 认证模式：public（免登录）| login（需登录）
	AuthMode string `gorm:"size:16;default:'public'" json:"auth_mode"`
	// Permissions 需登录模式的权限配置（JSON 对象），如 {"can_view":true,"can_comment":true,"can_update_status":true}
	Permissions string    `gorm:"type:text" json:"permissions"`
	CreatedBy   uint      `gorm:"index" json:"created_by"`
	ViewCount   int       `gorm:"default:0" json:"view_count"` // 浏览次数
	ExpiresAt   time.Time `gorm:"index" json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOrderReportShare) TableName() string { return "work_order_report_shares" }

// WorkOrderReportShareView 分享链接浏览记录
type WorkOrderReportShareView struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ShareID   uint      `gorm:"index;not null" json:"share_id"`
	IPAddress string    `gorm:"size:100" json:"ip_address"`
	UserAgent string    `gorm:"type:text" json:"user_agent"`
	ViewedAt  time.Time `gorm:"index" json:"viewed_at"`
}

func (WorkOrderReportShareView) TableName() string { return "work_order_report_share_views" }
