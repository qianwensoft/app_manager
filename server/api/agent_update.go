package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shogo82148/androidbinary/apk"
)

// AgentUpdateCheckResponse 更新检查响应
type AgentUpdateCheckResponse struct {
	HasUpdate   bool   `json:"hasUpdate"`
	Version     string `json:"version,omitempty"`
	VersionCode int    `json:"versionCode,omitempty"`
	DownloadURL string `json:"downloadUrl,omitempty"`
	Changelog   string `json:"changelog,omitempty"`
}

// AgentUpdateCheck 检查 Agent 更新
func AgentUpdateCheck(c *gin.Context) {
	var latest models.AgentUpdate
	if err := database.DB.Order("version_code DESC, id DESC").First(&latest).Error; err != nil {
		c.JSON(http.StatusOK, AgentUpdateCheckResponse{
			HasUpdate: false,
		})
		return
	}

	c.JSON(http.StatusOK, AgentUpdateCheckResponse{
		HasUpdate:   true,
		Version:     latest.Version,
		VersionCode: latest.VersionCode,
		DownloadURL: fmt.Sprintf("/api/agent-updates/%d/download", latest.ID),
		Changelog:   latest.Changelog,
	})
}

// GetLatestAgentUpdate 获取最新的 Agent 更新
func GetLatestAgentUpdate(c *gin.Context) {
	var latest models.AgentUpdate
	if err := database.DB.Order("version_code DESC, id DESC").First(&latest).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "暂无可用更新"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": latest})
}

// DownloadAgentAPK 下载 Agent APK
func DownloadAgentAPK(c *gin.Context) {
	id := c.Param("id")
	var update models.AgentUpdate
	if err := database.DB.First(&update, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "更新不存在"})
		return
	}

	if _, err := os.Stat(update.FilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}

	c.Header("Content-Type", "application/vnd.android.package-archive")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, update.FileName))
	c.File(update.FilePath)
}

// UploadAgentAPK 上传 Agent APK
func UploadAgentAPK(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件"})
		return
	}

	version := c.PostForm("version")
	changelog := c.PostForm("changelog")

	// 保存文件
	storagePath := config.C.Storage.Path
	if storagePath == "" {
		storagePath = "./uploads"
	}

	destPath := filepath.Join(storagePath, "agent-updates", file.Filename)
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建目录失败"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打开文件失败"})
		return
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建文件失败"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// 解析 APK 获取包名和版本信息
	pkg, err := apk.OpenFile(destPath)
	if err != nil {
		os.Remove(destPath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解析 APK 文件"})
		return
	}
	defer pkg.Close()

	packageName := pkg.PackageName()
	versionName := pkg.Manifest().VersionName.MustString()
	versionCode := int(pkg.Manifest().VersionCode.MustInt32())

	// 如果前端传了 version，使用前端的；否则使用 APK 解析的
	if version == "" {
		version = versionName
	}

	// 创建记录
	update := models.AgentUpdate{
		Version:     version,
		VersionCode: versionCode,
		PackageName: packageName,
		FileName:    file.Filename,
		FilePath:    destPath,
		Changelog:   changelog,
		UploadAt:    time.Now(),
	}

	if err := database.DB.Create(&update).Error; err != nil {
		os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存数据库失败"})
		return
	}

	logAudit(c, "Agent 更新", fmt.Sprintf("上传 Agent APK %s (code: %d)", version, versionCode), nil)
	c.JSON(http.StatusOK, gin.H{"data": update})
}

// ListAgentUpdates 列出所有 Agent 更新
func ListAgentUpdates(c *gin.Context) {
	var updates []models.AgentUpdate
	if err := database.DB.Order("version_code DESC, id DESC").Find(&updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": updates})
}

// DeleteAgentUpdate 删除 Agent 更新
func DeleteAgentUpdate(c *gin.Context) {
	id := c.Param("id")
	var update models.AgentUpdate
	if err := database.DB.First(&update, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "更新不存在"})
		return
	}

	// 删除文件
	if update.FilePath != "" {
		os.Remove(update.FilePath)
	}

	// 删除记录
	if err := database.DB.Delete(&update).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	logAudit(c, "Agent 更新", fmt.Sprintf("删除 Agent APK %s", update.Version), nil)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}
