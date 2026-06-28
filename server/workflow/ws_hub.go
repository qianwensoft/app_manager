package workflow

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
)

// WSHub 工作流 WebSocket Hub
type WSHub struct {
	mu          sync.RWMutex
	connections map[uint]map[*websocket.Conn]bool // executionID -> connections
}

var WSHubInstance = &WSHub{
	connections: make(map[uint]map[*websocket.Conn]bool),
}

// WSMessage WebSocket 消息
type WSMessage struct {
	Type string      `json:"type"` // status | log | node_update | completed
	Data interface{} `json:"data"`
}

// Register 注册连接
func (h *WSHub) Register(executionID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.connections[executionID] == nil {
		h.connections[executionID] = make(map[*websocket.Conn]bool)
	}
	h.connections[executionID][conn] = true
}

// Unregister 注销连接
func (h *WSHub) Unregister(executionID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if conns, ok := h.connections[executionID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.connections, executionID)
		}
	}
}

// Broadcast 广播消息
func (h *WSHub) Broadcast(executionID uint, msgType string, data interface{}) {
	h.mu.RLock()
	conns, ok := h.connections[executionID]
	h.mu.RUnlock()

	if !ok || len(conns) == 0 {
		return
	}

	msg := WSMessage{
		Type: msgType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
			// 连接已断开，稍后清理
			go h.Unregister(executionID, conn)
		}
	}
}

// BroadcastNodeUpdate 广播节点更新
func (h *WSHub) BroadcastNodeUpdate(executionID uint, nodeID, status string, output interface{}) {
	h.Broadcast(executionID, "node_update", map[string]interface{}{
		"node_id": nodeID,
		"status":  status,
		"output":  output,
	})
}

// BroadcastLog 广播日志
func (h *WSHub) BroadcastLog(executionID uint, log ExecutionLog) {
	h.Broadcast(executionID, "log", log)
}

// BroadcastStatus 广播状态更新
func (h *WSHub) BroadcastStatus(executionID uint, status string) {
	h.Broadcast(executionID, "status", map[string]interface{}{
		"status": status,
	})
}

// BroadcastCompleted 广播完成
func (h *WSHub) BroadcastCompleted(executionID uint, status string, output interface{}) {
	h.Broadcast(executionID, "completed", map[string]interface{}{
		"status": status,
		"output": output,
	})
}

// GetConnectionCount 获取连接数
func (h *WSHub) GetConnectionCount(executionID uint) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if conns, ok := h.connections[executionID]; ok {
		return len(conns)
	}
	return 0
}

// 集成到 LowCodeEngine

// 在 executeNode 中添加节点状态广播
func (e *LowCodeEngine) broadcastNodeStart(execCtx *ExecutionContext, nodeID string) {
	WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, nodeID, "running", nil)
}

func (e *LowCodeEngine) broadcastNodeComplete(execCtx *ExecutionContext, nodeID string, output interface{}) {
	WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, nodeID, "completed", output)
}

func (e *LowCodeEngine) broadcastNodeFailed(execCtx *ExecutionContext, nodeID, errorMsg string) {
	WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, nodeID, "failed", map[string]interface{}{
		"error": errorMsg,
	})
}

func (e *LowCodeEngine) broadcastLog(execCtx *ExecutionContext, log ExecutionLog) {
	WSHubInstance.BroadcastLog(execCtx.ExecutionID, log)
}

func (e *LowCodeEngine) broadcastStatus(execCtx *ExecutionContext, status string) {
	WSHubInstance.BroadcastStatus(execCtx.ExecutionID, status)
}

func (e *LowCodeEngine) broadcastCompleted(execCtx *ExecutionContext, status string, output interface{}) {
	WSHubInstance.BroadcastCompleted(execCtx.ExecutionID, status, output)
}

// 修改 addLog 方法以同时广播
func (execCtx *ExecutionContext) addLogAndBroadcast(level, nodeID, message string, data map[string]interface{}) {
	log := ExecutionLog{
		Timestamp: execCtx.StartedAt,
		Level:     level,
		NodeID:    nodeID,
		Message:   message,
		Data:      data,
	}

	execCtx.Mu.Lock()
	execCtx.Logs = append(execCtx.Logs, log)
	execCtx.Mu.Unlock()

	// 广播日志
	WSHubInstance.BroadcastLog(execCtx.ExecutionID, log)
}

// CleanupConnections 清理所有连接
func (h *WSHub) CleanupConnections(executionID uint) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if conns, ok := h.connections[executionID]; ok {
		for conn := range conns {
			conn.Close()
		}
		delete(h.connections, executionID)
	}
}

// GetActiveExecutions 获取活跃执行的 ID 列表
func (h *WSHub) GetActiveExecutions() []uint {
	h.mu.RLock()
	defer h.mu.RUnlock()

	ids := make([]uint, 0, len(h.connections))
	for id := range h.connections {
		ids = append(ids, id)
	}
	return ids
}

// Stats 统计信息
func (h *WSHub) Stats() map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()

	totalConnections := 0
	for _, conns := range h.connections {
		totalConnections += len(conns)
	}

	return map[string]interface{}{
		"active_executions": len(h.connections),
		"total_connections": totalConnections,
	}
}

// BroadcastToAll 向所有连接广播消息
func (h *WSHub) BroadcastToAll(msgType string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	msg := WSMessage{
		Type: msgType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		fmt.Printf("Failed to marshal broadcast message: %v\n", err)
		return
	}

	for executionID, conns := range h.connections {
		for conn := range conns {
			if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
				// 连接已断开
				go h.Unregister(executionID, conn)
			}
		}
	}
}
