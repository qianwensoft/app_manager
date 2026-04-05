// app-manager-bridge — 本地 ADB Bridge
// 监听 127.0.0.1:17175，通过 WebSocket 向浏览器推送本机 USB 连接的 Android 设备列表。
// 浏览器可发送命令注册设备到 app-manager 服务器。
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const listenAddr = "127.0.0.1:17175"

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // 允许所有来源（本地服务）
}

// Device 表示一个 USB 连接的 Android 设备
type Device struct {
	Serial  string `json:"serial"`
	State   string `json:"state"`
	Model   string `json:"model"`
	Product string `json:"product"`
}

// Message 是 Bridge 与浏览器之间的 WebSocket 消息格式
type Message struct {
	Type    string      `json:"type"`
	Devices []Device    `json:"devices,omitempty"`
	Error   string      `json:"error,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// Command 是浏览器发来的命令
type Command struct {
	Action     string `json:"action"`
	Serial     string `json:"serial"`
	ServerURL  string `json:"server_url"`
	Token      string `json:"token"`
	DeviceName string `json:"device_name"`
}

func adbPath() string {
	if p := os.Getenv("ADB_PATH"); p != "" {
		return p
	}
	if runtime.GOOS == "windows" {
		return "adb.exe"
	}
	return "adb"
}

func runAdb(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, adbPath(), args...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}

// listDevices 扫描本机 USB 连接的 Android 设备
func listDevices() []Device {
	out, err := runAdb("devices", "-l")
	if err != nil {
		return nil
	}
	var devices []Device
	for _, line := range strings.Split(out, "\n")[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		serial := fields[0]
		state := fields[1]
		// 只保留 USB 设备（不含 ip:port 格式的无线设备）
		if strings.Contains(serial, ":") {
			continue
		}
		d := Device{Serial: serial, State: state}
		// 从 -l 输出解析 model 和 product
		for _, f := range fields[2:] {
			if strings.HasPrefix(f, "model:") {
				d.Model = strings.ReplaceAll(strings.TrimPrefix(f, "model:"), "_", " ")
			}
			if strings.HasPrefix(f, "product:") {
				d.Product = strings.TrimPrefix(f, "product:")
			}
		}
		devices = append(devices, d)
	}
	return devices
}

// registerDevice 通过 app-manager API 注册设备
func registerDevice(cmd Command) error {
	name := cmd.DeviceName
	if name == "" {
		name = cmd.Serial
	}
	body, _ := json.Marshal(map[string]string{
		"serial": cmd.Serial,
		"name":   name,
	})
	req, err := http.NewRequest("POST", cmd.ServerURL+"/api/devices", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if cmd.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cmd.Token)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var result map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		if e, ok := result["error"].(string); ok {
			return fmt.Errorf("%s", e)
		}
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()
	log.Printf("Browser connected from %s", r.RemoteAddr)

	// 立即推送当前设备列表
	sendDevices(conn)

	// 定时推送设备列表（每 2 秒）
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var cmd Command
			if err := json.Unmarshal(msg, &cmd); err != nil {
				continue
			}
			handleCommand(conn, cmd)
		}
	}()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			sendDevices(conn)
		}
	}
}

func sendDevices(conn *websocket.Conn) {
	devices := listDevices()
	if devices == nil {
		devices = []Device{}
	}
	msg := Message{Type: "devices", Devices: devices}
	data, _ := json.Marshal(msg)
	_ = conn.WriteMessage(websocket.TextMessage, data)
}

func handleCommand(conn *websocket.Conn, cmd Command) {
	switch cmd.Action {
	case "register":
		err := registerDevice(cmd)
		var msg Message
		if err != nil {
			msg = Message{Type: "register_result", Error: err.Error()}
		} else {
			msg = Message{Type: "register_result", Data: map[string]string{"serial": cmd.Serial}}
		}
		data, _ := json.Marshal(msg)
		_ = conn.WriteMessage(websocket.TextMessage, data)

	case "scan":
		sendDevices(conn)
	}
}

func main() {
	log.Printf("App Manager Bridge v1.0 — 监听 ws://%s", listenAddr)
	log.Printf("ADB 路径: %s", adbPath())

	// 检查 adb 是否可用
	if out, err := runAdb("version"); err != nil {
		log.Printf("警告: adb 不可用 (%v)，请确认 adb 已安装并在 PATH 中", err)
	} else {
		log.Printf("ADB: %s", strings.Split(out, "\n")[0])
	}

	http.HandleFunc("/ws", handleWS)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{Addr: listenAddr}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Bridge 启动失败: %v", err)
		}
	}()

	log.Printf("Bridge 已启动，等待浏览器连接...")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("Bridge 已停止")
}
