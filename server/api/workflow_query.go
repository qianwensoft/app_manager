package api

import (
	"net/http"
	"strconv"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// GetWorkflowExecutionLog 获取单个工作流执行日志
func GetWorkflowExecutionLog(c *gin.Context) {
	requestID := c.Param("request_id")

	var log models.WorkflowExecutionLog
	if err := database.DB.Where("request_id = ?", requestID).First(&log).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Execution log not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": log,
	})
}

// ListWorkflowExecutionLogs 列出工作流执行日志
func ListWorkflowExecutionLogs(c *gin.Context) {
	var query struct {
		InterfaceCode string `form:"interface_code"`
		Status        string `form:"status"`
		Limit         int    `form:"limit"`
		Offset        int    `form:"offset"`
	}

	if err := c.ShouldBindQuery(&query); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set defaults
	if query.Limit <= 0 {
		query.Limit = 20
	}
	if query.Limit > 100 {
		query.Limit = 100
	}

	// Build query
	db := database.DB.Model(&models.WorkflowExecutionLog{})

	if query.InterfaceCode != "" {
		db = db.Where("interface_code = ?", query.InterfaceCode)
	}

	if query.Status != "" {
		db = db.Where("status = ?", query.Status)
	}

	// Get total count
	var totalCount int64
	db.Count(&totalCount)

	// Get logs
	var logs []models.WorkflowExecutionLog
	if err := db.Order("created_at DESC").
		Limit(query.Limit).
		Offset(query.Offset).
		Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"data":   logs,
		"total":  totalCount,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

// GetWorkflowExecutionStats 获取工作流执行统计
func GetWorkflowExecutionStats(c *gin.Context) {
	interfaceCode := c.Query("interface_code")

	type Stats struct {
		TotalExecutions   int64   `json:"total_executions"`
		SuccessCount      int64   `json:"success_count"`
		FailedCount       int64   `json:"failed_count"`
		CompensatedCount  int64   `json:"compensated_count"`
		SuccessRate       float64 `json:"success_rate"`
		AvgElapsedMS      float64 `json:"avg_elapsed_ms"`
		AvgCompletedSteps float64 `json:"avg_completed_steps"`
	}

	stats := Stats{}

	// Build base query
	db := database.DB.Model(&models.WorkflowExecutionLog{})
	if interfaceCode != "" {
		db = db.Where("interface_code = ?", interfaceCode)
	}

	// Total executions
	db.Count(&stats.TotalExecutions)

	// Success count
	database.DB.Model(&models.WorkflowExecutionLog{}).
		Where("status = ?", "success").
		Where(db.Statement.SQL.String()).
		Count(&stats.SuccessCount)

	// Failed count
	database.DB.Model(&models.WorkflowExecutionLog{}).
		Where("status = ?", "failed").
		Where(db.Statement.SQL.String()).
		Count(&stats.FailedCount)

	// Compensated count
	database.DB.Model(&models.WorkflowExecutionLog{}).
		Where("compensated = ?", true).
		Where(db.Statement.SQL.String()).
		Count(&stats.CompensatedCount)

	// Calculate success rate
	if stats.TotalExecutions > 0 {
		stats.SuccessRate = float64(stats.SuccessCount) / float64(stats.TotalExecutions) * 100
	}

	// Average elapsed time
	var avgResult struct {
		AvgElapsed float64
		AvgSteps   float64
	}
	database.DB.Model(&models.WorkflowExecutionLog{}).
		Select("AVG(elapsed_ms) as avg_elapsed, AVG(completed_steps) as avg_steps").
		Where(db.Statement.SQL.String()).
		Scan(&avgResult)

	stats.AvgElapsedMS = avgResult.AvgElapsed
	stats.AvgCompletedSteps = avgResult.AvgSteps

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": stats,
	})
}

// RetryWorkflowExecution 重试失败的工作流执行
func RetryWorkflowExecution(c *gin.Context) {
	requestID := c.Param("request_id")

	// Get original execution log
	var log models.WorkflowExecutionLog
	if err := database.DB.Where("request_id = ?", requestID).First(&log).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Execution log not found"})
		return
	}

	// Can only retry failed or compensated executions
	if log.Status != "failed" && log.Status != "compensated" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Can only retry failed or compensated executions"})
		return
	}

	// Get interface definition
	var iface models.DataInterface
	if err := database.DB.Where("id = ?", log.InterfaceID).First(&iface).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Interface not found"})
		return
	}

	// Parse original parameters (would need to be stored in execution log)
	// For now, return error indicating parameters need to be provided
	c.JSON(http.StatusBadRequest, gin.H{
		"error":   "Retry requires original parameters to be provided",
		"message": "Please execute the workflow again with the same parameters",
	})
}

// GetWorkflowExecutionProgress 获取工作流执行进度（用于长时间运行的工作流）
func GetWorkflowExecutionProgress(c *gin.Context) {
	requestID := c.Param("request_id")

	var log models.WorkflowExecutionLog
	if err := database.DB.Where("request_id = ?", requestID).First(&log).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Execution log not found"})
		return
	}

	progress := gin.H{
		"request_id":      log.RequestID,
		"interface_code":  log.InterfaceCode,
		"status":          log.Status,
		"total_steps":     log.TotalSteps,
		"completed_steps": log.CompletedSteps,
		"progress_pct":    0.0,
		"elapsed_ms":      log.ElapsedMS,
		"created_at":      log.CreatedAt,
	}

	if log.TotalSteps > 0 {
		progress["progress_pct"] = float64(log.CompletedSteps) / float64(log.TotalSteps) * 100
	}

	// Add current step info if still running
	if log.Status == "running" {
		// Would need to track current step in real-time execution
		// For now, just return what we have
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": progress,
	})
}

// DeleteWorkflowExecutionLog 删除工作流执行日志
func DeleteWorkflowExecutionLog(c *gin.Context) {
	requestID := c.Param("request_id")

	result := database.DB.Where("request_id = ?", requestID).Delete(&models.WorkflowExecutionLog{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Execution log not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Execution log deleted",
	})
}

// GetWorkflowExecutionTimeline 获取工作流执行时间线
func GetWorkflowExecutionTimeline(c *gin.Context) {
	requestID := c.Param("request_id")

	var log models.WorkflowExecutionLog
	if err := database.DB.Where("request_id = ?", requestID).First(&log).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Execution log not found"})
		return
	}

	// Parse step logs JSON if needed in the future
	// var stepLogs []map[string]interface{}
	// json.Unmarshal([]byte(log.StepLogsJSON), &stepLogs)

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"data": gin.H{
			"request_id":     log.RequestID,
			"interface_code": log.InterfaceCode,
			"status":         log.Status,
			"started_at":     log.CreatedAt,
			"elapsed_ms":     log.ElapsedMS,
			"step_logs":      log.StepLogsJSON,
		},
	})
}

// GetRecentWorkflowExecutions 获取最近的工作流执行
func GetRecentWorkflowExecutions(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "10")
	limit, _ := strconv.Atoi(limitStr)

	if limit <= 0 || limit > 50 {
		limit = 10
	}

	var logs []models.WorkflowExecutionLog
	if err := database.DB.Order("created_at DESC").
		Limit(limit).
		Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": logs,
	})
}
