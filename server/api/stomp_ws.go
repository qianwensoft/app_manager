package api

import (
	"app-manager/auth"
	"app-manager/stomp"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var stompDestDeviceRecording = regexp.MustCompile(`^/topic/device/(\d+)/recording$`)
var stompDestDeviceEvents = regexp.MustCompile(`^/topic/device/(\d+)/events$`)

const stompDestDevices = "/topic/devices"
const stompDestEvents = "/topic/events"

// StompWS STOMP 1.2 over WebSocket（需先经 StompWSAuth；浏览器用 query token=JWT）。订阅录屏进度：/topic/device/{id}/recording
func StompWS(c *gin.Context) {
	conn, err := stompWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	log.Printf("STOMP client connected user_id=%d", c.GetUint("user_id"))

	var writeMu sync.Mutex
	send := func(b []byte) {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.WriteMessage(websocket.TextMessage, b)
	}

	// subID -> unsubscribe
	unsubs := make(map[string]func())
	defer func() {
		for _, u := range unsubs {
			u()
		}
		conn.Close()
		log.Printf("STOMP client disconnected user_id=%d", c.GetUint("user_id"))
	}()

	readLoop := true
	for readLoop {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		cmd, headers, body, derr := stomp.DecodeFrame(data)
		if derr != nil {
			log.Printf("STOMP bad frame: %v", derr)
			send(stomp.EncodeFrame("ERROR", map[string]string{"message": "bad frame"}, ""))
			continue
		}
		switch cmd {
		case "STOMP", "CONNECT":
			send(stomp.EncodeFrame("CONNECTED", map[string]string{
				"version":     "1.2",
				"heart-beat":  "0,0",
				"server":      "app-manager",
				"session":     c.GetString("username"),
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
			switch dest {
			case stompDestDevices, stompDestEvents:
				unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
				log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
			case stompDestEvents:
				unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
				log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
			default:
				mEv := stompDestDeviceEvents.FindStringSubmatch(dest)
				if mEv != nil {
					if _, err := strconv.ParseUint(mEv[1], 10, 64); err != nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid device id"}, ""))
						continue
					}
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				m := stompDestDeviceRecording.FindStringSubmatch(dest)
				if m == nil {
					m = stompDestDeviceEvents.FindStringSubmatch(dest)
				}
				if m == nil {
					send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid destination"}, ""))
					continue
				}
				if _, err := strconv.ParseUint(m[1], 10, 64); err != nil {
					send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid device id"}, ""))
					continue
				}
				unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
				log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
			}
		case "UNSUBSCRIBE":
			subID := headers["id"]
			if u, ok := unsubs[subID]; ok {
				u()
				delete(unsubs, subID)
			}
		case "DISCONNECT":
			readLoop = false
		case "SEND", "ACK", "NACK":
			// not used for server push-only topics
		default:
			if strings.TrimSpace(cmd) != "" {
				log.Printf("STOMP unknown command %q", cmd)
			}
		}
		_ = body
	}
}

// StompWSAuth wraps JWT for WebSocket (token query or header).
func StompWSAuth(c *gin.Context) {
	token := c.GetHeader("Authorization")
	if token != "" {
		token = strings.TrimPrefix(token, "Bearer ")
	} else {
		token = c.Query("token")
	}
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		c.Abort()
		return
	}
	claims, err := auth.ParseToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		c.Abort()
		return
	}
	c.Set("user_id", claims.UserID)
	c.Set("username", claims.Username)
	c.Set("role", claims.Role)
	c.Next()
}
