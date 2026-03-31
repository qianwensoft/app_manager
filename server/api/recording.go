package api

import (
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/screen"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

func StartRecording(c *gin.Context) {
	param := c.Param("id")
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法录屏"})
		return
	}
	devID, ok := agent.ResolveDeviceID(param)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解析设备 ID"})
		return
	}
	screen.PublishRecordingProgress(devID, "server_recording_prepare", nil)
	needStart := screen.RecordingBegun(routeKey)
	if needStart {
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "start_screen",
		})
	}
	if err := screen.StartServerRecording(routeKey, devID); err != nil {
		needStop := screen.RecordingUndo(routeKey)
		if needStop {
			_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
				"type":   "command",
				"action": "stop_screen",
			})
		}
		screen.PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "服务器录屏已开始"})
}

func StopRecording(c *gin.Context) {
	param := c.Param("id")
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if devID, ok := agent.ResolveDeviceID(param); ok {
		screen.PublishRecordingProgress(devID, "server_recording_stop", nil)
	}
	screen.StopServerRecording(routeKey)
	needStop := screen.RecordingEnded(routeKey)
	if needStop {
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "stop_screen",
		})
	}
	c.JSON(http.StatusOK, gin.H{"message": "服务器录屏已停止，正在编码保存"})
}

// AgentRecordingUpload Agent 停止本地录屏后上传 MP4，写入 recordings 表供 Web 下载。
func AgentRecordingUpload(c *gin.Context) {
	// 大文件写入临时文件；仅少量元数据进内存
	if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "multipart too large or invalid"})
		return
	}
	token := c.GetHeader("X-Device-Token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing X-Device-Token"})
		return
	}
	var device models.Device
	if err := database.DB.Where("agent_token = ? OR serial = ?", token, "agent-"+token).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		screen.PublishRecordingProgress(device.ID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	screen.PublishRecordingProgress(device.ID, "uploading", map[string]interface{}{
		"file_name": file.Filename,
		"size":      file.Size,
	})
	dir := filepath.Join(config.C.Storage.Path, "recordings")
	if err := os.MkdirAll(dir, 0755); err != nil {
		screen.PublishRecordingProgress(device.ID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".mp4"
	}
	saveName := fmt.Sprintf("device_%d_%d%s", device.ID, time.Now().UnixMilli(), ext)
	savePath := filepath.Join(dir, saveName)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		screen.PublishRecordingProgress(device.ID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	fi, err := os.Stat(savePath)
	if err != nil {
		screen.PublishRecordingProgress(device.ID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rec := models.Recording{
		DeviceID:  device.ID,
		FileName:  file.Filename,
		FilePath:  savePath,
		FileSize:  fi.Size(),
		CreatedBy: 0,
	}
	if err := database.DB.Create(&rec).Error; err != nil {
		_ = os.Remove(savePath)
		screen.PublishRecordingProgress(device.ID, "failed", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	pub := recordingStompPayload(rec)
	screen.PublishRecordingProgress(device.ID, "saved", map[string]interface{}{"recording": pub})
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

// recordingStompPayload 推 STOMP 时不带服务器本地路径。
func recordingStompPayload(r models.Recording) gin.H {
	return gin.H{
		"id":         r.ID,
		"device_id":  r.DeviceID,
		"file_name":  r.FileName,
		"file_size":  r.FileSize,
		"duration":   r.Duration,
		"created_by": r.CreatedBy,
		"created_at": r.CreatedAt,
	}
}

func ListRecordings(c *gin.Context) {
	deviceID := c.Query("device_id")
	var recordings []models.Recording
	query := database.DB.Order("created_at DESC")
	if deviceID != "" {
		query = query.Where("device_id = ?", deviceID)
	}
	query.Find(&recordings)
	c.JSON(http.StatusOK, gin.H{"data": recordings})
}

type renameRecordingBody struct {
	FileName string `json:"file_name" binding:"required"`
}

// sanitizeRecordingDisplayName 用户可见的下载/播放展示名；不落盘改路径，仅更新 DB 的 file_name。
func sanitizeRecordingDisplayName(raw string, fallbackExt string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("文件名不能为空")
	}
	if strings.ContainsRune(s, '\x00') {
		return "", fmt.Errorf("文件名含有非法字符")
	}
	base := filepath.Base(s)
	base = strings.ReplaceAll(base, "/", "_")
	base = strings.ReplaceAll(base, "\\", "_")
	if base == "." || base == ".." || strings.Contains(base, "..") {
		return "", fmt.Errorf("非法文件名")
	}
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	stem = strings.TrimSpace(stem)
	if stem == "" {
		return "", fmt.Errorf("文件名不能为空")
	}
	if fallbackExt != "" && !strings.HasPrefix(fallbackExt, ".") {
		fallbackExt = "." + fallbackExt
	}
	if ext == "" {
		if fallbackExt != "" {
			ext = fallbackExt
		} else {
			ext = ".mp4"
		}
	}
	out := stem + ext
	if utf8.RuneCountInString(out) > 255 {
		rs := []rune(out)
		out = string(rs[:255])
	}
	return out, nil
}

func RenameRecording(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的录屏 ID"})
		return
	}
	var body renameRecordingBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 file_name"})
		return
	}
	var rec models.Recording
	if err := database.DB.First(&rec, uint(id64)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏文件不存在"})
		return
	}
	newName, err := sanitizeRecordingDisplayName(body.FileName, filepath.Ext(rec.FileName))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&rec).Update("file_name", newName).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rec.FileName = newName
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

func DownloadRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var recording models.Recording
	if err := database.DB.First(&recording, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏文件不存在"})
		return
	}
	c.FileAttachment(recording.FilePath, recording.FileName)
}

// StreamRecording 在线播放：支持 Range（拖动进度），Content-Disposition: inline。
func StreamRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var recording models.Recording
	if err := database.DB.First(&recording, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏文件不存在"})
		return
	}
	f, err := os.Open(recording.FilePath)
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
	base := filepath.Base(recording.FileName)
	ext := strings.ToLower(filepath.Ext(base))
	ctype := "video/mp4"
	switch ext {
	case ".webm":
		ctype = "video/webm"
	case ".mkv":
		ctype = "video/x-matroska"
	case ".mov":
		ctype = "video/quicktime"
	}
	c.Header("Content-Type", ctype)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, strings.ReplaceAll(base, `"`, ``)))
	c.Header("Accept-Ranges", "bytes")
	http.ServeContent(c.Writer, c.Request, base, st.ModTime(), f)
}

func DeleteRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var recording models.Recording
	if err := database.DB.First(&recording, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏文件不存在"})
		return
	}
	os.Remove(recording.FilePath)
	database.DB.Delete(&recording)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}
