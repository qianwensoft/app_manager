package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxPulledApkBytes = 512 << 20

func deviceIDFromAgentToken(c *gin.Context) (uint, bool) {
	devTok := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if devTok == "" {
		return 0, false
	}
	var dev models.Device
	if err := database.DB.Where("agent_token = ? OR serial = ?", devTok, "agent-"+devTok).First(&dev).Error; err != nil {
		return 0, false
	}
	return dev.ID, true
}

// AgentPulledApkUpload Agent 将端上读取的 APK/zip 流上传到此接口（凭 X-Device-Token，无 JWT）。
// 失败时可用 Content-Type: application/json 上报 {"error":"..."}。
func AgentPulledApkUpload(c *gin.Context) {
	rid := strings.TrimSpace(c.Query("request_id"))
	if rid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing request_id"})
		return
	}
	deviceID, ok := deviceIDFromAgentToken(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing X-Device-Token"})
		return
	}

	ct := strings.ToLower(strings.TrimSpace(strings.Split(c.GetHeader("Content-Type"), ";")[0]))
	if ct == "application/json" {
		var body struct {
			Error string `json:"error"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		errStr := strings.TrimSpace(body.Error)
		if errStr == "" {
			errStr = "导出 APK 失败"
		}
		agent.DeliverPulledApkResult(rid, deviceID, "", errStr, "")
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	exportName := sanitizeExportFilename(c.GetHeader("X-Export-Filename"))

	tmp, err := os.CreateTemp("", "pulled-apk-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	tmpPath := tmp.Name()
	limited := http.MaxBytesReader(c.Writer, c.Request.Body, maxPulledApkBytes)
	_, copyErr := io.Copy(tmp, limited)
	closeErr := tmp.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		e := copyErr.Error()
		if strings.Contains(e, "http: request body too large") {
			agent.DeliverPulledApkResult(rid, deviceID, "", "上传体积超过限制（最大约 512MB）", "")
		} else {
			agent.DeliverPulledApkResult(rid, deviceID, "", e, "")
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		agent.DeliverPulledApkResult(rid, deviceID, "", closeErr.Error(), "")
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	fi, statErr := os.Stat(tmpPath)
	if statErr != nil || fi.Size() == 0 {
		_ = os.Remove(tmpPath)
		agent.DeliverPulledApkResult(rid, deviceID, "", "空文件", "")
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	agent.DeliverPulledApkResult(rid, deviceID, tmpPath, "", exportName)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func sanitizeExportFilename(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	base := s
	if i := strings.LastIndexAny(s, "/\\"); i >= 0 {
		base = s[i+1:]
	}
	base = strings.Map(func(r rune) rune {
		if r <= 31 || strings.ContainsRune(`:*?"<>|`, r) {
			return '_'
		}
		return r
	}, base)
	if len(base) > 200 {
		base = base[:200]
	}
	return base
}
