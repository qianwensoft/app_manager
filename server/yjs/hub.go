package yjs

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// MessageType represents Yjs protocol message types
type MessageType byte

const (
	MessageSync      MessageType = 0 // Document sync messages
	MessageAwareness MessageType = 1 // Awareness (presence) messages
)

// Hub manages yjs WebSocket connections and broadcasts sync messages
type Hub struct {
	mu        sync.RWMutex
	rooms     map[string]map[*websocket.Conn]uint   // room -> (conn -> userID)
	awareness map[string]map[*websocket.Conn][]byte // room -> (conn -> awareness state)
	connMu    map[*websocket.Conn]*sync.Mutex       // per-connection write locks
}

// DefaultHub is the global yjs hub instance
var DefaultHub = NewHub()

// NewHub creates a new yjs hub
func NewHub() *Hub {
	return &Hub{
		rooms:     make(map[string]map[*websocket.Conn]uint),
		awareness: make(map[string]map[*websocket.Conn][]byte),
		connMu:    make(map[*websocket.Conn]*sync.Mutex),
	}
}

// RegisterClient adds a WebSocket connection to a room
func (h *Hub) RegisterClient(room string, conn *websocket.Conn, userID uint) {
	h.mu.Lock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*websocket.Conn]uint)
	}
	h.rooms[room][conn] = userID

	// Create write lock for this connection
	if h.connMu[conn] == nil {
		h.connMu[conn] = &sync.Mutex{}
	}

	// Collect awareness states to send (while holding the lock)
	var statesToSend [][]byte
	if awarenessStates, ok := h.awareness[room]; ok {
		for otherConn, state := range awarenessStates {
			if otherConn != conn && len(state) > 0 {
				statesToSend = append(statesToSend, state)
			}
		}
	}

	h.mu.Unlock()

	// Send awareness states synchronously (after releasing the lock)
	connMutex := h.connMu[conn]
	for _, state := range statesToSend {
		connMutex.Lock()
		if err := conn.WriteMessage(websocket.BinaryMessage, state); err != nil {
			log.Printf("YjsHub: failed to send awareness state to new client: %v", err)
		}
		connMutex.Unlock()
	}

	log.Printf("YjsHub: registered client user_id=%d to room=%s, total=%d", userID, room, len(h.rooms[room]))
}

// UnregisterClient removes a WebSocket connection from a room
func (h *Hub) UnregisterClient(room string, conn *websocket.Conn) {
	h.mu.Lock()
	if clients, ok := h.rooms[room]; ok {
		userID := clients[conn]
		delete(clients, conn)
		if len(clients) == 0 {
			delete(h.rooms, room)
		}

		// Clean up awareness state
		if awarenessStates, ok := h.awareness[room]; ok {
			delete(awarenessStates, conn)
			if len(awarenessStates) == 0 {
				delete(h.awareness, room)
			}
		}

		// Clean up connection mutex
		delete(h.connMu, conn)

		h.mu.Unlock()
		log.Printf("YjsHub: unregistered client user_id=%d from room=%s, remaining=%d", userID, room, len(clients))
	} else {
		h.mu.Unlock()
	}
}

// HandleMessage processes incoming Yjs protocol messages and routes them appropriately
func (h *Hub) HandleMessage(room string, sender *websocket.Conn, data []byte) {
	if len(data) < 1 {
		return
	}

	messageType := MessageType(data[0])

	switch messageType {
	case MessageSync:
		// Sync messages: broadcast to all clients except sender
		h.Broadcast(room, sender, data)
		log.Printf("YjsHub: sync message in room=%s, size=%d", room, len(data))

	case MessageAwareness:
		// Awareness messages: save state and broadcast
		h.mu.Lock()
		if h.awareness[room] == nil {
			h.awareness[room] = make(map[*websocket.Conn][]byte)
		}
		// Save the sender's awareness state
		h.awareness[room][sender] = data
		h.mu.Unlock()

		// Broadcast to all clients except sender
		h.Broadcast(room, sender, data)
		log.Printf("YjsHub: awareness message in room=%s, size=%d", room, len(data))

	default:
		// Unknown message type, just broadcast it
		h.Broadcast(room, sender, data)
		log.Printf("YjsHub: unknown message type=%d in room=%s, size=%d", messageType, room, len(data))
	}
}

// Broadcast sends data to all connected clients in a room except the sender
func (h *Hub) Broadcast(room string, sender *websocket.Conn, data []byte) {
	h.mu.RLock()
	clients := h.rooms[room]
	h.mu.RUnlock()

	if clients == nil {
		return
	}

	messageType := websocket.BinaryMessage

	for conn := range clients {
		if conn == sender {
			continue
		}

		// Use per-connection mutex to prevent concurrent writes
		if connMutex, ok := h.connMu[conn]; ok {
			connMutex.Lock()
			if err := conn.WriteMessage(messageType, data); err != nil {
				log.Printf("YjsHub: broadcast error: %v", err)
			}
			connMutex.Unlock()
		}
	}
}

// GetClientCount returns the number of connected clients in a room
func (h *Hub) GetClientCount(room string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if clients, ok := h.rooms[room]; ok {
		return len(clients)
	}
	return 0
}
