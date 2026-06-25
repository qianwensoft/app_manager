package scada

import (
	"sync"

	"github.com/gorilla/websocket"
)

const streamSendBuf = 256 // per-connection outbound queue depth

// streamClient wraps a WebSocket conn with a dedicated write goroutine,
// ensuring only one goroutine ever calls WriteMessage on the connection.
type streamClient struct {
	conn   *websocket.Conn
	sendCh chan []byte
	once   sync.Once
}

func newStreamClient(conn *websocket.Conn) *streamClient {
	c := &streamClient{
		conn:   conn,
		sendCh: make(chan []byte, streamSendBuf),
	}
	go c.writeLoop()
	return c
}

// send enqueues a frame for delivery. Returns false if the queue is full
// (slow consumer) — caller should close the client.
func (c *streamClient) send(frame []byte) bool {
	select {
	case c.sendCh <- frame:
		return true
	default:
		return false // queue full, drop & signal removal
	}
}

// close drains and stops the write goroutine.
func (c *streamClient) close() {
	c.once.Do(func() { close(c.sendCh) })
}

func (c *streamClient) writeLoop() {
	for frame := range c.sendCh {
		if err := c.conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
			// connection gone — drain remaining frames and exit
			for range c.sendCh {
			}
			return
		}
	}
}

// ---------------------------------------------------------------------------

// StreamHub manages per-scadaCode WebSocket subscriber sets for raw binary streaming.
var StreamHub = newStreamHub()

type streamHub struct {
	mu   sync.RWMutex
	subs map[string]map[*websocket.Conn]*streamClient
}

func newStreamHub() *streamHub {
	return &streamHub{subs: make(map[string]map[*websocket.Conn]*streamClient)}
}

// Subscribe registers conn as a subscriber for scadaCode.
func (h *streamHub) Subscribe(scadaCode string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[scadaCode] == nil {
		h.subs[scadaCode] = make(map[*websocket.Conn]*streamClient)
	}
	if _, exists := h.subs[scadaCode][conn]; !exists {
		h.subs[scadaCode][conn] = newStreamClient(conn)
	}
}

// Unsubscribe removes conn from the subscriber set for scadaCode.
func (h *streamHub) Unsubscribe(scadaCode string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.subs[scadaCode]; ok {
		if c, ok := s[conn]; ok {
			c.close()
			delete(s, conn)
		}
		if len(s) == 0 {
			delete(h.subs, scadaCode)
		}
	}
}

// Publish enqueues the raw binary frame to all subscribers for scadaCode.
// Slow consumers (full send queue) are removed silently.
func (h *streamHub) Publish(scadaCode string, frame []byte) {
	h.mu.RLock()
	clients := h.subs[scadaCode]
	if len(clients) == 0 {
		h.mu.RUnlock()
		return
	}
	type entry struct {
		conn *websocket.Conn
		c    *streamClient
	}
	snapshot := make([]entry, 0, len(clients))
	for conn, c := range clients {
		snapshot = append(snapshot, entry{conn, c})
	}
	h.mu.RUnlock()

	var failed []*websocket.Conn
	for _, e := range snapshot {
		if !e.c.send(frame) {
			e.c.close()
			failed = append(failed, e.conn)
		}
	}
	if len(failed) > 0 {
		h.mu.Lock()
		s := h.subs[scadaCode]
		for _, conn := range failed {
			delete(s, conn)
		}
		if len(s) == 0 {
			delete(h.subs, scadaCode)
		}
		h.mu.Unlock()
	}
}
