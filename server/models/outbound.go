package models

import "time"

// OutboundApp 外部应用：Base URL + 鉴权（首期 static_header / none）。
type OutboundApp struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	// AppCode 应用编码，用于接收 URL 中识别应用（自动生成，唯一）。
	AppCode           string    `gorm:"column:app_code;size:32;uniqueIndex" json:"app_code"`
	Name              string    `gorm:"size:120;not null" json:"name"`
	Description       string    `gorm:"type:text" json:"description"`
	BaseURL           string    `gorm:"column:base_url;size:500;not null" json:"base_url"`
	AuthType          string    `gorm:"column:auth_type;size:40;not null;default:none" json:"auth_type"` // none | static_header | dynamic_bearer
	AuthConfigJSON    string    `gorm:"column:auth_config_json;type:text" json:"-"`
	// CommonHeadersJSON 出站 HTTP 通用请求头（JSON 对象 string->string），与接口 Headers 合并，同名键以接口为准。
	CommonHeadersJSON string `gorm:"column:common_headers_json;type:text" json:"-"`
	TokenProviderJSON string    `gorm:"column:token_provider_json;type:text" json:"-"` // 获取/刷新 token 的接口配置
	TokenCacheJSON    string    `gorm:"column:token_cache_json;type:text" json:"-"`    // 服务端缓存 access/refresh 与过期时间
	// ExtensionScriptsJSON 应用级扩展脚本（JSON，version 2）：before_request / after_response 各为脚本对象数组（顺序执行；default 为 true 的条目先于同阶段其它条目）。兼容旧版单对象。ECMAScript 5，入口 function main(ctx){...}。
	ExtensionScriptsJSON string `gorm:"column:extension_scripts_json;type:text" json:"-"`
	// AppParamsJSON 应用级参数（JSON 数组），每项 {key, value, sensitive, description}；sensitive=true 时 value 不出现在 API 响应中。
	AppParamsJSON string `gorm:"column:app_params_json;type:text" json:"-"`
	Enabled       bool   `gorm:"default:true" json:"enabled"`
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
	ParamSchema  string       `gorm:"column:param_schema;type:text" json:"param_schema"`
	// ResponseSchema 由调试后「生成返回参数 Schema」写入；JSON Schema 格式，描述接口响应体结构。
	ResponseSchema string    `gorm:"column:response_schema;type:text" json:"response_schema"`
	ContentType    string    `gorm:"column:content_type;size:120" json:"content_type"`
	TimeoutMS      int       `gorm:"column:timeout_ms;default:0" json:"timeout_ms"`
	RetryMax       int       `gorm:"column:retry_max;default:0" json:"retry_max"`
	Enabled        bool      `gorm:"default:true" json:"enabled"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
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
	DebounceDiffEventMS int `gorm:"column:debounce_diff_event_ms;default:0" json:"debounce_diff_event_ms"`
	// DebounceSameScanMS 同一设备 + 连接器 + 相同扫码内容（event_data.value）在窗口内忽略（防连扫/回环，0 关闭）。
	DebounceSameScanMS int `gorm:"column:debounce_same_scan_ms;default:0" json:"debounce_same_scan_ms"`
	// LoopCooldownMS 本连接器下发 broadcast_intent 成功后，同设备在冷却期内不再触发（0 关闭）。
	LoopCooldownMS int `gorm:"column:loop_cooldown_ms;default:0" json:"loop_cooldown_ms"`
	Priority            int       `gorm:"column:priority;default:0;index" json:"priority"`
	// TriggerType 触发方式：device_event | http_webhook | http_poll | websocket | stomp | cron | system_event | api_call（接口模式）
	TriggerType string `gorm:"column:trigger_type;size:40;not null;default:device_event" json:"trigger_type"`
	// TriggerConfigJSON 触发器配置 JSON，结构因 TriggerType 而异。
	TriggerConfigJSON string `gorm:"column:trigger_config_json;type:text" json:"-"`
	// WebhookID 当 trigger_type=http_webhook 时，关联到 outbound_webhooks.id（0 表示未绑定）。
	WebhookID           uint      `gorm:"column:webhook_id;index;default:0" json:"webhook_id"`
	// InterfaceMode 接口模式：当为 true 时，此连接器可作为接口被调用（支持入参和返回值）
	InterfaceMode bool `gorm:"column:interface_mode;default:false" json:"interface_mode"`
	// InterfaceCode 接口编码，当 interface_mode=true 时必填，用于唯一标识此连接器接口
	InterfaceCode string `gorm:"column:interface_code;size:80;uniqueIndex:idx_interface_code,where:interface_mode=true" json:"interface_code"`
	// InputParamsJSON 输入参数定义（JSON Schema 格式），描述接口接受的参数
	InputParamsJSON string `gorm:"column:input_params_json;type:text" json:"input_params_json"`
	// OutputSchemaJSON 输出结构定义（JSON Schema 格式），描述接口返回的数据结构
	OutputSchemaJSON string `gorm:"column:output_schema_json;type:text" json:"output_schema_json"`
	// OutputMappingsJSON 输出参数映射配置（JSON 数组），定义如何从 context 映射到返回结构
	OutputMappingsJSON string `gorm:"column:output_mappings_json;type:text" json:"output_mappings_json"`
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
	// ParamsJSON 阶段级默认占位符：JSON 对象，键为完整 {{...}}，值为字符串；本阶段任一步执行前写入公共 vars。
	ParamsJSON string `gorm:"column:params_json;type:text" json:"-"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (OutboundConnectorPhase) TableName() string { return "outbound_connector_phases" }

