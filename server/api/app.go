package api

import (
	"app-manager/adb"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/task"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const maxAppDescriptionRunes = 4000

func trimAppDescription(s string) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= maxAppDescriptionRunes {
		return s
	}
	r := []rune(s)
	return string(r[:maxAppDescriptionRunes])
}

func randomInstallFetchToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func UploadApp(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}
	defer file.Close()

	if filepath.Ext(header.Filename) != ".apk" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .apk files allowed"})
		return
	}

	os.MkdirAll(config.C.Storage.Path, 0755)
	savePath := filepath.Join(config.C.Storage.Path, fmt.Sprintf("%d_%s", time.Now().Unix(), header.Filename))

	dst, err := os.Create(savePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer dst.Close()

	h := md5.New()
	w := io.MultiWriter(dst, h)
	size, _ := io.Copy(w, file)
	md5sum := fmt.Sprintf("%x", h.Sum(nil))

	app := models.App{
		Name:        header.Filename,
		FilePath:    savePath,
		FileSize:    size,
		MD5:         md5sum,
		Description: trimAppDescription(c.PostForm("description")),
		UploadedBy:  c.GetUint("user_id"),
	}
	// 解析 APK 元数据（aapt 或纯 Go 读 Manifest，保证常规 APK 能拿到包名）
	if info, err := adb.ParseAPKWithAapt(savePath); err == nil && info != nil {
		app.PackageName = info.PackageName
		app.VersionName = info.VersionName
		app.VersionCode = info.VersionCode
	}
	database.DB.Create(&app)
	c.JSON(http.StatusOK, gin.H{"data": app})
}

func ListApps(c *gin.Context) {
	var apps []models.App
	database.DB.Find(&apps)
	c.JSON(http.StatusOK, gin.H{"data": apps})
}

func GetApp(c *gin.Context) {
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": app})
}

// UpdateAppMeta 更新 APK 元信息（当前仅支持描述）。
func UpdateAppMeta(c *gin.Context) {
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&app).Update("description", trimAppDescription(req.Description)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.First(&app, app.ID).Error
	c.JSON(http.StatusOK, gin.H{"data": app})
}

func DeleteApp(c *gin.Context) {
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	os.Remove(app.FilePath)
	database.DB.Delete(&app)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func InstallApp(c *gin.Context) {
	var req struct {
		DeviceIDs []uint `json:"device_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return
	}
	var tasks []models.InstallTask
	for _, deviceID := range req.DeviceIDs {
		t := models.InstallTask{
			AppID:           app.ID,
			DeviceID:        deviceID,
			Action:          "install",
			Status:          "pending",
			AgentFetchToken: randomInstallFetchToken(),
			CreatedBy:       c.GetUint("user_id"),
		}
		database.DB.Create(&t)
		task.Q.Submit(t.ID)
		tasks = append(tasks, t)
	}
	c.JSON(http.StatusOK, gin.H{"data": tasks})
}

func UninstallApp(c *gin.Context) {
	var req struct {
		DeviceIDs []uint `json:"device_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return
	}
	var tasks []models.InstallTask
	for _, deviceID := range req.DeviceIDs {
		t := models.InstallTask{
			AppID:     app.ID,
			DeviceID:  deviceID,
			Action:    "uninstall",
			Status:    "pending",
			CreatedBy: c.GetUint("user_id"),
		}
		database.DB.Create(&t)
		task.Q.Submit(t.ID)
		tasks = append(tasks, t)
	}
	c.JSON(http.StatusOK, gin.H{"data": tasks})
}

func ListTasks(c *gin.Context) {
	var tasks []models.InstallTask
	database.DB.Order("created_at desc").Limit(100).Find(&tasks)
	c.JSON(http.StatusOK, gin.H{"data": tasks})
}

func GetTask(c *gin.Context) {
	var t models.InstallTask
	if err := database.DB.First(&t, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": t})
}

func CancelTask(c *gin.Context) {
	database.DB.Model(&models.InstallTask{}).
		Where("id = ? AND status = 'pending'", c.Param("id")).
		Update("status", "cancelled")
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func ListAuditLogs(c *gin.Context) {
	var logs []models.AuditLog
	database.DB.Order("created_at desc").Limit(200).Find(&logs)
	c.JSON(http.StatusOK, gin.H{"data": logs})
}
