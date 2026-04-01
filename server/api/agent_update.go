package api

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

func UploadAgentAPK(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件上传失败"})
		return
	}
	version := c.PostForm("version")
	changelog := c.PostForm("changelog")

	path, err := storage.SaveFile(file, "agent")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	update := models.AgentUpdate{
		Version:   version,
		FilePath:  path,
		Changelog: changelog,
		UploadAt:  time.Now(),
	}
	if err := database.DB.Create(&update).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, update)
}

func ListAgentUpdates(c *gin.Context) {
	var updates []models.AgentUpdate
	if err := database.DB.Order("upload_at DESC").Find(&updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updates)
}

func GetLatestAgentUpdate(c *gin.Context) {
	var update models.AgentUpdate
	if err := database.DB.Order("upload_at DESC").First(&update).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到更新"})
		return
	}
	c.JSON(http.StatusOK, update)
}

func DownloadAgentAPK(c *gin.Context) {
	id := c.Param("id")
	var update models.AgentUpdate
	if err := database.DB.First(&update, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到更新"})
		return
	}
	c.FileAttachment(update.FilePath, filepath.Base(update.FilePath))
}