// OutboundConnectorStep 阶段内单步：HTTP 调用或向源设备下发 Intent / 打开网页。
type OutboundConnectorStep struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	PhaseID       uint      `gorm:"column:phase_id;index;not null" json:"phase_id"`
	SortOrder     int       `gorm:"column:sort_order;default:0" json:"sort_order"`
	StepType      string    `gorm:"column:step_type;size:40;not null" json:"step_type"`      // http | app_script | broadcast_intent | view_url | message | condition | call_connector
	EndpointID    uint      `gorm:"column:endpoint_id;index" json:"endpoint_id"`             // 仅 http；其它为 0
	DelayBeforeMS int       `gorm:"column:delay_before_ms;default:0" json:"delay_before_ms"` // 本步执行前等待
	DelayAfterMS  int       `gorm:"column:delay_after_ms;default:0" json:"delay_after_ms"`   // 本步执行完成后等待
	ConfigJSON    string    `gorm:"column:config_json;type:text" json:"-"`
	// ConditionExpr 条件表达式（仅当 step_type=condition 时使用），JavaScript 表达式，返回布尔值
	ConditionExpr string `gorm:"column:condition_expr;type:text" json:"condition_expr"`
	// TrueBranchPhaseID 条件为真时跳转到的阶段 ID（0 表示继续当前流程）
	TrueBranchPhaseID uint `gorm:"column:true_branch_phase_id;default:0" json:"true_branch_phase_id"`
	// FalseBranchPhaseID 条件为假时跳转到的阶段 ID（0 表示继续当前流程）
	FalseBranchPhaseID uint `gorm:"column:false_branch_phase_id;default:0" json:"false_branch_phase_id"`
	// CallConnectorCode 调用其他连接器的接口编码（仅当 step_type=call_connector 时使用）
	CallConnectorCode string `gorm:"column:call_connector_code;size:80" json:"call_connector_code"`
	// CallParamsJSON 调用连接器时的参数映射（JSON 对象），支持 {{placeholder}} 占位符
	CallParamsJSON string `gorm:"column:call_params_json;type:text" json:"call_params_json"`
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

