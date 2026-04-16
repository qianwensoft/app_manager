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
	"os/exec"
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
	logAudit(c, "开始录屏", fmt.Sprintf("设备 %s 开始录屏", param), &devID)
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
	if devID, ok := agent.ResolveDeviceID(param); ok {
		logAudit(c, "停止录屏", fmt.Sprintf("设备 %s 停止录屏", param), &devID)
	}
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
	device, ok := agent.LookupDeviceByConnectionKey(token)
	if !ok {
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
	// 尝试从 MP4 生成 HLS
	if ffmpegPath, err := screen.ResolveFFmpeg(); err == nil {
		hlsDir := filepath.Join(dir, fmt.Sprintf("hls_%d_%d", device.ID, time.Now().UnixMilli()))
		if os.MkdirAll(hlsDir, 0755) == nil {
			hlsCmd := exec.Command(ffmpegPath,
				"-y", "-hide_banner", "-loglevel", "error",
				"-i", savePath,
				"-c", "copy",
				"-hls_time", "4",
				"-hls_playlist_type", "vod",
				"-hls_segment_filename", filepath.Join(hlsDir, "seg_%03d.ts"),
				filepath.Join(hlsDir, "index.m3u8"),
			)
			if hlsErr := hlsCmd.Run(); hlsErr == nil {
				rec.HlsDir = hlsDir
			} else {
				os.RemoveAll(hlsDir)
			}
		}
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
// 支持 JWT 鉴权或 ?share=<token>。
func StreamRecording(c *gin.Context) {
	recording, ok := resolveRecordingWithAuth(c)
	if !ok {
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
	if recording.HlsDir != "" {
		os.RemoveAll(recording.HlsDir)
	}
	database.DB.Delete(&recording)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

// StreamRecordingHls 提供 HLS 播放文件（index.m3u8 和 seg_*.ts）。
// 支持 JWT 鉴权或 ?share=<token>。
func StreamRecordingHls(c *gin.Context) {
	rec, ok := resolveRecordingWithAuth(c)
	if !ok {
		return
	}
	if rec.HlsDir == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "该录屏暂无 HLS 流，请使用 MP4 播放"})
		return
	}
	filename := c.Param("file")
	// 防路径穿越
	if strings.Contains(filename, "..") || strings.ContainsRune(filename, '/') {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法路径"})
		return
	}
	filePath := filepath.Join(rec.HlsDir, filename)
	if _, err := os.Stat(filePath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	switch filepath.Ext(filename) {
	case ".m3u8":
		c.Header("Content-Type", "application/vnd.apple.mpegurl")
	case ".ts":
		c.Header("Content-Type", "video/MP2T")
	}
	c.Header("Cache-Control", "no-cache")
	c.File(filePath)
}

// resolveRecordingWithAuth 从路径 :id 或 share token 读取录屏记录。
func resolveRecordingWithAuth(c *gin.Context) (*models.Recording, bool) {
	// 分享 token 优先
	if token := c.Query("share"); token != "" {
		var link models.RecordingShareLink
		if err := database.DB.Where("token = ?", token).First(&link).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "无效分享链接"})
			return nil, false
		}
		if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "分享链接已过期"})
			return nil, false
		}
		var rec models.Recording
		if err := database.DB.First(&rec, link.RecordingID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "录屏不存在"})
			return nil, false
		}
		return &rec, true
	}
	// JWT 鉴权：已通过路由中间件，直接读取
	id, _ := strconv.Atoi(c.Param("id"))
	var rec models.Recording
	if err := database.DB.First(&rec, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏文件不存在"})
		return nil, false
	}
	return &rec, true
}

// CreateRecordingShare 生成录屏分享链接。
func CreateRecordingShare(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var rec models.Recording
	if err := database.DB.First(&rec, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录屏不存在"})
		return
	}
	var req struct {
		ExpiresIn int `json:"expires_in"` // 分钟，0=永不过期
	}
	c.ShouldBindJSON(&req)

	var expiresAt *time.Time
	if req.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(req.ExpiresIn) * time.Minute)
		expiresAt = &t
	}
	link := models.RecordingShareLink{
		RecordingID: rec.ID,
		Token:       generateKey(),
		ExpiresAt:   expiresAt,
		CreatedBy:   c.GetUint("user_id"),
	}
	database.DB.Create(&link)
	c.JSON(http.StatusOK, gin.H{"data": link})
}

// ListRecordingShares 列出某录屏的所有分享链接。
func ListRecordingShares(c *gin.Context) {
	id := c.Param("id")
	var links []models.RecordingShareLink
	database.DB.Where("recording_id = ?", id).Order("created_at desc").Find(&links)
	c.JSON(http.StatusOK, gin.H{"data": links})
}

// RevokeRecordingShare 删除分享链接。
func RevokeRecordingShare(c *gin.Context) {
	database.DB.Delete(&models.RecordingShareLink{}, c.Param("sid"))
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}
