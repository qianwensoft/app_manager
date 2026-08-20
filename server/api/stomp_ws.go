package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var stompDestDeviceRecording = regexp.MustCompile(`^/topic/device/(\d+)/recording$`)
var stompDestDeviceEvents = regexp.MustCompile(`^/topic/device/(\d+)/events$`)
var stompDestDeviceWirelessAdb = regexp.MustCompile(`^/topic/device/(\d+)/wireless-adb$`)
var stompDestDeviceEventAnalysis = regexp.MustCompile(`^/topic/device/(\d+)/event-analysis$`)
var stompDestScadaPointData = regexp.MustCompile(`^/topic/scada/point-data/([^/]+)$`)
var stompDestOutboundConnectorTrace = regexp.MustCompile(`^/topic/outbound/connectors/(\d+)/execution-trace$`)
var stompDestOutboundWebhookDebug = regexp.MustCompile(`^/topic/outbound/webhooks/(\d+)/debug$`)
var stompDestMonitorAgentConnections = regexp.MustCompile(`^/topic/monitor/agent-connections$`)
var stompDestMonitorStompStats = regexp.MustCompile(`^/topic/monitor/stomp-stats$`)

const stompDestDevices = "/topic/devices"
const stompDestEvents = "/topic/events"
const stompDestOutboundWebhookList = "/topic/outbound/webhooks/list"
const stompDestWorkOrders = "/topic/work-orders"

// 单工单事件流：/topic/work-orders/{id}
var stompDestWorkOrderByID = regexp.MustCompile(`^/topic/work-orders/(\d+)$`)

// 安装任务事件流：全局 /topic/install-tasks 与单任务 /topic/install-tasks/{id}
var stompDestInstallTaskByID = regexp.MustCompile(`^/topic/install-tasks/(\d+)$`)
const stompDestInstallTasks = "/topic/install-tasks"

