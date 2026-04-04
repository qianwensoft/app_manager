package api

import (
	"app-manager/adb"
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

func UploadAgentAPK(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件上传失败: " + err.Error()})
		return
	}

	// 校验文件扩展名
	if ext := filepath.Ext(file.Filename); ext != ".apk" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只允许上传 .apk 文件"})
		return
	}

	version := c.PostForm("version")
	changelog := c.PostForm("changelog")

	// 保存文件
	path, err := storage.SaveFile(file, "agent")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件保存失败: " + err.Error()})
		return
	}

	// 解析 APK 包名与版本信息
	apkInfo, parseErr := adb.ParseAPKWithAapt(path)
	if parseErr == nil && apkInfo != nil {
		if apkInfo.VersionName != "" && version == "" {
			version = apkInfo.VersionName
		}
	}

	update := models.AgentUpdate{
		Version:   version,
		FilePath:  path,
		FileName:  file.Filename,
		Changelog: changelog,
		UploadAt:  time.Now(),
	}
	if apkInfo != nil && parseErr == nil {
		update.PackageName = apkInfo.PackageName
		update.VersionCode = apkInfo.VersionCode
		if version == "" {
			update.Version = apkInfo.VersionName
		}
	}

	if err := database.DB.Create(&update).Error; err != nil {
		// DB 写入失败时清理已保存的文件
		_ = os.Remove(path)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": update})
}

func ListAgentUpdates(c *gin.Context) {
	var updates []models.AgentUpdate
	if err := database.DB.Order("upload_at DESC").Find(&updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": updates})
}

func GetLatestAgentUpdate(c *gin.Context) {
	var update models.AgentUpdate
	if err := database.DB.Order("upload_at DESC").First(&update).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到更新"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": update})
}

func DownloadAgentAPK(c *gin.Context) {
	id := c.Param("id")
	var update models.AgentUpdate
	if err := database.DB.First(&update, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到更新"})
		return
	}
	name := update.FileName
	if name == "" {
		name = filepath.Base(update.FilePath)
	}
	c.FileAttachment(update.FilePath, name)
}
