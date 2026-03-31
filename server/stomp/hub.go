package stomp

import (
	"sync"

	"github.com/google/uuid"
)

// subscriber is one STOMP SUBSCRIBE on a topic.
type subscriber struct {
	subscriptionID string
	send           func([]byte)
}

// Hub fans out MESSAGE frames to WebSocket clients by destination (topic).
type Hub struct {
	mu     sync.RWMutex
	topics map[string][]*subscriber
}

// DefaultHub is used for recording progress and other app events.
var DefaultHub = NewHub()

func NewHub() *Hub {
	return &Hub{topics: make(map[string][]*subscriber)}
}

// Subscribe registers a sender for a STOMP destination. subscriptionID is the client SUBSCRIBE "id" header.
// Returns unsubscribe to call on UNSUBSCRIBE or disconnect.
func (h *Hub) Subscribe(topic, subscriptionID string, send func([]byte)) (unsub func()) {
	s := &subscriber{subscriptionID: subscriptionID, send: send}
	h.mu.Lock()
	h.topics[topic] = append(h.topics[topic], s)
	h.mu.Unlock()
	return func() {
		h.mu.Lock()
		list := h.topics[topic]
		out := list[:0]
		for _, x := range list {
			if x != s {
				out = append(out, x)
			}
		}
		if len(out) == 0 {
			delete(h.topics, topic)
		} else {
			h.topics[topic] = out
		}
		h.mu.Unlock()
	}
}

// PublishJSON sends a JSON body as STOMP MESSAGE to all subscribers of topic.
func (h *Hub) PublishJSON(topic string, jsonBody string) {
	h.mu.RLock()
	list := append([]*subscriber(nil), h.topics[topic]...)
	h.mu.RUnlock()
	if len(list) == 0 {
		return
	}
	for _, s := range list {
		msgID := uuid.New().String()
		frame := MessageJSON(topic, s.subscriptionID, msgID, jsonBody)
		go func(send func([]byte), f []byte) {
			send(f)
		}(s.send, frame)
	}
}
