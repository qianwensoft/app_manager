package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// AgentInstallApkDownload Agent 凭 X-Device-Token + 任务 token 下载待安装的 APK（无 JWT）。
func AgentInstallApkDownload(c *gin.Context) {
	taskIDStr := strings.TrimSpace(c.Query("task_id"))
	token := strings.TrimSpace(c.Query("token"))
	if taskIDStr == "" || token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing task_id or token"})
		return
	}
	tid64, err := strconv.ParseUint(taskIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task_id"})
		return
	}
	tid := uint(tid64)

	var t models.InstallTask
	if err := database.DB.First(&t, tid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if t.Action != "install" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not an install task"})
		return
	}
	if t.AgentFetchToken == "" || t.AgentFetchToken != token {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid token"})
		return
	}
	devTok := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if devTok == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	var cnt int64
	database.DB.Model(&models.Device{}).
		Where("id = ? AND (agent_token = ? OR serial = ?)", t.DeviceID, devTok, "agent-"+devTok).
		Count(&cnt)
	if cnt == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "device token mismatch"})
		return
	}

	var app models.App
	if err := database.DB.First(&app, t.AppID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return
	}
	if _, err := os.Stat(app.FilePath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "apk file missing"})
		return
	}
	c.Header("Content-Type", "application/vnd.android.package-archive")
	c.File(app.FilePath)
}
