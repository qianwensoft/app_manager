package workflow

import "time"

// Step 工作流步骤定义
type Step struct {
	ID    string `json:"id"`
	Type  string `json:"type"`  // sql, interface, condition, script, delay, http, etc.
	Label string `json:"label"` // 显示名称

	// SQL步骤
	Datasource         string `json:"datasource,omitempty"`           // 数据源别名
	SQL                string `json:"sql,omitempty"`                  // SQL语句
	TransactionGroup   string `json:"transaction_group,omitempty"`    // 事务组ID
	ExpectAffectedRows *int   `json:"expect_affected_rows,omitempty"` // 期望影响行数

	// 接口调用步骤
	InterfaceCode string                 `json:"interface_code,omitempty"` // 调用的接口code
	Params        map[string]interface{} `json:"params,omitempty"`         // 接口参数

	// 条件步骤
	Expression string   `json:"expression,omitempty"` // 条件表达式
	Then       []string `json:"then,omitempty"`       // 条件为真时执行的步骤ID列表
	Else       []string `json:"else,omitempty"`       // 条件为假时执行的步骤ID列表

	// 脚本步骤
	Engine string `json:"engine,omitempty"` // javascript, lua, go
	Code   string `json:"code,omitempty"`   // 脚本代码

	// HTTP步骤
	HTTPConfig interface{} `json:"http_config,omitempty"` // HTTP请求配置

	// 延迟步骤
	DelayConfig interface{} `json:"delay_config,omitempty"` // 延迟配置

	// 循环步骤
	LoopConfig interface{} `json:"loop_config,omitempty"` // 循环配置

	// 数据源动态路由
	DatasourceRouting *DatasourceRouting `json:"datasource_routing,omitempty"`

	// 输出定义
	Output interface{} `json:"output,omitempty"` // 输出变量映射

	// 错误处理
	OnError       string   `json:"on_error,omitempty"`       // rollback, continue, retry
	MaxRetries    int      `json:"max_retries,omitempty"`    // 最大重试次数
	RetryInterval []int    `json:"retry_interval,omitempty"` // 重试间隔（毫秒）
	RetryBackoff  string   `json:"retry_backoff,omitempty"`  // 退避策略：fixed, linear, exponential, custom
	RetryOn       []string `json:"retry_on,omitempty"`       // 重试条件：timeout, network_error, server_error, all

	// 异步执行
	Async bool `json:"async,omitempty"` // 是否异步执行（不阻塞后续步骤）
}

// DatasourceRouting 数据源动态路由配置
type DatasourceRouting struct {
	Type    string        `json:"type,omitempty"`   // script, rules
	Engine  string        `json:"engine,omitempty"` // 脚本引擎类型
	Code    string        `json:"code,omitempty"`   // 脚本代码
	Rules   []RoutingRule `json:"rules,omitempty"`
	Default string        `json:"default,omitempty"` // 默认数据源
}

// RoutingRule 路由规则
type RoutingRule struct {
	Condition  string `json:"condition"`  // 条件表达式
	Datasource string `json:"datasource"` // 目标数据源
}

// Workflow 工作流定义
type Workflow struct {
	Version       string                        `json:"version"`
	Description   string                        `json:"description,omitempty"`
	Steps         []Step                        `json:"steps"`
	Transactions  map[string]*TransactionConfig `json:"transactions,omitempty"`
	ErrorHandling *ErrorHandlingConfig          `json:"error_handling,omitempty"`
}

// TransactionConfig 事务配置
type TransactionConfig struct {
	Datasource string   `json:"datasource"` // 数据源别名
	Isolation  string   `json:"isolation"`  // 隔离级别
	Steps      []string `json:"steps"`      // 包含的步骤ID列表
}

// ErrorHandlingConfig 错误处理配置
type ErrorHandlingConfig struct {
	Strategy          string             `json:"strategy"` // compensate, rollback, ignore
	CompensationSteps []CompensationStep `json:"compensation_steps,omitempty"`
}

// CompensationStep 补偿步骤
type CompensationStep struct {
	ForStep       string                 `json:"for_step"` // 为哪个步骤补偿
	SQL           string                 `json:"sql,omitempty"`
	Datasource    string                 `json:"datasource,omitempty"`
	Type          string                 `json:"type,omitempty"` // sql, interface
	InterfaceCode string                 `json:"interface_code,omitempty"`
	Params        map[string]interface{} `json:"params,omitempty"`
}

// StepResult 步骤执行结果
type StepResult struct {
	StepID    string    `json:"step_id"`
	Type      string    `json:"type"`
	Label     string    `json:"label"`
	Success   bool      `json:"success"`
	StartTime time.Time `json:"start_time"`
	ElapsedMS int64     `json:"elapsed_ms"`

	// SQL步骤结果
	Datasource   string `json:"datasource,omitempty"`
	SQL          string `json:"sql,omitempty"`
	AffectedRows int64  `json:"affected_rows,omitempty"`
	LastInsertID int64  `json:"last_insert_id,omitempty"`

	// 通用输出
	Output map[string]interface{} `json:"output,omitempty"`

	// 错误信息
	Error      string `json:"error,omitempty"`
	RetryCount int    `json:"retry_count,omitempty"`

	// 条件步骤
	BranchTaken string `json:"branch_taken,omitempty"` // then, else
}

// WorkflowResult 工作流执行结果
type WorkflowResult struct {
	RequestID      string                 `json:"request_id"`
	Status         string                 `json:"status"` // success, failed, compensated, timeout
	TotalSteps     int                    `json:"total_steps"`
	CompletedSteps int                    `json:"completed_steps"`
	FailedStepID   string                 `json:"failed_step_id,omitempty"`
	ErrorMessage   string                 `json:"error_message,omitempty"`
	ElapsedMS      int64                  `json:"elapsed_ms"`
	CompensationMS int64                  `json:"compensation_ms,omitempty"`
	StepLogs       []StepResult           `json:"step_logs"`
	Compensated    bool                   `json:"compensated"`
	FinalOutput    map[string]interface{} `json:"final_output,omitempty"`
}
