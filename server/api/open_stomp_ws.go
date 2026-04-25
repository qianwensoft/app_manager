package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// OpenStompWSAuth 开放 STOMP WebSocket 认证：支持
//   - Header:  X-API-Key: <key>
//   - Header:  Authorization: Bearer <key>
//   - Query:   api_key=<key>
//   - Cookie:  api_key=<key>
func OpenStompWSAuth(c *gin.Context) {
	key := c.GetHeader("X-API-Key")
	if key == "" {
		if bearer := c.GetHeader("Authorization"); bearer != "" {
			key = strings.TrimPrefix(bearer, "Bearer ")
		}
	}
	if key == "" {
		key = c.Query("api_key")
	}
	if key == "" {
		if cookie, err := c.Cookie("api_key"); err == nil {
			key = cookie
		}
	}
	if key == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing api key"})
		c.Abort()
		return
	}

	var apiKey models.ApiKey
	if err := database.DB.Where("key = ? AND revoked = false", key).First(&apiKey).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
		c.Abort()
		return
	}
	if apiKey.ExpiresAt != nil && apiKey.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "api key expired"})
		c.Abort()
		return
	}

	scopeSet := auth.ParseScopeSet(apiKey.Permissions)
	if !auth.ScopeSetAllows(scopeSet, auth.OpenStompSubscribe) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing scope: " + auth.OpenStompSubscribe})
		c.Abort()
		return
	}

	now := time.Now()
	database.DB.Model(&apiKey).Update("last_used_at", &now)

	c.Set("api_key_id", apiKey.ID)
	c.Set("open_scope_set", scopeSet)
	c.Next()
}

// openAllowedDest 校验外部应用只能订阅开放 topic
func openAllowedDest(dest string) bool {
	// 允许：组态实时点位数据
	if stompDestScadaPointData.MatchString(dest) {
		return true
	}
	// 允许：设备列表、事件
	if dest == stompDestDevices || dest == stompDestEvents {
		return true
	}
	return false
}

// OpenStompWS 开放 STOMP 1.2 over WebSocket，供外部应用订阅实时数据。
// 认证通过 OpenStompWSAuth 完成，topic 白名单由 openAllowedDest 控制。
func OpenStompWS(c *gin.Context) {
	conn, err := stompWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	apiKeyID, _ := c.Get("api_key_id")
	log.Printf("OpenSTOMP client connected api_key_id=%v", apiKeyID)

	var writeMu sync.Mutex
	send := func(b []byte) {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.WriteMessage(websocket.TextMessage, b)
	}

	unsubs := make(map[string]func())
	defer func() {
		for _, u := range unsubs {
			u()
		}
		conn.Close()
		log.Printf("OpenSTOMP client disconnected api_key_id=%v", apiKeyID)
	}()

	readLoop := true
	for readLoop {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		cmd, headers, body, derr := stomp.DecodeFrame(data)
		if derr != nil {
			send(stomp.EncodeFrame("ERROR", map[string]string{"message": "bad frame"}, ""))
			continue
		}
		switch cmd {
		case "STOMP", "CONNECT":
			send(stomp.EncodeFrame("CONNECTED", map[string]string{
				"version":    "1.2",
				"heart-beat": "0,0",
				"server":     "app-manager-open",
			}, ""))
		case "SUBSCRIBE":
			dest := headers["destination"]
			subID := headers["id"]
			if subID == "" || dest == "" {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "missing id or destination"}, ""))
				continue
			}
			if _, ok := unsubs[subID]; ok {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "duplicate subscription id"}, ""))
				continue
			}
			if !openAllowedDest(dest) {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "destination not allowed: " + dest}, ""))
				continue
			}
			unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
			log.Printf("OpenSTOMP SUBSCRIBE api_key_id=%v dest=%s sub=%s", apiKeyID, dest, subID)
		case "UNSUBSCRIBE":
			subID := headers["id"]
			if u, ok := unsubs[subID]; ok {
				u()
				delete(unsubs, subID)
			}
		case "DISCONNECT":
			readLoop = false
		case "SEND", "ACK", "NACK":
			// push-only: ignore
		default:
			if strings.TrimSpace(cmd) != "" {
				log.Printf("OpenSTOMP unknown command %q", cmd)
			}
		}
		_ = body
	}
}
