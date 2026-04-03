package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

func randomUploadToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// CreateUploadLink POST /api/upload-links
func CreateUploadLink(c *gin.Context) {
	var req struct {
		Label     string `json:"label"`
		ExpiresIn int    `json:"expires_in"` // 分钟，0=不过期
	}
	_ = c.ShouldBindJSON(&req)

	link := models.UploadLink{
		Token:     randomUploadToken(),
		Label:     req.Label,
		CreatedBy: c.GetUint("user_id"),
	}
	if req.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(req.ExpiresIn) * time.Minute)
		link.ExpiresAt = &t
	}
	if err := database.DB.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": link})
}

// ListUploadLinks GET /api/upload-links
func ListUploadLinks(c *gin.Context) {
	var links []models.UploadLink
	database.DB.Order("created_at desc").Find(&links)
	c.JSON(http.StatusOK, gin.H{"data": links})
}

// DeleteUploadLink DELETE /api/upload-links/:id
func DeleteUploadLink(c *gin.Context) {
	database.DB.Delete(&models.UploadLink{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetUploadLinkInfo GET /api/upload/:token — 无需登录，返回链接基本信息
func GetUploadLinkInfo(c *gin.Context) {
	var link models.UploadLink
	if err := database.DB.Where("token = ?", c.Param("token")).First(&link).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接不存在"})
		return
	}
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "链接已过期"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"label": link.Label, "expires_at": link.ExpiresAt}})
}

// UploadFileByLink POST /api/upload/:token — 无需登录，上传文件
func UploadFileByLink(c *gin.Context) {
	var link models.UploadLink
	if err := database.DB.Where("token = ?", c.Param("token")).First(&link).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接不存在"})
		return
	}
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "链接已过期"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件"})
		return
	}
	defer file.Close()

	dir := filepath.Join(config.C.Storage.Path, "uploads")
	os.MkdirAll(dir, 0755)
	savePath := filepath.Join(dir, fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(header.Filename)))

	dst, err := os.Create(savePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer dst.Close()

	size, _ := io.Copy(dst, file)

	record := models.UploadedFile{
		LinkID:     link.ID,
		FileName:   header.Filename,
		FilePath:   savePath,
		FileSize:   size,
		UploadedAt: time.Now(),
	}
	database.DB.Create(&record)

	c.JSON(http.StatusOK, gin.H{"ok": true, "file_name": header.Filename, "file_size": size})
}

// ListUploadedFiles GET /api/upload-links/:id/files
func ListUploadedFiles(c *gin.Context) {
	var files []models.UploadedFile
	database.DB.Where("link_id = ?", c.Param("id")).Order("uploaded_at desc").Find(&files)
	c.JSON(http.StatusOK, gin.H{"data": files})
}