// OutboundWebhook 应用下的入站 Webhook 接口（被动接收外部推送）。
// 每个 app 可配置多个，各自独立的鉴权与解密方式。
type OutboundWebhook struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	AppID         uint      `gorm:"column:app_id;index;not null" json:"app_id"`
	Name          string    `gorm:"size:120;not null" json:"name"`
	Description   string    `gorm:"type:text" json:"description"`
	// Method 接收 HTTP 方法：POST | GET | PUT | PATCH（默认 POST）
	Method        string    `gorm:"column:method;size:12;not null;default:POST" json:"method"`
	// Path 接收路径标识，用于区分同 app 下多个 webhook（可选）
	Path          string    `gorm:"column:path;size:500" json:"path"`
	// AuthMethod 入站鉴权方式：none | hmac_sha256 | token_header | token_query
	AuthMethod    string    `gorm:"column:auth_method;size:40;not null;default:none" json:"auth_method"`
	// DecryptMethod 解密方式：none | aes_cbc_pkcs7 | aes_ecb_pkcs7
	DecryptMethod string    `gorm:"column:decrypt_method;size:40;not null;default:none" json:"decrypt_method"`
	// DecryptKeyPath 指定需要解密的字段路径（点分隔，如 data.encryptedContent）；空表示整个 body 解密
	DecryptKeyPath string    `gorm:"column:decrypt_key_path;size:500" json:"decrypt_key_path"`
	// ResponseTransformJS 解密后对 payload 执行的 JS 转换脚本；入口 function main(payload){ return transformed; }
	ResponseTransformJS string `gorm:"column:response_transform_js;type:text" json:"response_transform_js"`
	// ConfigJSON 鉴权/解密所需参数（JSON 对象），敏感字段在 API 响应中脱敏。
	ConfigJSON    string    `gorm:"column:config_json;type:text" json:"-"`
	// ResponseSchema 由调试后「生成返回参数 Schema」写入；JSON Schema 格式，描述接口响应体结构。
	ResponseSchema string   `gorm:"column:response_schema;type:text" json:"response_schema"`
	// ObservedEventTypes 调试时自动从 payload 提取的事件类型列表（JSON 字符串数组）。
	ObservedEventTypes string `gorm:"column:observed_event_types;type:text" json:"observed_event_types"`
	// LastReceivedAt 最近一次成功接收数据的时间。
	LastReceivedAt *time.Time `gorm:"column:last_received_at" json:"last_received_at"`
	// ReceiveToken 用于接收 URL 的不透明令牌，替代路径中暴露的 ID。
	ReceiveToken  string     `gorm:"column:receive_token;size:32;uniqueIndex" json:"receive_token"`
	Enabled       bool      `gorm:"default:true" json:"enabled"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (OutboundWebhook) TableName() string { return "outbound_webhooks" }

// OutboundWebhookEventType 每个 Webhook 下的事件类型定义：可编辑中文名、备注、JSON Schema。
type OutboundWebhookEventType struct {
	ID         uint      `gorm:"primarykey" json:"id"`
	WebhookID  uint      `gorm:"not null;uniqueIndex:uix_webhook_event_type" json:"webhook_id"`
	EventType  string    `gorm:"not null;size:120;uniqueIndex:uix_webhook_event_type" json:"event_type"` // e.g. "order.created"
	Label      string    `gorm:"size:120" json:"label"`                                                  // 中文显示名
	Remark     string    `gorm:"type:text" json:"remark"`                                                // 备注说明
	SchemaJSON string    `gorm:"type:text" json:"schema_json"`                                           // 该事件的 JSON Schema
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (OutboundWebhookEventType) TableName() string { return "outbound_webhook_event_types" }

// OutboundWebhookLog 每次收到 webhook 请求的完整记录。
type OutboundWebhookLog struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	WebhookID    uint   `gorm:"column:webhook_id;index;not null" json:"webhook_id"`
	Ts           int64  `gorm:"column:ts;not null" json:"ts"`
	Method       string `gorm:"column:method;size:12" json:"method"`
	Path         string `gorm:"column:path;size:500" json:"path"`
	Query        string `gorm:"column:query;size:1000" json:"query"`
	Headers      string `gorm:"column:headers;type:text" json:"headers"`
	RawBody      string `gorm:"column:raw_body;type:mediumtext" json:"raw_body"`
	DecryptedRaw string `gorm:"column:decrypted_raw;type:mediumtext" json:"decrypted_raw"`
	Payload      string `gorm:"column:payload;type:mediumtext" json:"payload"`
	ReturnData   string `gorm:"column:return_data;type:mediumtext" json:"return_data"`
	EventType    string `gorm:"column:event_type;size:120;index" json:"event_type"`
	JsLogs       string `gorm:"column:js_logs;type:text" json:"-"`
	Error        string `gorm:"column:error;type:text" json:"error"`
}

func (OutboundWebhookLog) TableName() string { return "outbound_webhook_logs" }
