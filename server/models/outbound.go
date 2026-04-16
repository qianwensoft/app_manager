package models

import "time"

// OutboundApp 外部应用：Base URL + 鉴权（首期 static_header / none）。
type OutboundApp struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	Name              string    `gorm:"size:120;not null" json:"name"`
	Description       string    `gorm:"type:text" json:"description"`
	BaseURL           string    `gorm:"column:base_url;size:500;not null" json:"base_url"`
	AuthType          string    `gorm:"column:auth_type;size:40;not null;default:none" json:"auth_type"` // none | static_header | dynamic_bearer
	AuthConfigJSON    string    `gorm:"column:auth_config_json;type:text" json:"-"`
	TokenProviderJSON string    `gorm:"column:token_provider_json;type:text" json:"-"` // 获取/刷新 token 的接口配置
	TokenCacheJSON    string    `gorm:"column:token_cache_json;type:text" json:"-"`    // 服务端缓存 access/refresh 与过期时间
	Enabled           bool      `gorm:"default:true" json:"enabled"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (OutboundApp) TableName() string { return "outbound_apps" }

// OutboundEndpoint 应用下的一条 HTTP 接口。
type OutboundEndpoint struct {
	ID           uint         `gorm:"primaryKey" json:"id"`
	AppID        uint         `gorm:"index;not null" json:"app_id"`
	App          *OutboundApp `gorm:"foreignKey:AppID" json:"app,omitempty"`
	Name         string       `gorm:"size:120;not null" json:"name"`
	Method       string       `gorm:"size:12;not null;default:POST" json:"method"`
	Path         string       `gorm:"size:500;not null" json:"path"`
	HeadersJSON  string       `gorm:"column:headers_json;type:text" json:"-"`
	BodyTemplate string       `gorm:"column:body_template;type:text" json:"body_template"`
	TimeoutMS    int          `gorm:"column:timeout_ms;default:0" json:"timeout_ms"`
	RetryMax     int          `gorm:"column:retry_max;default:0" json:"retry_max"`
	Enabled      bool         `gorm:"default:true" json:"enabled"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

func (OutboundEndpoint) TableName() string { return "outbound_endpoints" }

