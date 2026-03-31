package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"crypto/rand"
	"encoding/hex"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const maxAgentPullFileBytes = 50 * 1024 * 1024

func randomFilePullID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// sanitizeAgentFilePath 仅允许常见外部存储路径（Android POSIX）。
func sanitizeAgentFilePath(p string) (string, bool) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", false
	}
	p = path.Clean(p)
	if !strings.HasPrefix(p, "/") {
		return "", false
	}
	allowedPrefixes := []string{
		"/sdcard",
		"/storage/emulated/0",
		"/storage/self/primary",
	}
	for _, pre := range allowedPrefixes {
		if p == pre || strings.HasPrefix(p, pre+"/") {
			return p, true
		}
	}
	return "", false
}

// AgentFilePullUpload Agent 将读取到的文件 POST 到此（X-Device-Token），表单 request_id、file。
func AgentFilePullUpload(c *gin.Context) {
	if err := c.Request.ParseMultipartForm(64 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart"})
		return
	}
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	var cnt int64
	database.DB.Model(&models.Device{}).Where("agent_token = ? OR serial = ?", token, "agent-"+token).Count(&cnt)
	if cnt == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	rid := strings.TrimSpace(c.PostForm("request_id"))
	if rid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing request_id"})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if fh.Size > maxAgentPullFileBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
		return
	}
	src, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer src.Close()

	dir := filepath.Join(os.TempDir(), "agent_file_pulls")
	_ = os.MkdirAll(dir, 0700)
	tmp := filepath.Join(dir, "pull_"+rid)
	dst, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, copyErr := io.Copy(dst, io.LimitReader(src, maxAgentPullFileBytes+1))
	dst.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		c.JSON(http.StatusInternalServerError, gin.H{"error": copyErr.Error()})
		return
	}
	if n > maxAgentPullFileBytes {
		_ = os.Remove(tmp)
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
		return
	}
	agent.DeliverFileReadResult(rid, tmp, "")
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// DeviceAgentPullFile Web 经在线 Agent 拉取设备上的文件（无 ADB 时使用）。
func DeviceAgentPullFile(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	if !device.AllowRemoteFilePull {
		c.JSON(http.StatusForbidden, gin.H{"error": "设备未开启「允许远程拉取文件」，请在 Android Agent 勾选并保存"})
		return
	}
	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	apath, ok := sanitizeAgentFilePath(req.Path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径不合法，仅允许 /sdcard、/storage/emulated/0 等外部存储路径"})
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}
	rid := randomFilePullID()
	ch := agent.RegisterFileReadWait(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "read_file",
		"data": map[string]interface{}{
			"request_id": rid,
			"path":       apath,
		},
	})
	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		if rep.TempPath == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "empty file"})
			return
		}
		defer os.Remove(rep.TempPath)
		base := path.Base(apath)
		if base == "" || base == "." {
			base = "download.bin"
		}
		ctype := mime.TypeByExtension(filepath.Ext(base))
		if ctype == "" {
			ctype = "application/octet-stream"
		}
		c.Header("Content-Type", ctype)
		c.Header("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(base, `"`, ``)+`"`)
		c.File(rep.TempPath)
	case <-time.After(120 * time.Second):
		agent.ForgetFileReadWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "拉取超时"})
	}
}

// DeviceAgentListFiles Web 经在线 Agent 列出设备目录（需允许远程拉取文件）。
func DeviceAgentListFiles(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	if !device.AllowRemoteFilePull {
		c.JSON(http.StatusForbidden, gin.H{"error": "设备未开启「允许远程拉取文件」，请在 Android Agent 勾选并保存"})
		return
	}
	path := strings.TrimSpace(c.Query("path"))
	if path == "" {
		path = "/sdcard"
	}
	apath, ok := sanitizeAgentFilePath(path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径不合法，仅允许 /sdcard、/storage/emulated/0 等外部存储路径"})
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}
	rid := randomFilePullID()
	ch := agent.RegisterListDirWait(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "list_files",
		"data": map[string]interface{}{
			"request_id": rid,
			"path":       apath,
		},
	})
	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"path": apath, "entries": rep.Entries}})
	case <-time.After(35 * time.Second):
		agent.ForgetListDirWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "列出目录超时"})
	}
}
