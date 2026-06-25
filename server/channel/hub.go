package channel

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// ── WebSocket channel (for external apps) ─────────────────────────────────────

type wsConn interface {
	ReadMessage() (int, []byte, error)
	WriteMessage(int, []byte) error
	Close() error
}

type wsChannelClient struct {
	conn wsConn
	send chan []byte
}

type ChannelHub struct {
	mu          sync.RWMutex
	clients     map[*wsChannelClient]bool
	subscribers map[string][]chan []byte
}

var Hub = &ChannelHub{
	clients:     make(map[*wsChannelClient]bool),
	subscribers: make(map[string][]chan []byte),
}

// Subscribe returns a channel that receives messages published to topic.
func (h *ChannelHub) Subscribe(ctx context.Context, topic string) <-chan []byte {
	ch := make(chan []byte, 64)
	h.mu.Lock()
	h.subscribers[topic] = append(h.subscribers[topic], ch)
	h.mu.Unlock()
	go func() {
		<-ctx.Done()
		h.mu.Lock()
		subs := h.subscribers[topic]
		for i, s := range subs {
			if s == ch {
				h.subscribers[topic] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		h.mu.Unlock()
		close(ch)
	}()
	return ch
}

// Publish broadcasts a message to all internal subscribers of topic.
func (h *ChannelHub) Publish(topic string, payload []byte) {
	h.mu.RLock()
	subs := h.subscribers[topic]
	h.mu.RUnlock()
	for _, ch := range subs {
		select {
		case ch <- payload:
		default:
		}
	}
}

// ServeWS handles an external WebSocket connection.
func (h *ChannelHub) ServeWS(conn wsConn) {
	client := &wsChannelClient{conn: conn, send: make(chan []byte, 128)}
	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	go func() {
		for msg := range client.send {
			if err := conn.WriteMessage(1, msg); err != nil {
				break
			}
		}
		conn.Close()
	}()

	defer func() {
		h.mu.Lock()
		delete(h.clients, client)
		h.mu.Unlock()
		close(client.send)
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg struct {
			Topic   string          `json:"topic"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil || msg.Topic == "" {
			continue
		}
		h.Publish(msg.Topic, msg.Payload)
	}
}

// ── Kafka consumer (via REST proxy) ──────────────────────────────────────────

type KafkaConfig struct {
	Enabled      bool
	GroupID      string
	Topics       []string
	RestProxyURL string
}

type KafkaConsumer struct {
	cfg KafkaConfig
	hub *ChannelHub
}

func NewKafkaConsumer(hub *ChannelHub, cfg KafkaConfig) *KafkaConsumer {
	return &KafkaConsumer{cfg: cfg, hub: hub}
}

func (k *KafkaConsumer) Start(ctx context.Context) {
	if !k.cfg.Enabled {
		return
	}
	if k.cfg.RestProxyURL == "" {
		log.Println("[channel/kafka] no rest_proxy_url configured — Kafka channel disabled")
		return
	}
	for _, topic := range k.cfg.Topics {
		go k.consumeTopic(ctx, topic)
	}
}

func (k *KafkaConsumer) consumeTopic(ctx context.Context, topic string) {
	log.Printf("[channel/kafka] starting consumer for topic %s via %s", topic, k.cfg.RestProxyURL)
	url := fmt.Sprintf("%s/consumers/%s/instances/%s-inst/records",
		k.cfg.RestProxyURL, k.cfg.GroupID, k.cfg.GroupID)
	client := &http.Client{Timeout: 10 * time.Second}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
		req.Header.Set("Accept", "application/vnd.kafka.json.v2+json")
		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		var records []struct {
			Topic string          `json:"topic"`
			Value json.RawMessage `json:"value"`
		}
		json.NewDecoder(resp.Body).Decode(&records)
		resp.Body.Close()

		for _, r := range records {
			if r.Topic == topic || r.Topic == "" {
				k.hub.Publish("kafka/"+topic, r.Value)
			}
		}

		if len(records) == 0 {
			time.Sleep(500 * time.Millisecond)
		}
	}
}
