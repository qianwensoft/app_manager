package api

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// StompScadaShareAuth 免登录：?share_token= 对应已发布组态
func StompScadaShareAuth(c *gin.Context) {
	token := strings.TrimSpace(c.Query("share_token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing share_token"})
		c.Abort()
		return
	}
	var row models.ScadaInfo
	if err := database.DB.Where("share_token = ? AND publish_status = ?", token, 1).First(&row).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid share"})
		c.Abort()
		return
	}
	c.Set("scada_share_code", row.ScadaCode)
	c.Next()
}

// StompScadaShareWS STOMP 仅允许订阅 /topic/scada/point-data/{该组态 scada_code}
func StompScadaShareWS(c *gin.Context) {
	code := c.GetString("scada_share_code")
	if code == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	allowed := "/topic/scada/point-data/" + code

	conn, err := stompWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	log.Printf("STOMP scada-share connected scada_code=%s", code)

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
		_ = conn.Close()
		log.Printf("STOMP scada-share disconnected scada_code=%s", code)
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
				"server":     "app-manager",
				"session":    "scada-share",
			}, ""))
		case "SUBSCRIBE":
			dest := headers["destination"]
			subID := headers["id"]
			if subID == "" || dest == "" {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "missing id or destination"}, ""))
				continue
			}
			if dest != allowed {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid destination for share"}, ""))
				continue
			}
			if _, ok := unsubs[subID]; ok {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "duplicate subscription id"}, ""))
				continue
			}
			unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
		case "UNSUBSCRIBE":
			subID := headers["id"]
			if u, ok := unsubs[subID]; ok {
				u()
				delete(unsubs, subID)
			}
		case "DISCONNECT":
			readLoop = false
		}
		_ = body
	}
}
