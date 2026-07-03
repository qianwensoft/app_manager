package workflow

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"app-manager/models"
)

// AsyncExecutor 异步执行器
type AsyncExecutor struct {
	mu              sync.RWMutex
	runningTasks    map[string]*AsyncTask
	completedTasks  map[string]*AsyncTask
	maxConcurrent   int
	semaphore       chan struct{}
}

// AsyncTask 异步任务
type AsyncTask struct {
	RequestID   string                 `json:"request_id"`
	StepID      string                 `json:"step_id"`
	Status      string                 `json:"status"` // pending, running, completed, failed
	StartTime   time.Time              `json:"start_time"`
	EndTime     *time.Time             `json:"end_time,omitempty"`
	ElapsedMS   int64                  `json:"elapsed_ms"`
	Result      *StepResult            `json:"result,omitempty"`
	Error       string                 `json:"error,omitempty"`
	Progress    int                    `json:"progress"` // 0-100
}

// NewAsyncExecutor 创建异步执行器
func NewAsyncExecutor(maxConcurrent int) *AsyncExecutor {
	if maxConcurrent <= 0 {
		maxConcurrent = 10 // 默认最大并发数
	}

	return &AsyncExecutor{
		runningTasks:   make(map[string]*AsyncTask),
		completedTasks: make(map[string]*AsyncTask),
		maxConcurrent:  maxConcurrent,
		semaphore:      make(chan struct{}, maxConcurrent),
	}
}

// ExecuteAsync 异步执行步骤
func (e *AsyncExecutor) ExecuteAsync(requestID, stepID string, executeFunc func() (*StepResult, error)) *AsyncTask {
	task := &AsyncTask{
		RequestID: requestID,
		StepID:    stepID,
		Status:    "pending",
		StartTime: time.Now(),
		Progress:  0,
	}

	// 生成任务ID
	taskID := fmt.Sprintf("%s:%s", requestID, stepID)

	// 注册任务
	e.mu.Lock()
	e.runningTasks[taskID] = task
	e.mu.Unlock()

	// 启动异步执行
	go func() {
		// 获取信号量
		e.semaphore <- struct{}{}
		defer func() { <-e.semaphore }()

		// 更新状态为运行中
		e.mu.Lock()
		task.Status = "running"
		task.Progress = 10
		e.mu.Unlock()

		// 执行步骤
		result, err := executeFunc()

		// 记录结束时间
		endTime := time.Now()
		task.EndTime = &endTime
		task.ElapsedMS = endTime.Sub(task.StartTime).Milliseconds()

		e.mu.Lock()
		defer e.mu.Unlock()

		if err != nil {
			task.Status = "failed"
			task.Error = err.Error()
			task.Progress = 0
		} else {
			task.Status = "completed"
			task.Result = result
			task.Progress = 100
		}

		// 移动到已完成队列
		delete(e.runningTasks, taskID)
		e.completedTasks[taskID] = task
	}()

	return task
}

// GetTask 获取任务状态
func (e *AsyncExecutor) GetTask(requestID, stepID string) *AsyncTask {
	taskID := fmt.Sprintf("%s:%s", requestID, stepID)

	e.mu.RLock()
	defer e.mu.RUnlock()

	// 先查找运行中的任务
	if task, ok := e.runningTasks[taskID]; ok {
		return task
	}

	// 再查找已完成的任务
	if task, ok := e.completedTasks[taskID]; ok {
		return task
	}

	return nil
}

// WaitForTask 等待任务完成
func (e *AsyncExecutor) WaitForTask(requestID, stepID string, timeout time.Duration) (*AsyncTask, error) {
	taskID := fmt.Sprintf("%s:%s", requestID, stepID)
	deadline := time.Now().Add(timeout)

	for {
		e.mu.RLock()
		task, exists := e.completedTasks[taskID]
		e.mu.RUnlock()

		if exists {
			return task, nil
		}

		// 检查超时
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("task %s timeout after %v", taskID, timeout)
		}

		// 短暂等待后重试
		time.Sleep(100 * time.Millisecond)
	}
}

