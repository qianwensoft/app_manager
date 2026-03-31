package logcat

import (
	"bufio"
	"context"
	"log"
	"os/exec"

	"github.com/gorilla/websocket"
)

type Session struct {
	DeviceID string
	Conn     *websocket.Conn
	cancel   context.CancelFunc
}

func NewSession(deviceID string, conn *websocket.Conn, adbPath, filter string) (*Session, error) {
	ctx, cancel := context.WithCancel(context.Background())

	args := []string{"-s", deviceID, "logcat"}
	if filter != "" {
		args = append(args, filter)
	}

	cmd := exec.CommandContext(ctx, adbPath, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	s := &Session{DeviceID: deviceID, Conn: conn, cancel: cancel}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if err := conn.WriteMessage(websocket.TextMessage, scanner.Bytes()); err != nil {
				break
			}
		}
		s.Close()
	}()

	// 客户端断开时停止
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				s.Close()
				break
			}
		}
	}()

	log.Printf("Logcat session started: %s", deviceID)
	return s, nil
}

func (s *Session) Close() {
	s.cancel()
	s.Conn.Close()
}
