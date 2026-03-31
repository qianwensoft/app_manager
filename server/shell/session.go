package shell

import (
	"io"
	"log"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// RunADBShell 在服务器侧通过 adb + PTY 与设备上的交互式 shell 双向转发，直到 WebSocket 关闭。
// adbPath 为 adb 可执行文件路径；serial 为 adb devices 中的设备序列号（非 agent- 占位串）。
func RunADBShell(conn *websocket.Conn, adbPath, serial string) {
	if err := conn.WriteJSON(map[string]interface{}{
		"type": "shell_meta",
		"mode": "adb",
	}); err != nil {
		return
	}

	cmd := exec.Command(adbPath, "-s", serial, "shell")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("RunADBShell pty.Start: %v", err)
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31m[server] 无法启动 adb shell PTY: "+err.Error()+"\x1b[0m\r\n"))
		return
	}

	var once sync.Once
	closeAll := func() {
		once.Do(func() {
			_ = ptmx.Close()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = conn.Close()
		})
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		buf := make([]byte, 32*1024)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					closeAll()
					return
				}
			}
			if err != nil {
				if err != io.EOF && err != io.ErrUnexpectedEOF {
					log.Printf("RunADBShell pty read: %v", err)
				}
				closeAll()
				return
			}
		}
	}()

	go func() {
		defer wg.Done()
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				closeAll()
				return
			}
			if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
				continue
			}
			if len(msg) == 0 {
				continue
			}
			if _, err := ptmx.Write(msg); err != nil {
				closeAll()
				return
			}
		}
	}()

	wg.Wait()
}
