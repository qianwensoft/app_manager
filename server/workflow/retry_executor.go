package workflow

import (
	"fmt"
	"time"
)

// RetryPolicy 重试策略
type RetryPolicy struct {
	MaxRetries    int      `json:"max_retries"`    // 最大重试次数
	RetryInterval []int    `json:"retry_interval"` // 重试间隔（毫秒）
	BackoffType   string   `json:"backoff_type"`   // 退避策略：fixed, linear, exponential
	MaxInterval   int      `json:"max_interval"`   // 最大重试间隔（毫秒）
	RetryOn       []string `json:"retry_on"`       // 重试条件：timeout, network_error, server_error, all
}

// RetryExecutor 重试执行器
type RetryExecutor struct {
	policy *RetryPolicy
}

// NewRetryExecutor 创建重试执行器
func NewRetryExecutor(policy *RetryPolicy) *RetryExecutor {
	if policy == nil {
		policy = &RetryPolicy{
			MaxRetries:  0,
			BackoffType: "fixed",
		}
	}

	// Set defaults
	if policy.BackoffType == "" {
		policy.BackoffType = "fixed"
	}

	if policy.MaxInterval == 0 {
		policy.MaxInterval = 60000 // 默认最大1分钟
	}

	return &RetryExecutor{
		policy: policy,
	}
}

// Execute 执行带重试的操作
func (r *RetryExecutor) Execute(operation func() error) error {
	var lastError error

	for attempt := 0; attempt <= r.policy.MaxRetries; attempt++ {
		// Execute the operation
		err := operation()

		// Success
		if err == nil {
			return nil
		}

		lastError = err

		// Check if should retry
		if !r.shouldRetry(err, attempt) {
			return fmt.Errorf("operation failed after %d attempts: %w", attempt+1, err)
		}

		// Last attempt, don't wait
		if attempt == r.policy.MaxRetries {
			break
		}

		// Calculate backoff delay
		delay := r.calculateBackoff(attempt)

		// Wait before retry
		time.Sleep(delay)
	}

	return fmt.Errorf("operation failed after %d attempts: %w", r.policy.MaxRetries+1, lastError)
}

// shouldRetry 判断是否应该重试
func (r *RetryExecutor) shouldRetry(err error, attempt int) bool {
	// Already exhausted retries
	if attempt >= r.policy.MaxRetries {
		return false
	}

	// No retry conditions specified, retry all errors
	if len(r.policy.RetryOn) == 0 {
		return true
	}

	// Check retry conditions
	errMsg := err.Error()
	for _, condition := range r.policy.RetryOn {
		switch condition {
		case "all":
			return true
		case "timeout":
			if isTimeoutError(errMsg) {
				return true
			}
		case "network_error":
			if isNetworkError(errMsg) {
				return true
			}
		case "server_error":
			if isServerError(errMsg) {
				return true
			}
		}
	}

	return false
}

// calculateBackoff 计算退避延迟
func (r *RetryExecutor) calculateBackoff(attempt int) time.Duration {
	var delayMs int

	switch r.policy.BackoffType {
	case "fixed":
		// 固定间隔
		if len(r.policy.RetryInterval) > 0 {
			delayMs = r.policy.RetryInterval[0]
		} else {
			delayMs = 1000 // 默认1秒
		}

	case "linear":
		// 线性增长：base * (attempt + 1)
		base := 1000
		if len(r.policy.RetryInterval) > 0 {
			base = r.policy.RetryInterval[0]
		}
		delayMs = base * (attempt + 1)

	case "exponential":
		// 指数退避：base * 2^attempt
		base := 1000
		if len(r.policy.RetryInterval) > 0 {
			base = r.policy.RetryInterval[0]
		}
		delayMs = base * (1 << uint(attempt))

	case "custom":
		// 自定义间隔序列
		if attempt < len(r.policy.RetryInterval) {
			delayMs = r.policy.RetryInterval[attempt]
		} else {
			// 超出序列，使用最后一个值
			delayMs = r.policy.RetryInterval[len(r.policy.RetryInterval)-1]
		}

	default:
		delayMs = 1000
	}

	// 限制最大间隔
	if delayMs > r.policy.MaxInterval {
		delayMs = r.policy.MaxInterval
	}

	return time.Duration(delayMs) * time.Millisecond
}

// isTimeoutError 判断是否为超时错误
func isTimeoutError(errMsg string) bool {
	timeoutKeywords := []string{
		"timeout",
		"timed out",
		"deadline exceeded",
		"context deadline exceeded",
	}

	for _, keyword := range timeoutKeywords {
		if containsIgnoreCase(errMsg, keyword) {
			return true
		}
	}

	return false
}

// isNetworkError 判断是否为网络错误
func isNetworkError(errMsg string) bool {
	networkKeywords := []string{
		"connection refused",
		"connection reset",
		"no route to host",
		"network is unreachable",
		"temporary failure",
		"EOF",
	}

	for _, keyword := range networkKeywords {
		if containsIgnoreCase(errMsg, keyword) {
			return true
		}
	}

	return false
}

// isServerError 判断是否为服务器错误
func isServerError(errMsg string) bool {
	serverKeywords := []string{
		"500",
		"502",
		"503",
		"504",
		"internal server error",
		"bad gateway",
		"service unavailable",
		"gateway timeout",
	}

	for _, keyword := range serverKeywords {
		if containsIgnoreCase(errMsg, keyword) {
			return true
		}
	}

	return false
}

// containsIgnoreCase 判断字符串是否包含子串（忽略大小写）
func containsIgnoreCase(s, substr string) bool {
	s = toLowerStr(s)
	substr = toLowerStr(substr)
	return len(s) >= len(substr) && indexOfStr(s, substr) >= 0
}

// toLowerStr 转换为小写
func toLowerStr(s string) string {
	result := ""
	for _, ch := range s {
		if ch >= 'A' && ch <= 'Z' {
			result += string(ch + 32)
		} else {
			result += string(ch)
		}
	}
	return result
}

// indexOfStr 查找子串位置
func indexOfStr(s, substr string) int {
	if len(substr) == 0 {
		return 0
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// ExecuteWithRetry 执行步骤并支持重试
func ExecuteWithRetry(step *Step, executeFunc func() (*StepResult, error)) (*StepResult, error) {
	// No retry configured
	if step.MaxRetries <= 0 {
		return executeFunc()
	}

	// Build retry policy from step config
	policy := &RetryPolicy{
		MaxRetries:    step.MaxRetries,
		RetryInterval: step.RetryInterval,
		BackoffType:   step.RetryBackoff,
		RetryOn:       step.RetryOn,
	}

	// Set default backoff type
	if policy.BackoffType == "" {
		policy.BackoffType = "exponential"
	}

	executor := NewRetryExecutor(policy)

	var result *StepResult
	var executeError error

	err := executor.Execute(func() error {
		res, err := executeFunc()
		result = res
		executeError = err
		return err
	})

	// If retry executor returns error, it means all retries failed
	if err != nil && result != nil {
		// Add retry info to result
		result.RetryCount = step.MaxRetries
		result.Error = fmt.Sprintf("Failed after %d retries: %s", step.MaxRetries+1, executeError.Error())
	}

	return result, err
}
