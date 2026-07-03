package api

import (
	"net/http"
	"time"

	"app-manager/workflow"

	"github.com/gin-gonic/gin"
)

// GetAsyncTaskStatus 获取异步任务状态
func GetAsyncTaskStatus(c *gin.Context) {
	requestID := c.Param("request_id")
	stepID := c.Param("step_id")

	executor := workflow.GetAsyncExecutor()
	task := executor.GetTask(requestID, stepID)

	if task == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": task,
	})
}

// ListRunningAsyncTasks 列出运行中的异步任务
func ListRunningAsyncTasks(c *gin.Context) {
	executor := workflow.GetAsyncExecutor()
	tasks := executor.ListRunningTasks()

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": tasks,
	})
}

// GetAsyncExecutorStats 获取异步执行器统计信息
func GetAsyncExecutorStats(c *gin.Context) {
	executor := workflow.GetAsyncExecutor()
	stats := executor.GetStats()

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": stats,
	})
}

// CleanupAsyncTasks 清理已完成的异步任务
func CleanupAsyncTasks(c *gin.Context) {
	var body struct {
		OlderThanMinutes int `json:"older_than_minutes"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.OlderThanMinutes <= 0 {
		body.OlderThanMinutes = 60 // 默认清理1小时前的任务
	}

	executor := workflow.GetAsyncExecutor()
	cleaned := executor.CleanupCompletedTasks(time.Duration(body.OlderThanMinutes) * time.Minute)

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Async tasks cleaned",
		"cleaned": cleaned,
	})
}
