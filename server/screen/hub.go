package screen

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// SignalingHub 将 Agent 上行的屏幕帧/通知广播给所有 Web Viewer（服务器中转）。
type SignalingHub struct {
	mu      sync.RWMutex
	viewers map[string][]*websocket.Conn // device routeKey → 多个浏览器连接
}

var ScreenHub = &SignalingHub{
	viewers: make(map[string][]*websocket.Conn),
}

func (h *SignalingHub) RegisterViewer(deviceID string, conn *websocket.Conn) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.viewers[deviceID] = append(h.viewers[deviceID], conn)
	return len(h.viewers[deviceID])
}

func (h *SignalingHub) UnregisterViewer(deviceID string, conn *websocket.Conn) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.viewers[deviceID]
	idx := -1
	for i, c := range list {
		if c == conn {
			idx = i
			break
		}
	}
	if idx < 0 {
		return len(list)
	}
	list = append(list[:idx], list[idx+1:]...)
	if len(list) == 0 {
		delete(h.viewers, deviceID)
	} else {
		h.viewers[deviceID] = list
	}
	return len(list)
}

// BroadcastText 向该设备所有屏幕 Viewer 广播已序列化的 JSON 文本。
func (h *SignalingHub) BroadcastText(deviceID string, data []byte) {
	h.mu.RLock()
	list := make([]*websocket.Conn, len(h.viewers[deviceID]))
	copy(list, h.viewers[deviceID])
	h.mu.RUnlock()
	deadline := time.Now().Add(15 * time.Second)
	for _, c := range list {
		_ = c.SetWriteDeadline(deadline)
		if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("screen hub broadcast [%s]: %v", deviceID, err)
		}
	}
}

// SendJSONToClient 广播给所有 Viewer（与旧名单连接语义兼容）。
func (h *SignalingHub) SendJSONToClient(deviceID string, msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("SignalingHub marshal error: %v", err)
		return
	}
	h.BroadcastText(deviceID, data)
}

// BroadcastBinary 向该设备所有屏幕 Viewer 广播二进制帧（如 Agent 上行的 JPEG 头 + 裸流）。
func (h *SignalingHub) BroadcastBinary(deviceID string, data []byte) {
	if len(data) == 0 {
		return
	}
	h.mu.RLock()
	list := make([]*websocket.Conn, len(h.viewers[deviceID]))
	copy(list, h.viewers[deviceID])
	h.mu.RUnlock()
	deadline := time.Now().Add(15 * time.Second)
	for _, c := range list {
		_ = c.SetWriteDeadline(deadline)
		if err := c.WriteMessage(websocket.BinaryMessage, data); err != nil {
			log.Printf("screen hub binary broadcast [%s]: %v", deviceID, err)
		}
	}
}

// CloseAllForDevice 关闭该设备下所有屏幕 WebSocket（如 Agent 离线）。
func (h *SignalingHub) CloseAllForDevice(deviceID string) {
	h.mu.Lock()
	list := h.viewers[deviceID]
	delete(h.viewers, deviceID)
	h.mu.Unlock()
	for _, c := range list {
		_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseGoingAway, "agent disconnected"))
		_ = c.Close()
	}
}
