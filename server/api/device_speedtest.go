package api

import (
	"app-manager/agent"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func randomSpeedtestID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// AgentSpeedTestDownload 供 Agent 拉取测速数据（X-Device-Token）。
func AgentSpeedTestDownload(c *gin.Context) {
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	if _, ok := agent.ResolveDeviceID(token); !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	size, _ := strconv.Atoi(c.DefaultQuery("size", "262144"))
	if size < 1024 {
		size = 1024
	}
	if size > 2*1024*1024 {
		size = 2 * 1024 * 1024
	}
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.Itoa(size))
	c.Status(http.StatusOK)
	// 可压缩的伪随机负载，避免全零被中间层优化
	buf := make([]byte, 65536)
	for i := range buf {
		buf[i] = byte((i * 17) % 251)
	}
	written := 0
	for written < size {
		n := len(buf)
		if written+n > size {
			n = size - written
		}
		if _, err := c.Writer.Write(buf[:n]); err != nil {
			return
		}
		written += n
	}
}

// AgentSpeedTestUpload 供 Agent 上传测速数据（X-Device-Token），丢弃正文只统计大小。
func AgentSpeedTestUpload(c *gin.Context) {
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	if _, ok := agent.ResolveDeviceID(token); !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	n, err := io.Copy(io.Discard, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"bytes": n})
}

// DeviceSpeedTest Web 端触发：WS 往返延迟 + Agent 与服务器 HTTP 上下行吞吐。
func DeviceSpeedTest(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	routeKey, keyErr := agent.AgentConnectionKey(c.Param("id"))
	if keyErr != nil || !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法测速"})
		return
	}
	token := strings.TrimSpace(device.AgentToken)
	if token == "" && strings.HasPrefix(device.Serial, "agent-") {
		token = strings.TrimPrefix(device.Serial, "agent-")
	}
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "设备缺少 Agent Token"})
		return
	}

	ridPing := randomSpeedtestID()
	chPing := agent.RegisterSpeedtestWait(ridPing)
	tPing := time.Now()
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "speed_test_ping",
		"data":   map[string]interface{}{"request_id": ridPing},
	})
	var rttMs int64
	select {
	case rep := <-chPing:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		rttMs = time.Since(tPing).Milliseconds()
	case <-time.After(15 * time.Second):
		agent.ForgetSpeedtestWait(ridPing)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Ping 超时"})
		return
	}

	ridTp := randomSpeedtestID()
	chTp := agent.RegisterSpeedtestWait(ridTp)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "speed_test_throughput",
		"data": map[string]interface{}{
			"request_id":    ridTp,
			"download_path": "/api/agent/speed-test/download?size=262144",
			"upload_path":   "/api/agent/speed-test/upload",
			"payload_bytes": 262144,
		},
	})

	select {
	case rep := <-chTp:
		if rep.Err != "" {
			c.JSON(http.StatusOK, gin.H{
				"rtt_ms": rttMs,
				"error":  rep.Err,
			})
			return
		}
		out := gin.H{
			"rtt_ms":         rttMs,
			"download_ms":    rep.DownloadMs,
			"download_bytes": rep.DownloadBytes,
			"upload_ms":      rep.UploadMs,
			"upload_bytes":   rep.UploadBytes,
			"download_mbps":  speedMbps(rep.DownloadBytes, rep.DownloadMs),
			"upload_mbps":    speedMbps(rep.UploadBytes, rep.UploadMs),
		}
		c.JSON(http.StatusOK, out)
	case <-time.After(120 * time.Second):
		agent.ForgetSpeedtestWait(ridTp)
		c.JSON(http.StatusGatewayTimeout, gin.H{
			"rtt_ms": rttMs,
			"error":  "吞吐测速超时",
		})
	}
}

func speedMbps(bytes int64, ms int64) float64 {
	if ms <= 0 {
		return 0
	}
	return float64(bytes) * 8 / 1e6 / (float64(ms) / 1000)
}
