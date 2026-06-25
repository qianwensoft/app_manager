package api

import (
	"app-manager/agent"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	fsErrPermissionDenied = "permission_denied"
	fsErrPathNotAllowed   = "path_not_allowed"
	fsErrNotFound         = "not_found"
	fsErrNotDir           = "not_dir"
	fsErrTooLarge         = "too_large"
	fsErrIO               = "io_error"
	fsErrInvalidRequest   = "invalid_request"
)

// AgentFsList lists files on the Android Agent side for a given path.
// GET /api/devices/:id/agent/fs/list?path=...
func AgentFsList(c *gin.Context) {
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}

	path := strings.TrimSpace(c.Query("path"))
	if path == "" {
		path = "/storage/emulated/0"
	}
	includeHidden := c.Query("include_hidden") == "1" || strings.EqualFold(c.Query("include_hidden"), "true")
	rid := randomAgentRequestID()
	ch := agent.RegisterFsListWait(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "fs_list",
		"data": map[string]interface{}{
			"request_id":     rid,
			"path":           path,
			"include_hidden": includeHidden,
		},
	})
	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": rep})
	case <-time.After(45 * time.Second):
		agent.ForgetFsListWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "列目录超时"})
	}
}

// AgentFsWS is a browser WebSocket that streams file uploads to Agent via server relay.
// Browser sends:
//   - text JSON: {type:"upload_begin", upload_id, path, file_name, size}
//   - binary frames: raw bytes (chunk)
//   - text JSON: {type:"upload_end", upload_id}
//   - text JSON: {type:"upload_cancel", upload_id}
//
// Server forwards to Agent as command frames:
//   - fs_upload_begin {upload_id, path, file_name, size}
//   - fs_upload_chunk {upload_id, seq, data_base64}
//   - fs_upload_end   {upload_id}
//   - fs_upload_cancel{upload_id}
func AgentFsWS(c *gin.Context) {
	param := c.Param("deviceId")
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}

	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	type sess struct {
		uploadID string
		seq      int64
		waitCh   <-chan agent.FsUploadEvent
	}
	var s sess
	var forwardDone = make(chan struct{})

	sendJSON := func(v interface{}) {
		b, _ := json.Marshal(v)
		_ = conn.WriteMessage(1, b)
	}

	defer func() {
		close(forwardDone)
		if s.uploadID != "" {
			agent.ForgetFsUploadWait(s.uploadID)
		}
		_ = conn.Close()
	}()

	// forward agent progress back to browser
	go func() {
		for {
			select {
			case <-forwardDone:
				return
			default:
			}
			if s.waitCh == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			select {
			case ev, ok := <-s.waitCh:
				if !ok {
					s.waitCh = nil
					continue
				}
				sendJSON(ev)
				if ev.Type == "fs_upload_done" {
					// keep channel until websocket closes or new upload begins
				}
			case <-time.After(500 * time.Millisecond):
			case <-forwardDone:
				return
			}
		}
	}()

	for {
		mt, data, rerr := conn.ReadMessage()
		if rerr != nil {
			break
		}
		if mt == 1 { // text
			var j map[string]interface{}
			if err := json.Unmarshal(data, &j); err != nil {
				sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
				continue
			}
			t, _ := j["type"].(string)
			switch t {
			case "upload_begin":
				uploadID, _ := j["upload_id"].(string)
				path, _ := j["path"].(string)
				fileName, _ := j["file_name"].(string)
				size := wsMsgInt64(j, "size")
				if uploadID == "" || path == "" || fileName == "" || size <= 0 {
					sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
					continue
				}
				// reset previous session
				if s.uploadID != "" {
					agent.ForgetFsUploadWait(s.uploadID)
				}
				s = sess{uploadID: uploadID, seq: 0, waitCh: agent.RegisterFsUploadWait(uploadID)}
				_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
					"type":   "command",
					"action": "fs_upload_begin",
					"data": map[string]interface{}{
						"upload_id": uploadID,
						"path":      path,
						"file_name": fileName,
						"size":      size,
					},
				})
				sendJSON(gin.H{"type": "upload_ack", "upload_id": uploadID})
			case "upload_end":
				uploadID, _ := j["upload_id"].(string)
				if uploadID == "" || uploadID != s.uploadID {
					sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
					continue
				}
				_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
					"type":   "command",
					"action": "fs_upload_end",
					"data": map[string]interface{}{
						"upload_id": uploadID,
					},
				})
			case "upload_cancel":
				uploadID, _ := j["upload_id"].(string)
				if uploadID == "" || uploadID != s.uploadID {
					sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
					continue
				}
				_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
					"type":   "command",
					"action": "fs_upload_cancel",
					"data": map[string]interface{}{
						"upload_id": uploadID,
					},
				})
				agent.ForgetFsUploadWait(uploadID)
				s.uploadID = ""
				s.waitCh = nil
			default:
				sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
			}
			continue
		}
		if mt == 2 { // binary
			if s.uploadID == "" {
				sendJSON(gin.H{"type": "error", "error": fsErrInvalidRequest})
				continue
			}
			s.seq++
			enc := base64.StdEncoding.EncodeToString(data)
			if len(enc) > 8*1024*1024 {
				sendJSON(gin.H{"type": "error", "error": fsErrTooLarge})
				continue
			}
			if err := agent.AgentHub.Send(routeKey, map[string]interface{}{
				"type":   "command",
				"action": "fs_upload_chunk",
				"data": map[string]interface{}{
					"upload_id":   s.uploadID,
					"seq":         s.seq,
					"data_base64": enc,
				},
			}); err != nil {
				log.Printf("AgentFsWS send chunk failed: %v", err)
			}
		}
	}
}

// AgentFsDownload downloads a file from Agent
func AgentFsDownload(c *gin.Context) {
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}

	path := strings.TrimSpace(c.Query("path"))
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 path 参数"})
		return
	}

	rid := randomAgentRequestID()
	ch := agent.RegisterFsDownloadWait(rid)
	defer agent.ForgetFsDownloadWait(rid)

	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "fs_download",
		"data": map[string]interface{}{
			"request_id": rid,
			"path":       path,
		},
	})

	select {
	case res := <-ch:
		if res.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.Err})
			return
		}
		c.Data(http.StatusOK, "application/octet-stream", res.Data)
	case <-time.After(30 * time.Second):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "下载超时"})
	}
}