// ListRunningTasks 列出运行中的任务
func (e *AsyncExecutor) ListRunningTasks() []*AsyncTask {
	e.mu.RLock()
	defer e.mu.RUnlock()

	tasks := make([]*AsyncTask, 0, len(e.runningTasks))
	for _, task := range e.runningTasks {
		tasks = append(tasks, task)
	}

	return tasks
}

// CleanupCompletedTasks 清理已完成的任务
func (e *AsyncExecutor) CleanupCompletedTasks(olderThan time.Duration) int {
	e.mu.Lock()
	defer e.mu.Unlock()

	cutoff := time.Now().Add(-olderThan)
	cleaned := 0

	for taskID, task := range e.completedTasks {
		if task.EndTime != nil && task.EndTime.Before(cutoff) {
			delete(e.completedTasks, taskID)
			cleaned++
		}
	}

	return cleaned
}

// GetStats 获取执行器统计信息
func (e *AsyncExecutor) GetStats() map[string]interface{} {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return map[string]interface{}{
		"max_concurrent":    e.maxConcurrent,
		"running_tasks":     len(e.runningTasks),
		"completed_tasks":   len(e.completedTasks),
		"available_workers": e.maxConcurrent - len(e.runningTasks),
	}
}

// AsyncWorkflowResult 异步工作流执行结果
type AsyncWorkflowResult struct {
	RequestID      string                 `json:"request_id"`
	Status         string                 `json:"status"` // running, completed, failed
	TotalSteps     int                    `json:"total_steps"`
	CompletedSteps int                    `json:"completed_steps"`
	RunningSteps   []string               `json:"running_steps,omitempty"`
	FailedSteps    []string               `json:"failed_steps,omitempty"`
	ElapsedMS      int64                  `json:"elapsed_ms"`
	Progress       int                    `json:"progress"` // 0-100
	AsyncTasks     map[string]*AsyncTask  `json:"async_tasks,omitempty"`
}

// ExecuteAsyncWorkflow 异步执行整个工作流
func (e *AsyncExecutor) ExecuteAsyncWorkflow(requestID string, workflow *Workflow, executeFunc func() (*WorkflowResult, error)) *AsyncWorkflowResult {
	result := &AsyncWorkflowResult{
		RequestID:    requestID,
		Status:       "running",
		TotalSteps:   len(workflow.Steps),
		RunningSteps: []string{},
		FailedSteps:  []string{},
		AsyncTasks:   make(map[string]*AsyncTask),
	}

	// 启动异步执行
	go func() {
		workflowResult, err := executeFunc()

		if err != nil {
			result.Status = "failed"
			if workflowResult != nil {
				result.FailedSteps = []string{workflowResult.FailedStepID}
				result.CompletedSteps = workflowResult.CompletedSteps
				result.ElapsedMS = workflowResult.ElapsedMS
			}
		} else {
			result.Status = "completed"
			result.CompletedSteps = workflowResult.CompletedSteps
			result.ElapsedMS = workflowResult.ElapsedMS
			result.Progress = 100
		}
	}()

	return result
}

// AsyncWorkflowExecutionLog 异步工作流执行日志扩展
type AsyncWorkflowExecutionLog struct {
	models.WorkflowExecutionLog
	AsyncTasksJSON string `json:"async_tasks_json" gorm:"type:text"`
}

// SaveAsyncExecutionLog 保存异步执行日志
func SaveAsyncExecutionLog(log *models.WorkflowExecutionLog, asyncTasks map[string]*AsyncTask) error {
	if len(asyncTasks) == 0 {
		return nil
	}

	// 序列化异步任务信息
	tasksJSON, err := json.Marshal(asyncTasks)
	if err != nil {
		return fmt.Errorf("failed to marshal async tasks: %w", err)
	}

	// 存储到扩展字段（可以存储到 step_logs_json 的某个键下）
	// 或者创建单独的异步任务日志表
	_ = tasksJSON // 预留扩展点

	return nil
}

// Global async executor instance
var globalAsyncExecutor *AsyncExecutor
var asyncExecutorOnce sync.Once

// GetAsyncExecutor 获取全局异步执行器
func GetAsyncExecutor() *AsyncExecutor {
	asyncExecutorOnce.Do(func() {
		globalAsyncExecutor = NewAsyncExecutor(20) // 默认最大20个并发任务
	})
	return globalAsyncExecutor
}
