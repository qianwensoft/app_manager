package outbound

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// stompFrame STOMP 1.2 帧
type stompFrame struct {
	Command string
	Headers map[string]string
	Body    []byte
}

func (f stompFrame) marshal() []byte {
	var buf bytes.Buffer
	buf.WriteString(f.Command)
	buf.WriteByte('\n')
	for k, v := range f.Headers {
		buf.WriteString(k)
		buf.WriteByte(':')
		buf.WriteString(v)
		buf.WriteByte('\n')
	}
	buf.WriteByte('\n')
	buf.Write(f.Body)
	buf.WriteByte(0) // NULL terminator
	return buf.Bytes()
}

func parseStompFrame(data []byte) (stompFrame, error) {
	// 去掉末尾 NULL
	data = bytes.TrimRight(data, "\x00")
	// 分离 headers 与 body（第一个空行）
	idx := bytes.Index(data, []byte("\n\n"))
	if idx < 0 {
		// 可能是心跳帧（单个 \n 或 \r\n）
		return stompFrame{Command: strings.TrimSpace(string(data))}, nil
	}
	header := data[:idx]
	body := data[idx+2:]
	lines := strings.Split(string(header), "\n")
	f := stompFrame{
		Command: strings.TrimSpace(lines[0]),
		Headers: make(map[string]string),
		Body:    body,
	}
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		colon := strings.IndexByte(line, ':')
		if colon < 0 {
			continue
		}
		f.Headers[strings.TrimSpace(line[:colon])] = strings.TrimSpace(line[colon+1:])
	}
	return f, nil
}

func stompConnect(conn *websocket.Conn, cfg TriggerConfig) error {
	connectFrame := stompFrame{
		Command: "CONNECT",
		Headers: map[string]string{
			"accept-version": "1.2",
			"host":           extractHostFromURL(cfg.URL),
		},
	}
	if cfg.Login != "" {
		connectFrame.Headers["login"] = cfg.Login
		connectFrame.Headers["passcode"] = cfg.Passcode
	}
	if err := conn.WriteMessage(websocket.TextMessage, connectFrame.marshal()); err != nil {
		return fmt.Errorf("CONNECT send: %w", err)
	}
	// 等待 CONNECTED
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("CONNECTED recv: %w", err)
	}
	_ = conn.SetReadDeadline(time.Time{})
	frame, err := parseStompFrame(msg)
	if err != nil || frame.Command != "CONNECTED" {
		return fmt.Errorf("expected CONNECTED, got %q", frame.Command)
	}
	return nil
}

func stompSubscribe(conn *websocket.Conn, destination string) error {
	subFrame := stompFrame{
		Command: "SUBSCRIBE",
		Headers: map[string]string{
			"id":          "sub-0",
			"destination": destination,
			"ack":         "auto",
		},
	}
	return conn.WriteMessage(websocket.TextMessage, subFrame.marshal())
}

func extractHostFromURL(u string) string {
	// ws://host:port/path → host:port
	s := strings.TrimPrefix(u, "ws://")
	s = strings.TrimPrefix(s, "wss://")
	if idx := strings.IndexByte(s, '/'); idx >= 0 {
		s = s[:idx]
	}
	return s
}

func runSTOMPTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	reconnectDelay := time.Duration(cfg.ReconnectDelayMS) * time.Millisecond
	if reconnectDelay <= 0 {
		reconnectDelay = 5 * time.Second
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := stompRun(ctx, db, sess, cfg); err != nil {
			log.Printf("trigger[stomp] session %q error: %v — reconnect in %s", sess.key, err, reconnectDelay)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

func stompRun(ctx context.Context, db *gorm.DB, sess *triggerSession, cfg TriggerConfig) error {
	hdr := http.Header{}
	for k, v := range cfg.Headers {
		hdr.Set(k, v)
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, cfg.URL, hdr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	if err := stompConnect(conn, cfg); err != nil {
		return fmt.Errorf("stomp connect: %w", err)
	}
	if err := stompSubscribe(conn, cfg.Destination); err != nil {
		return fmt.Errorf("stomp subscribe: %w", err)
	}
	log.Printf("trigger[stomp] session %q subscribed to %q", sess.key, cfg.Destination)

	// 心跳：每 20s 发一个换行作为 STOMP 心跳
	heartbeatTicker := time.NewTicker(20 * time.Second)
	defer heartbeatTicker.Stop()

	msgCh := make(chan []byte, 64)
	errCh := make(chan error, 1)

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			select {
			case msgCh <- msg:
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			// 发 DISCONNECT
			disc := stompFrame{Command: "DISCONNECT", Headers: map[string]string{"receipt": "bye"}}
			_ = conn.WriteMessage(websocket.TextMessage, disc.marshal())
			return nil
		case err := <-errCh:
			return err
		case raw := <-msgCh:
			frame, err := parseStompFrame(raw)
			if err != nil {
				continue
			}
			switch frame.Command {
			case "MESSAGE":
				if len(frame.Body) > 0 {
					DispatchTriggerMessage(db, sess, frame.Body)
				}
			case "ERROR":
				return fmt.Errorf("STOMP ERROR: %s", string(frame.Body))
			case "RECEIPT", "":
				// ignore
			default:
				// heartbeat or unknown
			}
		case <-heartbeatTicker.C:
			_ = conn.WriteMessage(websocket.TextMessage, []byte("\n"))
		}
	}
}
