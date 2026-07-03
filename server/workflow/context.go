package workflow

import (
	"strings"

	"app-manager/models"
)

// Context 工作流执行上下文
type Context struct {
	// 请求信息
	RequestID     string
	InterfaceID   uint
	InterfaceCode string
	UserID        *uint
	ClientIP      string
	UserAgent     string

	// 请求参数
	Request map[string]interface{}

	// 执行过程中的变量
	Variables   map[string]interface{}
	StepOutputs map[string]interface{} // 步骤ID -> 输出结果

	// 数据源映射 (alias -> DataSource)
	Datasources map[string]*models.DataSource

	// 环境变量
	Env map[string]interface{}
}

// NewContext 创建新的执行上下文
func NewContext(requestID, interfaceCode string, interfaceID uint, request map[string]interface{}) *Context {
	return &Context{
		RequestID:     requestID,
		InterfaceID:   interfaceID,
		InterfaceCode: interfaceCode,
		Request:       request,
		Variables:     make(map[string]interface{}),
		StepOutputs:   make(map[string]interface{}),
		Datasources:   make(map[string]*models.DataSource),
		Env:           make(map[string]interface{}),
	}
}

// GetVariable 获取变量值
func (c *Context) GetVariable(name string) (interface{}, bool) {
	val, ok := c.Variables[name]
	return val, ok
}

// SetVariable 设置变量值
func (c *Context) SetVariable(name string, value interface{}) {
	c.Variables[name] = value
}

// GetStepOutput 获取步骤输出
func (c *Context) GetStepOutput(stepID string) (interface{}, bool) {
	val, ok := c.StepOutputs[stepID]
	return val, ok
}

// SetStepOutput 设置步骤输出
func (c *Context) SetStepOutput(stepID string, output interface{}) {
	c.StepOutputs[stepID] = output
}

// ToMap 转换为map（用于传递给脚本引擎）
func (c *Context) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"request_id":     c.RequestID,
		"interface_id":   c.InterfaceID,
		"interface_code": c.InterfaceCode,
		"user_id":        c.UserID,
		"request":        c.Request,
		"variables":      c.Variables,
		"step_outputs":   c.StepOutputs,
		"env":            c.Env,
	}
}

// ToSafeMap 转换为安全map（脱敏敏感信息）
func (c *Context) ToSafeMap() map[string]interface{} {
	// 复制request并脱敏
	safeRequest := make(map[string]interface{})
	for k, v := range c.Request {
		// 过滤敏感字段
		lowerKey := strings.ToLower(k)
		if strings.Contains(lowerKey, "password") ||
			strings.Contains(lowerKey, "token") ||
			strings.Contains(lowerKey, "secret") ||
			strings.Contains(lowerKey, "key") {
			safeRequest[k] = "***REDACTED***"
		} else {
			safeRequest[k] = v
		}
	}

	return map[string]interface{}{
		"request_id":     c.RequestID,
		"interface_id":   c.InterfaceID,
		"interface_code": c.InterfaceCode,
		"user_id":        c.UserID,
		"request":        safeRequest,
		"variables":      c.Variables,
		"step_outputs":   c.StepOutputs,
	}
}

// SanitizedRequest 返回脱敏后的请求参数
func (c *Context) SanitizedRequest() map[string]interface{} {
	safe := make(map[string]interface{})
	for k, v := range c.Request {
		lowerKey := strings.ToLower(k)
		if strings.Contains(lowerKey, "password") ||
			strings.Contains(lowerKey, "token") ||
			strings.Contains(lowerKey, "secret") {
			safe[k] = "***REDACTED***"
		} else {
			safe[k] = v
		}
	}
	return safe
}
