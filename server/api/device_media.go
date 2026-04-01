package api

import (
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	maxScreenshotUploadBytes = 20 << 20
	maxAudioUploadBytes      = 80 << 20
)

func ListDeviceFileHub(c *gin.Context) {
	dev := getDeviceByID(c)
	if dev == nil {
		return
	}
	var recs []models.Recording
	database.DB.Where("device_id = ?", dev.ID).Order("created_at DESC").Find(&recs)
	recOut := make([]gin.H, 0, len(recs))
	for _, r := range recs {
		recOut = append(recOut, gin.H{
			"id": r.ID, "device_id": r.DeviceID, "file_name": r.FileName,
			"file_size": r.FileSize, "duration": r.Duration, "created_at": r.CreatedAt,
			"kind": "recording",
		})
	}
	var media []models.DeviceMedia
	database.DB.Where("device_id = ?", dev.ID).Order("created_at DESC").Find(&media)
	mediaOut := make([]gin.H, 0, len(media))
	for _, m := range media {
		mediaOut = append(mediaOut, gin.H{
			"id": m.ID, "device_id": m.DeviceID, "category": m.Category,
			"file_name": m.FileName, "file_size": m.FileSize,
			"content_type": m.ContentType, "created_at": m.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"recordings": recOut, "media": mediaOut}})
}

func UploadDeviceMedia(c *gin.Context) {
	param := c.Param("id")
	var dev models.Device
	if err := agent.DeviceScope(param).First(&dev).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "设备不存在"})
		return
	}
	// 支持Agent token或用户token认证
	authHeader := c.GetHeader("Authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")
	isAgent := (token == dev.AgentToken)
	if !isAgent {
		// 用户token认证：需要admin或operator角色
		role, exists := c.Get("role")
		if !exists || (role != "admin" && role != "operator") {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
	}
	if err := c.Request.ParseMultipartForm(maxAudioUploadBytes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "multipart 无效或过大"})
		return
	}
	category := strings.TrimSpace(strings.ToLower(c.PostForm("category")))
	if category != "screenshot" && category != "audio" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category 须为 screenshot 或 audio"})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var maxSz int64 = maxAudioUploadBytes
	if category == "screenshot" {
		maxSz = maxScreenshotUploadBytes
	}
	if fh.Size > maxSz {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件过大"})
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少扩展名"})
		return
	}
	if !allowedExtForMediaCategory(category, ext) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的文件类型"})
		return
	}
	dir := filepath.Join(config.C.Storage.Path, "device_media", fmt.Sprintf("device_%d", dev.ID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	saveName := fmt.Sprintf("%d_%d%s", dev.ID, time.Now().UnixMilli(), ext)
	savePath := filepath.Join(dir, saveName)
	src, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer src.Close()
	dst, err := os.OpenFile(savePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, copyErr := io.Copy(dst, io.LimitReader(src, maxSz+1))
	dst.Close()
	if copyErr != nil {
		_ = os.Remove(savePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": copyErr.Error()})
		return
	}
	if n > maxSz {
		_ = os.Remove(savePath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件过大"})
		return
	}
	peek := make([]byte, 512)
	f2, _ := os.Open(savePath)
	var ctype string
	if f2 != nil {
		k, _ := f2.Read(peek)
		f2.Close()
		if k > 0 {
			ctype = http.DetectContentType(peek[:k])
		}
	}
	if ctype == "" || ctype == "application/octet-stream" {
		ctype = contentTypeByExt(fh.Filename)
	}
	row := models.DeviceMedia{
		DeviceID:    dev.ID,
		Category:    category,
		FileName:    fh.Filename,
		FilePath:    savePath,
		FileSize:    n,
		ContentType: ctype,
	}
	if err := database.DB.Create(&row).Error; err != nil {
		_ = os.Remove(savePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"id": row.ID, "device_id": row.DeviceID, "category": row.Category,
		"file_name": row.FileName, "file_size": row.FileSize,
		"content_type": row.ContentType, "created_at": row.CreatedAt,
	}})
}

func allowedExtForMediaCategory(category, ext string) bool {
	switch category {
	case "screenshot":
		switch ext {
		case ".png", ".jpg", ".jpeg", ".webp":
			return true
		}
	case "audio":
		switch ext {
		case ".m4a", ".mp3", ".wav", ".aac", ".ogg", ".flac":
			return true
		}
	}
	return false
}

func contentTypeByExt(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".wav":
		return "audio/wav"
	case ".aac":
		return "audio/aac"
	case ".ogg":
		return "audio/ogg"
	case ".flac":
		return "audio/flac"
	default:
		return "application/octet-stream"
	}
}

func loadDeviceMedia(c *gin.Context) (*models.DeviceMedia, bool) {
	id, _ := strconv.Atoi(c.Param("id"))
	var m models.DeviceMedia
	if err := database.DB.First(&m, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return nil, false
	}
	return &m, true
}

func DownloadDeviceMedia(c *gin.Context) {
	m, ok := loadDeviceMedia(c)
	if !ok {
		return
	}
	c.FileAttachment(m.FilePath, m.FileName)
}

func StreamDeviceMedia(c *gin.Context) {
	m, ok := loadDeviceMedia(c)
	if !ok {
		return
	}
	f, err := os.Open(m.FilePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件无法读取"})
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	base := filepath.Base(m.FileName)
	ctype := m.ContentType
	if ctype == "" {
		ctype = contentTypeByExt(base)
	}
	c.Header("Content-Type", ctype)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, strings.ReplaceAll(base, `"`, ``)))
	c.Header("Accept-Ranges", "bytes")
	http.ServeContent(c.Writer, c.Request, base, st.ModTime(), f)
}

func DeleteDeviceMedia(c *gin.Context) {
	m, ok := loadDeviceMedia(c)
	if !ok {
		return
	}
	_ = os.Remove(m.FilePath)
	database.DB.Delete(m)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

func RenameDeviceMedia(c *gin.Context) {
	m, ok := loadDeviceMedia(c)
	if !ok {
		return
	}
	var req struct {
		FileName string `json:"file_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	m.FileName = strings.TrimSpace(req.FileName)
	if m.FileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件名不能为空"})
		return
	}
	if err := database.DB.Save(m).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "重命名成功"})
}
