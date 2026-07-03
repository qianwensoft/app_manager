package api

import (
	"net/http"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// ListCompensationDeadLetters 列出补偿死信队列
func ListCompensationDeadLetters(c *gin.Context) {
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
	db := database.DB.Model(&models.CompensationDeadLetter{})

	if query.InterfaceCode != "" {
		db = db.Where("interface_code = ?", query.InterfaceCode)
	}

	if query.Status != "" {
		db = db.Where("status = ?", query.Status)
	}

	// Get total count
	var totalCount int64
	db.Count(&totalCount)

	// Get dead letters
	var deadLetters []models.CompensationDeadLetter
	if err := db.Order("created_at DESC").
		Limit(query.Limit).
		Offset(query.Offset).
		Find(&deadLetters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"data":   deadLetters,
		"total":  totalCount,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

// GetCompensationDeadLetter 获取单个死信记录
func GetCompensationDeadLetter(c *gin.Context) {
	id := c.Param("id")

	var deadLetter models.CompensationDeadLetter
	if err := database.DB.First(&deadLetter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dead letter not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": deadLetter,
	})
}

// RetryCompensationDeadLetter 重试补偿死信
func RetryCompensationDeadLetter(c *gin.Context) {
	id := c.Param("id")

	var deadLetter models.CompensationDeadLetter
	if err := database.DB.First(&deadLetter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dead letter not found"})
		return
	}

	// Check if already processed
	if deadLetter.Status == "processed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dead letter already processed"})
		return
	}

	// Parse compensation step from SQL and datasource
	// The compensation info is stored in CompensationSQL and Datasource fields
	compStep := map[string]interface{}{
		"type":       "sql",
		"datasource": deadLetter.Datasource,
		"sql":        deadLetter.CompensationSQL,
	}

	// TODO: Execute the compensation step
	// For now, just mark as retrying

	// Update retry count and status
	deadLetter.RetryCount++
	deadLetter.Status = "retrying"
	deadLetter.NextRetryAt = time.Now().Add(5 * time.Minute)

	if err := database.DB.Save(&deadLetter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":                true,
		"message":           "Compensation retry scheduled",
		"data":              deadLetter,
		"compensation_step": compStep,
	})
}

// MarkCompensationDeadLetterProcessed 标记死信为已处理
func MarkCompensationDeadLetterProcessed(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Note string `json:"note"`
	}
	c.ShouldBindJSON(&body)

	var deadLetter models.CompensationDeadLetter
	if err := database.DB.First(&deadLetter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dead letter not found"})
		return
	}

	now := time.Now()
	deadLetter.Status = "processed"
	deadLetter.ResolvedAt = &now

	// Append note to resolve note
	if body.Note != "" {
		deadLetter.ResolveNote = body.Note
	}

	if err := database.DB.Save(&deadLetter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Dead letter marked as processed",
		"data":    deadLetter,
	})
}

// DeleteCompensationDeadLetter 删除死信记录
func DeleteCompensationDeadLetter(c *gin.Context) {
	id := c.Param("id")

	result := database.DB.Delete(&models.CompensationDeadLetter{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dead letter not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Dead letter deleted",
	})
}

// BatchDeleteCompensationDeadLetters 批量删除死信记录
func BatchDeleteCompensationDeadLetters(c *gin.Context) {
	var body struct {
		IDs []uint `json:"ids"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No IDs provided"})
		return
	}

	result := database.DB.Where("id IN ?", body.IDs).Delete(&models.CompensationDeadLetter{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Dead letters deleted",
		"deleted": result.RowsAffected,
	})
}

// GetCompensationDeadLetterStats 获取死信队列统计
func GetCompensationDeadLetterStats(c *gin.Context) {
	type Stats struct {
		TotalCount     int64 `json:"total_count"`
		PendingCount   int64 `json:"pending_count"`
		RetryingCount  int64 `json:"retrying_count"`
		ProcessedCount int64 `json:"processed_count"`
		FailedCount    int64 `json:"failed_count"`
	}

	stats := Stats{}

	// Total count
	database.DB.Model(&models.CompensationDeadLetter{}).Count(&stats.TotalCount)

	// Pending count
	database.DB.Model(&models.CompensationDeadLetter{}).
		Where("status = ?", "pending").
		Count(&stats.PendingCount)

	// Retrying count
	database.DB.Model(&models.CompensationDeadLetter{}).
		Where("status = ?", "retrying").
		Count(&stats.RetryingCount)

	// Processed count
	database.DB.Model(&models.CompensationDeadLetter{}).
		Where("status = ?", "processed").
		Count(&stats.ProcessedCount)

	// Failed count
	database.DB.Model(&models.CompensationDeadLetter{}).
		Where("status = ?", "failed").
		Count(&stats.FailedCount)

	c.JSON(http.StatusOK, gin.H{
		"ok":   true,
		"data": stats,
	})
}

// PurgeProcessedDeadLetters 清理已处理的死信记录
func PurgeProcessedDeadLetters(c *gin.Context) {
	var body struct {
		OlderThanDays int `json:"older_than_days"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.OlderThanDays <= 0 {
		body.OlderThanDays = 30 // Default: 30 days
	}

	cutoffDate := time.Now().AddDate(0, 0, -body.OlderThanDays)

	result := database.DB.Where("status = ? AND resolved_at < ?", "processed", cutoffDate).
		Delete(&models.CompensationDeadLetter{})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Processed dead letters purged",
		"deleted": result.RowsAffected,
	})
}
