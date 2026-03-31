package shell

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[string]*websocket.Conn // deviceID → browser conn
}

var ShellHub = &Hub{
	clients: make(map[string]*websocket.Conn),
}

func (h *Hub) Register(deviceID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[deviceID] = conn
}

func (h *Hub) Unregister(deviceID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, deviceID)
}

func (h *Hub) SendToClient(deviceID string, data []byte) {
	h.mu.RLock()
	conn := h.clients[deviceID]
	h.mu.RUnlock()
	if conn == nil {
		return
	}
	// 使用 BinaryMessage：设备 shell 可能输出非 UTF-8 字节，写 TextMessage 会导致 gorilla 报错
	if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
		log.Printf("ShellHub write error [%s]: %v", deviceID, err)
	}
}

func (h *Hub) SendJSONToClient(deviceID string, msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.SendToClient(deviceID, data)
}
