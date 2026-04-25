package outbound

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

func runWebSocketTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	reconnectDelay := time.Duration(cfg.ReconnectDelayMS) * time.Millisecond
	if reconnectDelay <= 0 {
		reconnectDelay = 5 * time.Second
	}
	pingInterval := time.Duration(cfg.PingIntervalMS) * time.Millisecond
	if pingInterval <= 0 {
		pingInterval = 30 * time.Second
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := wsConnect(ctx, db, sess, cfg, pingInterval); err != nil {
			log.Printf("trigger[ws] session %q error: %v — reconnect in %s", sess.key, err, reconnectDelay)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

func wsConnect(ctx context.Context, db *gorm.DB, sess *triggerSession, cfg TriggerConfig, pingInterval time.Duration) error {
	dialer := websocket.DefaultDialer
	hdr := http.Header{}
	for k, v := range cfg.Headers {
		hdr.Set(k, v)
	}

	conn, _, err := dialer.DialContext(ctx, cfg.URL, hdr)
	if err != nil {
		return err
	}
	defer conn.Close()

	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(pingInterval * 2))
		return nil
	})

	log.Printf("trigger[ws] session %q connected", sess.key)

	pingTicker := time.NewTicker(pingInterval)
	defer pingTicker.Stop()

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
			_ = conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return nil
		case err := <-errCh:
			return err
		case msg := <-msgCh:
			DispatchTriggerMessage(db, sess, msg)
		case <-pingTicker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return err
			}
		}
	}
}
