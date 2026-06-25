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

// TopicStat holds runtime counters for one topic.
type TopicStat struct {
	Topic    string `json:"topic"`
	SubCount int    `json:"sub_count"`
	MsgCount int64  `json:"msg_count"`
}

// Hub fans out MESSAGE frames to WebSocket clients by destination (topic).
type Hub struct {
	mu       sync.RWMutex
	topics   map[string][]*subscriber
	msgCount map[string]int64 // published message count per topic
}

// DefaultHub is used for recording progress and other app events.
var DefaultHub = NewHub()

var publishHook func(topic, jsonBody string)

// subscribeHook is called after each subscribe/unsubscribe to allow pushing stats updates.
var subscribeHook func()

// SetPublishHook is called after local delivery (e.g. cluster Redis mirror).
func SetPublishHook(fn func(topic, jsonBody string)) {
	publishHook = fn
}

// SetSubscribeHook registers a callback fired after each subscribe or unsubscribe.
func SetSubscribeHook(fn func()) {
	subscribeHook = fn
}

func NewHub() *Hub {
	return &Hub{
		topics:   make(map[string][]*subscriber),
		msgCount: make(map[string]int64),
	}
}

// Subscribe registers a sender for a STOMP destination. subscriptionID is the client SUBSCRIBE "id" header.
// Returns unsubscribe to call on UNSUBSCRIBE or disconnect.
func (h *Hub) Subscribe(topic, subscriptionID string, send func([]byte)) (unsub func()) {
	s := &subscriber{subscriptionID: subscriptionID, send: send}
	h.mu.Lock()
	h.topics[topic] = append(h.topics[topic], s)
	h.mu.Unlock()
	if subscribeHook != nil {
		go subscribeHook()
	}
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
		if subscribeHook != nil {
			go subscribeHook()
		}
	}
}

// PublishJSON sends a JSON body as STOMP MESSAGE to all local subscribers of topic,
// then invokes the optional publish hook for cross-node fan-out.
func (h *Hub) PublishJSON(topic string, jsonBody string) {
	h.PublishJSONLocal(topic, jsonBody)
	if publishHook != nil {
		publishHook(topic, jsonBody)
	}
}

// PublishJSONLocal delivers only to subscribers on this process (no cluster hook).
func (h *Hub) PublishJSONLocal(topic string, jsonBody string) {
	h.mu.Lock()
	list := append([]*subscriber(nil), h.topics[topic]...)
	h.msgCount[topic]++
	h.mu.Unlock()
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

// Stats returns a snapshot of per-topic subscriber counts and message counts.
func (h *Hub) Stats() []TopicStat {
	h.mu.RLock()
	defer h.mu.RUnlock()
	// union of topics with subscribers and topics that have received messages
	keys := make(map[string]struct{}, len(h.topics))
	for t := range h.topics {
		keys[t] = struct{}{}
	}
	for t := range h.msgCount {
		keys[t] = struct{}{}
	}
	stats := make([]TopicStat, 0, len(keys))
	for t := range keys {
		stats = append(stats, TopicStat{
			Topic:    t,
			SubCount: len(h.topics[t]),
			MsgCount: h.msgCount[t],
		})
	}
	return stats
}