// StompWS STOMP 1.2 over WebSocket（需先经 StompWSAuth；浏览器用 query token=JWT）。订阅录屏进度：/topic/device/{id}/recording
func StompWS(c *gin.Context) {
	conn, err := stompWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	authMode := c.GetString("stomp_auth_mode")
	if authMode == "share" {
		log.Printf("STOMP client connected via share link device_id=%d", c.GetUint("share_device_id"))
	} else {
		log.Printf("STOMP client connected user_id=%d", c.GetUint("user_id"))
	}

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
		if authMode == "share" {
			log.Printf("STOMP client disconnected via share link device_id=%d", c.GetUint("share_device_id"))
		} else {
			log.Printf("STOMP client disconnected user_id=%d", c.GetUint("user_id"))
		}
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
			sessionName := c.GetString("username")
			if authMode == "share" {
				sessionName = "share"
			}
			send(stomp.EncodeFrame("CONNECTED", map[string]string{
				"version":    "1.2",
				"heart-beat": "0,0",
				"server":     "app-manager",
				"session":    sessionName,
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

			// Check if share link has permission to subscribe to this destination
			if authMode == "share" && !isDestinationAllowedForShare(c, dest) {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "destination not allowed for share link"}, ""))
				continue
			}
			if authMode == "wo_share" && !isDestinationAllowedForWoShare(dest) {
				send(stomp.EncodeFrame("ERROR", map[string]string{"message": "destination not allowed for work-order share"}, ""))
				continue
			}

			switch dest {
			case stompDestDevices, stompDestEvents, stompDestOutboundWebhookList, stompDestWorkOrders, stompDestInstallTasks:
				unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
				log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
			default:
				if stompDestWorkOrderByID.MatchString(dest) {
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				if stompDestInstallTaskByID.MatchString(dest) {
					mIt := stompDestInstallTaskByID.FindStringSubmatch(dest)
					if mIt == nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid task id"}, ""))
						continue
					}
					if _, err := strconv.ParseUint(mIt[1], 10, 64); err != nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid task id"}, ""))
						continue
					}
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				if mMon := stompDestMonitorAgentConnections.FindStringSubmatch(dest); mMon != nil {
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				if stompDestMonitorStompStats.MatchString(dest) {
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					// send current snapshot immediately on subscribe
					go publishStompStats()
					continue
				}
				if mSc := stompDestScadaPointData.FindStringSubmatch(dest); mSc != nil {
					if mSc[1] != "" {
						unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
						log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
						continue
					}
				}
				if mTr := stompDestOutboundConnectorTrace.FindStringSubmatch(dest); mTr != nil {
					if _, err := strconv.ParseUint(mTr[1], 10, 64); err != nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid connector id"}, ""))
						continue
					}
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				if mWh := stompDestOutboundWebhookDebug.FindStringSubmatch(dest); mWh != nil {
					if _, err := strconv.ParseUint(mWh[1], 10, 64); err != nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid webhook id"}, ""))
						continue
					}
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
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
				if mWa := stompDestDeviceWirelessAdb.FindStringSubmatch(dest); mWa != nil {
					if _, err := strconv.ParseUint(mWa[1], 10, 64); err != nil {
						send(stomp.EncodeFrame("ERROR", map[string]string{"message": "invalid device id"}, ""))
						continue
					}
					unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
					log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
					continue
				}
				if mEa := stompDestDeviceEventAnalysis.FindStringSubmatch(dest); mEa != nil {
					if _, err := strconv.ParseUint(mEa[1], 10, 64); err != nil {
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

// StompWSAuth wraps JWT for WebSocket (token query or header) or share link (?share= / ?wo_share_token=).
func StompWSAuth(c *gin.Context) {
	// Screen share token
	share := strings.TrimSpace(c.Query("share"))
	if share != "" {
		if stompShareAuthenticate(c, share) {
			c.Next()
		}
		return
	}

	// Work-order report share token
	woShare := strings.TrimSpace(c.Query("wo_share_token"))
	if woShare != "" {
		if stompWoShareAuthenticate(c, woShare) {
			c.Next()
		}
		return
	}

	// Otherwise, use JWT token
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

// stompShareAuthenticate validates share token and sets context for STOMP access
func stompShareAuthenticate(c *gin.Context, share string) bool {
	var link models.ScreenShareLink
	if err := database.DB.Where("token = ? AND revoked = ?", share, false).First(&link).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or revoked share link"})
		c.Abort()
		return false
	}
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "share link expired"})
		c.Abort()
		return false
	}

	// Set context for share mode
	c.Set("stomp_auth_mode", "share")
	c.Set("share_device_id", link.DeviceID)
	c.Set("share_scopes", link.ScopesJSON)

	return true
}

// isDestinationAllowedForShare checks if a STOMP destination is allowed for share link
func isDestinationAllowedForShare(c *gin.Context, dest string) bool {
	deviceID := c.GetUint("share_device_id")
	if deviceID == 0 {
		return false
	}

	// Allow device-specific topics for the shared device
	deviceIDStr := strconv.FormatUint(uint64(deviceID), 10)

	// Check device recording topic
	if m := stompDestDeviceRecording.FindStringSubmatch(dest); m != nil {
		return m[1] == deviceIDStr
	}

	// Check device events topic
	if m := stompDestDeviceEvents.FindStringSubmatch(dest); m != nil {
		return m[1] == deviceIDStr
	}

	// Check device wireless ADB topic
	if m := stompDestDeviceWirelessAdb.FindStringSubmatch(dest); m != nil {
		return m[1] == deviceIDStr
	}

	// Check device event analysis topic
	if m := stompDestDeviceEventAnalysis.FindStringSubmatch(dest); m != nil {
		return m[1] == deviceIDStr
	}

	// Deny all other destinations (global topics, other devices, etc.)
	return false
}

// stompWoShareAuthenticate validates work-order report share token
func stompWoShareAuthenticate(c *gin.Context, token string) bool {
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid share token"})
		c.Abort()
		return false
	}
	if !share.ExpiresAt.IsZero() && share.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "share link expired"})
		c.Abort()
		return false
	}
	c.Set("stomp_auth_mode", "wo_share")
	return true
}

// isDestinationAllowedForWoShare 工单分享只允许订阅工单相关 topic
func isDestinationAllowedForWoShare(dest string) bool {
	return dest == stompDestWorkOrders || stompDestWorkOrderByID.MatchString(dest)
}
