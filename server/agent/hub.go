package agent

import (
	"app-manager/screen"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Connection struct {
	DeviceID string
	Conn     *websocket.Conn
	send     chan []byte
}

type Hub struct {
	connections map[string]*Connection
	mu          sync.RWMutex
	onMessage   func(deviceID string, msg map[string]interface{})
}

var AgentHub = &Hub{
	connections: make(map[string]*Connection),
}

var (
	clusterForward       func(deviceID string, data []byte) bool
	clusterReachable     func(deviceID string) bool
	clusterOnRegister    func(deviceID string)
	clusterOnUnregister  func(deviceID string)
	clusterScreenPublish func(deviceID string, data []byte)
)

// SetClusterHooks wires horizontal-scaling callbacks (optional; set from cluster.Init).
func SetClusterHooks(
	forward func(deviceID string, data []byte) bool,
	reachable func(deviceID string) bool,
	onRegister func(deviceID string),
	onUnregister func(deviceID string),
) {
	clusterForward = forward
	clusterReachable = reachable
	clusterOnRegister = onRegister
	clusterOnUnregister = onUnregister
}

// SetClusterScreenPublish mirrors MJPEG binary frames to Redis when cluster mode is on.
func SetClusterScreenPublish(fn func(deviceID string, data []byte)) {
	clusterScreenPublish = fn
}

// OnAgentDisconnect Agent WebSocket 正常/异常断开时调用（用于关闭屏幕 Viewer、中止服务器录屏等）。
var OnAgentDisconnect func(deviceID string)

// OnAgentConnect Agent WebSocket 注册成功后调用（用于恢复已下发的监听等）。
var OnAgentConnect func(deviceID string)

func SetMessageHandler(fn func(deviceID string, msg map[string]interface{})) {
	AgentHub.onMessage = fn
}

func (h *Hub) Register(deviceID string, conn *websocket.Conn) <-chan struct{} {
	done := make(chan struct{})
	c := &Connection{DeviceID: deviceID, Conn: conn, send: make(chan []byte, 64)}
	h.mu.Lock()
	h.connections[deviceID] = c
	h.mu.Unlock()
	log.Printf("Agent connected: %s", deviceID)
	if clusterOnRegister != nil {
		clusterOnRegister(deviceID)
	}
	if OnAgentConnect != nil {
		OnAgentConnect(deviceID)
	}

	go c.writePump()
	go func() {
		h.readPump(c)
		close(done)
	}()
	return done
}

func (h *Hub) Unregister(deviceID string) {
	h.mu.Lock()
	if c, ok := h.connections[deviceID]; ok {
		close(c.send)
		delete(h.connections, deviceID)
	}
	h.mu.Unlock()
	log.Printf("Agent disconnected: %s", deviceID)
	if clusterOnUnregister != nil {
		clusterOnUnregister(deviceID)
	}
	if OnAgentDisconnect != nil {
		OnAgentDisconnect(deviceID)
	}
}

func (h *Hub) Send(deviceID string, msg interface{}) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	if clusterForward != nil && clusterForward(deviceID, data) {
		return nil
	}
	h.mu.RLock()
	c, ok := h.connections[deviceID]
	h.mu.RUnlock()
	if !ok {
		log.Printf("Agent not connected: %s", deviceID)
		return nil
	}
	c.send <- data
	return nil
}

// HasLocal reports whether this process holds the agent WebSocket.
func (h *Hub) HasLocal(deviceID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[deviceID]
	return ok
}

// DeliverRaw enqueues pre-serialized JSON to a local agent connection (cluster inbound).
func (h *Hub) DeliverRaw(deviceID string, data []byte) error {
	h.mu.RLock()
	c, ok := h.connections[deviceID]
	h.mu.RUnlock()
	if !ok {
		return nil
	}
	select {
	case c.send <- data:
		return nil
	default:
		return nil
	}
}

func (h *Hub) IsConnected(deviceID string) bool {
	if h.HasLocal(deviceID) {
		return true
	}
	if clusterReachable != nil && clusterReachable(deviceID) {
		return true
	}
	return false
}

// IsAnyConnected reports whether any candidate key is reachable on this or a peer node.
func (h *Hub) IsAnyConnected(deviceKeys []string) bool {
	for _, k := range deviceKeys {
		if h.IsConnected(k) {
			return true
		}
	}
	return false
}

// SendToAny delivers msg to the first reachable candidate key; returns whether a live route existed.
func (h *Hub) SendToAny(deviceKeys []string, msg interface{}) bool {
	for _, k := range deviceKeys {
		if h.IsConnected(k) {
			_ = h.Send(k, msg)
			return true
		}
	}
	return false
}

// LiveConnectionKeyForDeviceID returns the WebSocket route key for a connected agent, scanning live
// connections first so commands still reach devices whose Hub key differs from stored agent_token.
func (h *Hub) LiveConnectionKeyForDeviceID(deviceID uint) string {
	h.mu.RLock()
	for connKey := range h.connections {
		if id, ok := ResolveDeviceID(connKey); ok && id == deviceID {
			h.mu.RUnlock()
			return connKey
		}
	}
	h.mu.RUnlock()

	keys, err := AgentConnectionKeyCandidates(fmt.Sprintf("%d", deviceID))
	if err != nil {
		return ""
	}
	for _, k := range keys {
		if h.IsConnected(k) {
			return k
		}
	}
	return ""
}

// SendToDevice delivers msg to the live agent connection for a DB device id.
func (h *Hub) SendToDevice(deviceID uint, msg interface{}) bool {
	key := h.LiveConnectionKeyForDeviceID(deviceID)
	if key == "" {
		return false
	}
	_ = h.Send(key, msg)
	return true
}

func (h *Hub) readPump(c *Connection) {
	defer h.Unregister(c.DeviceID)
	for {
		mt, data, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		if mt == websocket.BinaryMessage && len(data) >= 6 && data[0] == 0x01 {
			// Agent 二进制投屏：0x01 + width(2 BE) + height(2 BE) + JPEG
			routeKey := CanonicalRouteKeyFromWS(c.DeviceID)
			screen.MarkAgentCaptureHeld(routeKey)
			payload := make([]byte, len(data))
			copy(payload, data)
			if clusterScreenPublish != nil {
				clusterScreenPublish(routeKey, payload)
			}
			screen.ScreenHub.BroadcastBinary(routeKey, payload)
			screen.AppendRecordingFrameRaw(routeKey, data[5:])
			continue
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if h.onMessage != nil {
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("agent uplink handler panic device=%s: %v", c.DeviceID, r)
					}
				}()
				h.onMessage(c.DeviceID, msg)
			}()
		}
	}
}

func (c *Connection) writePump() {
	for data := range c.send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			break
		}
	}
	c.Conn.Close()
}
