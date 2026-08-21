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
	q := database.DB
	if c.GetString("role") != "admin" {
		q = q.Where("uploaded_by = ?", c.GetUint("user_id"))
	}
	q.Find(&apps)
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

// UpdateAppMeta 更新 APK 元信息（名称和描述）。
func UpdateAppMeta(c *gin.Context) {
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = strings.TrimSpace(req.Name)
	}
	if req.Description != "" || c.Request.ContentLength > 0 {
		// 允许清空描述
		updates["description"] = trimAppDescription(req.Description)
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&app).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
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
		DeviceIDs         []uint `json:"device_ids" binding:"required"`
		StartAfterInstall *bool  `json:"start_after_install"` // 默认 true：与历史行为一致
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	startAfter := true
	if req.StartAfterInstall != nil {
		startAfter = *req.StartAfterInstall
	}
	var app models.App
	if err := database.DB.First(&app, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return
	}
	var tasks []models.InstallTask
	for _, deviceID := range req.DeviceIDs {
		t := models.InstallTask{
			AppID:             app.ID,
			DeviceID:          deviceID,
			Action:            "install",
			Status:            "pending",
			StartAfterInstall: startAfter,
			AgentFetchToken:   randomInstallFetchToken(),
			CreatedBy:         c.GetUint("user_id"),
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

	// 构建响应，包含用户名和设备信息
	type AuditLogResponse struct {
		ID         uint      `json:"id"`
		UserID     uint      `json:"user_id"`
		Username   string    `json:"username"`
		DeviceID   *uint     `json:"device_id"`
		DeviceName string    `json:"device_name"`
		Action     string    `json:"action"`
		Command    string    `json:"command"`
		IPAddress  string    `json:"ip_address"`
		UserAgent  string    `json:"user_agent"`
		Result     string    `json:"result"`
		CreatedAt  time.Time `json:"created_at"`
	}

	responses := make([]AuditLogResponse, 0, len(logs))
	for _, log := range logs {
		resp := AuditLogResponse{
			ID:        log.ID,
			UserID:    log.UserID,
			DeviceID:  log.DeviceID,
			Action:    log.Action,
			Command:   log.Command,
			IPAddress: log.IPAddress,
			UserAgent: log.UserAgent,
			Result:    log.Result,
			CreatedAt: log.CreatedAt,
		}

		// 查询用户名
		if log.UserID > 0 {
			var user models.User
			if err := database.DB.Select("username").First(&user, log.UserID).Error; err == nil {
				resp.Username = user.Username
			} else {
				resp.Username = fmt.Sprintf("用户#%d", log.UserID)
			}
		} else {
			resp.Username = "系统"
		}

		// 查询设备名
		if log.DeviceID != nil && *log.DeviceID > 0 {
			var device models.Device
			if err := database.DB.Select("name, serial").First(&device, *log.DeviceID).Error; err == nil {
				if device.Name != "" {
					resp.DeviceName = device.Name
				} else {
					resp.DeviceName = device.Serial
				}
			} else {
				resp.DeviceName = fmt.Sprintf("设备#%d", *log.DeviceID)
			}
		}

		responses = append(responses, resp)
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}
