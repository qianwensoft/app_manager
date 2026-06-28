package api

import (
	"app-manager/auth"
	"app-manager/yjs"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// YjsHub is the global yjs hub instance
var YjsHub = yjs.DefaultHub

// YjsWS handles y-websocket protocol for collaborative editing
func YjsWS(c *gin.Context) {
	// 获取房间名称
	room := c.Param("room")
	if room == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing room"})
		return
	}

	// 从 query 获取 token（y-websocket 通过 params 传递）
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	// 验证 JWT
	claims, err := auth.ParseToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	// 升级为 WebSocket（使用 rawWsUpgrader，y-websocket 不需要 subprotocol）
	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("YjsWS upgrade failed: %v", err)
		return
	}

	userID := claims.UserID
	log.Printf("YjsWS: user_id=%d connected to room=%s", userID, room)

	// 注册到 YjsHub（按房间隔离）
	YjsHub.RegisterClient(room, conn, userID)

	defer func() {
		YjsHub.UnregisterClient(room, conn)
		conn.Close()
		log.Printf("YjsWS: user_id=%d disconnected from room=%s", userID, room)
	}()

	// 设置读超时和 pong 处理器
	const pongWait = 60 * time.Second
	const pingInterval = 30 * time.Second

	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// 启动 ping 发送协程
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second)); err != nil {
					log.Printf("YjsWS: ping error for user_id=%d room=%s: %v", userID, room, err)
					return
				}
			case <-done:
				return
			}
		}
	}()
	defer close(done)

	// 读取消息并通过 Hub 处理（包括 awareness 协议）
	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			log.Printf("YjsWS: read error for user_id=%d room=%s: %v", userID, room, err)
			break
		}

		// y-websocket 使用二进制消息和文本消息
		if messageType == websocket.BinaryMessage || messageType == websocket.TextMessage {
			// 使用 Hub 的 HandleMessage 处理（区分 Sync 和 Awareness）
			YjsHub.HandleMessage(room, conn, data)
		}
	}
}