// OutboundConnector 出站策略：绑定多事件定义、可选多设备、多 Endpoint。
type OutboundConnector struct {
	ID               uint   `gorm:"primaryKey" json:"id"`
	Name             string `gorm:"size:120;not null" json:"name"`
	Description      string `gorm:"type:text" json:"description"`
	ConnectorCode    string `gorm:"column:connector_code;size:40;not null;default:http_webhook" json:"connector_code"`
	DeliveryMode     string `gorm:"column:delivery_mode;size:24;not null;default:parallel" json:"delivery_mode"` // parallel | sequential | failover
	DefaultTimeoutMS int    `gorm:"column:default_timeout_ms;default:15000" json:"default_timeout_ms"`
	DefaultRetryMax  int    `gorm:"column:default_retry_max;default:2" json:"default_retry_max"`
	// DebounceSameEventMS 相同事件码（同一 event_type）+ 同一设备 + 同一连接器，在此毫秒内的重复触发将被忽略（0 表示关闭）。
	DebounceSameEventMS int `gorm:"column:debounce_same_event_ms;default:0" json:"debounce_same_event_ms"`
	// DebounceDiffEventMS 切换到不同事件码后，若距上次执行不足此毫秒则忽略（0 表示关闭）。
	DebounceDiffEventMS int       `gorm:"column:debounce_diff_event_ms;default:0" json:"debounce_diff_event_ms"`
	Priority            int       `gorm:"column:priority;default:0;index" json:"priority"`
	Enabled             bool      `gorm:"default:true" json:"enabled"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

func (OutboundConnector) TableName() string { return "outbound_connectors" }

// OutboundConnectorDefinition 连接器 ↔ 自定义事件定义（多对多）。
type OutboundConnectorDefinition struct {
	ConnectorID  uint `gorm:"column:connector_id;primaryKey" json:"connector_id"`
	DefinitionID uint `gorm:"column:definition_id;primaryKey" json:"definition_id"`
}

func (OutboundConnectorDefinition) TableName() string { return "outbound_connector_definitions" }

// OutboundConnectorDevice 连接器 ↔ 设备；无任何行表示不限制设备（全部）。
type OutboundConnectorDevice struct {
	ConnectorID uint `gorm:"column:connector_id;primaryKey" json:"connector_id"`
	DeviceID    uint `gorm:"column:device_id;primaryKey" json:"device_id"`
}

func (OutboundConnectorDevice) TableName() string { return "outbound_connector_devices" }

// DeviceOutboundConnectorState 单设备对单连接器的出站覆盖：Paused=暂停投递；Excluded=排除本设备直至清除。
type DeviceOutboundConnectorState struct {
	DeviceID    uint      `gorm:"column:device_id;primaryKey" json:"device_id"`
	ConnectorID uint      `gorm:"column:connector_id;primaryKey" json:"connector_id"`
	Paused      bool      `gorm:"column:paused;not null;default:false" json:"paused"`
	Excluded    bool      `gorm:"column:excluded;not null;default:false" json:"excluded"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (DeviceOutboundConnectorState) TableName() string { return "device_outbound_connector_states" }

// OutboundConnectorEndpoint 连接器 ↔ 接口及顺序。
type OutboundConnectorEndpoint struct {
	ConnectorID uint `gorm:"column:connector_id;primaryKey" json:"connector_id"`
	EndpointID  uint `gorm:"column:endpoint_id;primaryKey" json:"endpoint_id"`
	SortOrder   int  `gorm:"column:sort_order;default:0" json:"sort_order"`
}

func (OutboundConnectorEndpoint) TableName() string { return "outbound_connector_endpoints" }

// OutboundConnectorPhase 连接器内有序阶段；阶段之间严格顺序执行，阶段内由 RunMode 控制。
type OutboundConnectorPhase struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ConnectorID uint      `gorm:"column:connector_id;index;not null" json:"connector_id"`
	SortOrder   int       `gorm:"column:sort_order;default:0" json:"sort_order"`
	RunMode     string    `gorm:"column:run_mode;size:24;not null;default:parallel" json:"run_mode"` // parallel | sequential | failover
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (OutboundConnectorPhase) TableName() string { return "outbound_connector_phases" }

// OutboundConnectorStep 阶段内单步：HTTP 调用或向源设备下发 Intent / 打开网页。
type OutboundConnectorStep struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	PhaseID       uint      `gorm:"column:phase_id;index;not null" json:"phase_id"`
	SortOrder     int       `gorm:"column:sort_order;default:0" json:"sort_order"`
	StepType      string    `gorm:"column:step_type;size:40;not null" json:"step_type"`      // http | broadcast_intent | view_url | message
	EndpointID    uint      `gorm:"column:endpoint_id;index" json:"endpoint_id"`             // 仅 http；其它为 0
	DelayBeforeMS int       `gorm:"column:delay_before_ms;default:0" json:"delay_before_ms"` // 本步执行前等待
	DelayAfterMS  int       `gorm:"column:delay_after_ms;default:0" json:"delay_after_ms"`   // 本步执行完成后等待
	ConfigJSON    string    `gorm:"column:config_json;type:text" json:"-"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (OutboundConnectorStep) TableName() string { return "outbound_connector_steps" }

// OutboundDelivery 单次步骤执行日志（HTTP 或 Agent 下发）。
type OutboundDelivery struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	DeviceEventID uint      `gorm:"column:device_event_id;index;not null" json:"device_event_id"`
	ConnectorID   uint      `gorm:"column:connector_id;index;not null" json:"connector_id"`
	PhaseID       uint      `gorm:"column:phase_id;index" json:"phase_id"`
	StepID        uint      `gorm:"column:step_id;index" json:"step_id"`
	StepType      string    `gorm:"column:step_type;size:40;default:http" json:"step_type"` // http | broadcast_intent | view_url
	EndpointID    uint      `gorm:"column:endpoint_id;index" json:"endpoint_id"`
	DetailJSON    string    `gorm:"column:detail_json;type:text" json:"detail_json"`
	Status        string    `gorm:"size:24;not null" json:"status"` // success | failed
	HTTPStatus    int       `gorm:"column:http_status" json:"http_status"`
	Error         string    `gorm:"type:text" json:"error"`
	Attempts      int       `gorm:"default:1" json:"attempts"`
	DurationMS    int64     `gorm:"column:duration_ms" json:"duration_ms"`
	RequestURL    string    `gorm:"column:request_url;size:1000" json:"request_url"`
	CreatedAt     time.Time `json:"created_at"`
}

func (OutboundDelivery) TableName() string { return "outbound_deliveries" }
