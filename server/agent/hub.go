package agent

import (
	"app-manager/screen"
	"encoding/json"
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

// OnAgentDisconnect Agent WebSocket 正常/异常断开时调用（用于关闭屏幕 Viewer、中止服务器录屏等）。
var OnAgentDisconnect func(deviceID string)

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
	if OnAgentDisconnect != nil {
		OnAgentDisconnect(deviceID)
	}
}

func (h *Hub) Send(deviceID string, msg interface{}) error {
	h.mu.RLock()
	c, ok := h.connections[deviceID]
	h.mu.RUnlock()
	if !ok {
		log.Printf("Agent not connected: %s", deviceID)
		return nil
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	log.Printf("Sending to agent [%s]: %s", deviceID, string(data))
	c.send <- data
	return nil
}

func (h *Hub) IsConnected(deviceID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[deviceID]
	return ok
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
			screen.MarkAgentCaptureHeld(c.DeviceID)
			payload := make([]byte, len(data))
			copy(payload, data)
			screen.ScreenHub.BroadcastBinary(c.DeviceID, payload)
			screen.AppendRecordingFrameRaw(c.DeviceID, data[5:])
			continue
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if h.onMessage != nil {
			h.onMessage(c.DeviceID, msg)
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
