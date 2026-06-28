package agent

import (
	"app-manager/screen"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// agentReadTimeout 是 Agent WebSocket 的读空闲超时。Agent 端 OkHttp 每 30s 主动发一个
// ping frame，正常情况下 readPump 会在 PingHandler / 业务消息里不断刷新 deadline。
// 一旦 Agent 进程死亡或网络半开（TCP 未正常关闭），服务器在该时长内收不到任何帧，
// ReadMessage 会超时返回 error，从而触发 Unregister 把设备状态置为离线。
// 取 ~2.5x 的 ping 周期，容忍一次丢包/抖动。
const agentReadTimeout = 75 * time.Second

type Connection struct {
	DeviceID string
	Conn     *websocket.Conn
	send     chan []byte
}

type Hub struct {
	connections map[string]*Connection
	mu          sync.RWMutex
	onMessage   func(deviceID string, msg map[string]interface{})

	// 命令回调映射：commandId -> callback function
	callbacks  map[string]func(map[string]interface{})
	callbackMu sync.RWMutex
}

var AgentHub = &Hub{
	connections: make(map[string]*Connection),
	callbacks:   make(map[string]func(map[string]interface{})),
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

// RegisterCallback 注册命令回调函数
// 用于工作流等场景等待特定命令的执行结果
func (h *Hub) RegisterCallback(commandID string, callback func(map[string]interface{})) {
	h.callbackMu.Lock()
	defer h.callbackMu.Unlock()
	h.callbacks[commandID] = callback
}

// UnregisterCallback 取消注册命令回调
func (h *Hub) UnregisterCallback(commandID string) {
	h.callbackMu.Lock()
	defer h.callbackMu.Unlock()
	delete(h.callbacks, commandID)
}

func (h *Hub) Register(deviceID string, conn *websocket.Conn) <-chan struct{} {
	done := make(chan struct{})
	c := &Connection{DeviceID: deviceID, Conn: conn, send: make(chan []byte, 64)}
	h.mu.Lock()
	// 同键已有连接（Android 重连/半开）：先剔除旧连接并关闭，避免旧连接的 readPump
	// 退出时 Unregister 误删这条新连接，导致设备瞬间“离线”或连接数虚高/孤儿连接。
	if old, ok := h.connections[deviceID]; ok {
		close(old.send)
		_ = old.Conn.Close()
		log.Printf("Agent re-register, evicted stale connection: %s", deviceID)
	}
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

// unregisterConn 仅当 map 中当前连接确为 c 时才注销，避免「旧连接 readPump 退出」
// 误删 Register 刚替换上的新连接（Android 频繁重连场景）。
func (h *Hub) unregisterConn(c *Connection) {
	h.mu.Lock()
	cur, ok := h.connections[c.DeviceID]
	if !ok || cur != c {
		// 已被新连接替换：旧连接的 send 在 Register 剔除时已 close，这里不再重复处理。
		h.mu.Unlock()
		return
	}
	close(c.send)
	delete(h.connections, c.DeviceID)
	h.mu.Unlock()
	log.Printf("Agent disconnected: %s", c.DeviceID)
	if clusterOnUnregister != nil {
		clusterOnUnregister(c.DeviceID)
	}
	if OnAgentDisconnect != nil {
		OnAgentDisconnect(c.DeviceID)
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

// IsCurrentConn 报告 deviceID 当前注册的连接是否就是 conn。
// 用于重连竞态：被替换的旧连接断开时不应把设备误判为离线。
func (h *Hub) IsCurrentConn(deviceID string, conn *websocket.Conn) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.connections[deviceID]
	return ok && c.Conn == conn
}

// OnlineCount 返回本进程当前持有的 Agent WebSocket 连接数。
func (h *Hub) OnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.connections)
}

// ConnectedDeviceIDs 返回本进程当前在线的全部 deviceID 拷贝。
func (h *Hub) ConnectedDeviceIDs() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.connections))
	for id := range h.connections {
		ids = append(ids, id)
	}
	return ids
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
	defer h.unregisterConn(c)
	// 读空闲超时 + ping/pong 刷新：Agent 端每 30s 发 ping，收到即重置 deadline。
	// 若 Agent 半开/进程死亡，readPump 会在 agentReadTimeout 后超时退出并触发 Unregister。
	_ = c.Conn.SetReadDeadline(time.Now().Add(agentReadTimeout))
	c.Conn.SetPingHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(agentReadTimeout))
		// 回 pong（gorilla 默认行为）；忽略写超时类瞬时错误。
		err := c.Conn.WriteControl(websocket.PongMessage, nil, time.Now().Add(10*time.Second))
		if err == websocket.ErrCloseSent {
			return nil
		} else if e, ok := err.(net.Error); ok && e.Timeout() {
			return nil
		}
		return err
	})
	for {
		mt, data, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		// 收到任意业务帧也刷新 deadline。
		_ = c.Conn.SetReadDeadline(time.Now().Add(agentReadTimeout))
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

		// 先检查是否有匹配的命令回调
		if cmdID, ok := msg["commandId"].(string); ok && cmdID != "" {
			h.callbackMu.RLock()
			callback, exists := h.callbacks[cmdID]
			h.callbackMu.RUnlock()
			if exists {
				// 在新 goroutine 中调用回调，避免阻塞 readPump
				go func(cb func(map[string]interface{}), message map[string]interface{}) {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("agent callback panic device=%s cmdID=%s: %v", c.DeviceID, cmdID, r)
						}
					}()
					cb(message)
				}(callback, msg)
			}
		}

		// 然后调用全局 onMessage 处理器
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
