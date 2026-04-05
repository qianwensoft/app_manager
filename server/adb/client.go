package adb

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type Client struct {
	adbPath string
	timeout time.Duration
}

// ExePath 返回实际用于 exec 的 adb 路径（与 ListDevices/Shell 等一致）。
func (c *Client) ExePath() string {
	return c.adbPath
}

func NewClient(adbPath string, timeoutSec int) *Client {
	p := adbPath
	// 配置为 "adb" 时解析 PATH，避免服务从 systemd/IDE 启动时找不到可执行文件
	if p != "" && !strings.ContainsRune(p, '/') && !strings.ContainsRune(p, '\\') {
		if lp, err := exec.LookPath(p); err == nil {
			p = lp
		}
	}
	return &Client{
		adbPath: p,
		timeout: time.Duration(timeoutSec) * time.Second,
	}
}

func (c *Client) Exec(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, c.adbPath, args...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}

func (c *Client) ExecOnDevice(serial string, args ...string) (string, error) {
	return c.Exec(append([]string{"-s", serial}, args...)...)
}

func (c *Client) Shell(serial string, args ...string) (string, error) {
	return c.ExecOnDevice(serial, append([]string{"shell"}, args...)...)
}

// GetState returns adb get-state for the device (e.g. "device", "offline", "unauthorized").
func (c *Client) GetState(serial string) (string, error) {
	return c.ExecOnDevice(serial, "get-state")
}

func (c *Client) ListDevices() ([]string, error) {
	out, err := c.Exec("devices")
	if err != nil {
		return nil, err
	}
	var serials []string
	for _, line := range strings.Split(out, "\n")[1:] {
		parts := strings.Fields(line)
		if len(parts) >= 2 && parts[1] == "device" {
			serials = append(serials, parts[0])
		}
	}
	return serials, nil
}

func (c *Client) ConnectTCP(ip string, port int) (string, error) {
	return c.Exec("connect", fmt.Sprintf("%s:%d", ip, port))
}

// PairTCP 使用 Android 11+ 无线调试配对码与设备配对。
// adb pair HOST:PORT CODE  — 三参数直接传码，exit=0 表示成功，exit!=0 表示失败。
// 失败时输出含 "Failed to pair"（码错）或 "protocol fault"（连不上）。
func (c *Client) PairTCP(ip string, port int, code string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	addr := fmt.Sprintf("%s:%d", ip, port)
	cmd := exec.CommandContext(ctx, c.adbPath, "pair", addr, code)

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	result := strings.TrimSpace(out.String())
	return result, err
}

func (c *Client) Disconnect(serial string) error {
	_, err := c.Exec("disconnect", serial)
	return err
}

func (c *Client) GetProp(serial, key string) (string, error) {
	return c.Shell(serial, "getprop", key)
}

func (c *Client) Install(serial, apkPath string) (string, error) {
	return c.ExecOnDevice(serial, "install", "-r", apkPath)
}

func (c *Client) Uninstall(serial, pkg string) (string, error) {
	return c.ExecOnDevice(serial, "uninstall", pkg)
}

func (c *Client) Push(serial, local, remote string) (string, error) {
	return c.ExecOnDevice(serial, "push", local, remote)
}

func (c *Client) Pull(serial, remote, local string) (string, error) {
	return c.ExecOnDevice(serial, "pull", remote, local)
}

func (c *Client) Reboot(serial string) error {
	_, err := c.Shell(serial, "reboot")
	return err
}

// fixScreencapPNGBytes 去掉 ADB 管道里误注入的 CRLF，否则魔数虽对但解码/校验可能失败。
func fixScreencapPNGBytes(b []byte) []byte {
	if len(b) == 0 {
		return b
	}
	return bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n"))
}

// Screenshot captures the device display as PNG into savePath.
// Prefer adb exec-out; then shell stdout; last screencap on device + pull.
func (c *Client) Screenshot(serial, savePath string) error {
	var notes []string

	data, err := c.screenshotExecOut(serial)
	if err == nil {
		data = fixScreencapPNGBytes(data)
		if looksLikePNG(data) {
			return os.WriteFile(savePath, data, 0644)
		}
		notes = append(notes, "exec-out 输出不是有效 PNG")
	} else {
		notes = append(notes, fmt.Sprintf("exec-out: %v", err))
	}

	data2, err2 := c.screenshotShellStdout(serial)
	if err2 == nil {
		data2 = fixScreencapPNGBytes(data2)
		if looksLikePNG(data2) {
			return os.WriteFile(savePath, data2, 0644)
		}
		notes = append(notes, "shell 标准输出不是有效 PNG")
	} else {
		notes = append(notes, fmt.Sprintf("shell stdout: %v", err2))
	}

	remote := fmt.Sprintf("/sdcard/.am_screen_%d.png", time.Now().UnixNano())
	if _, err3 := c.Shell(serial, "screencap", "-p", remote); err3 != nil {
		return fmt.Errorf("%s; 设备端 screencap: %w", strings.Join(notes, "; "), err3)
	}
	defer c.Shell(serial, "rm", "-f", remote)
	if _, err4 := c.Pull(serial, remote, savePath); err4 != nil {
		return fmt.Errorf("%s; adb pull: %w", strings.Join(notes, "; "), err4)
	}
	raw, err5 := os.ReadFile(savePath)
	if err5 != nil {
		return fmt.Errorf("%s; 读取拉取文件: %w", strings.Join(notes, "; "), err5)
	}
	fixed := fixScreencapPNGBytes(raw)
	if !looksLikePNG(fixed) {
		_ = os.Remove(savePath)
		return fmt.Errorf("%s; 拉取到的文件不是 PNG（请确认设备已连接且 adb devices 为 device 状态）", strings.Join(notes, "; "))
	}
	if len(fixed) != len(raw) {
		return os.WriteFile(savePath, fixed, 0644)
	}
	return nil
}

func (c *Client) screenshotShellStdout(serial string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.adbPath, "-s", serial, "shell", "screencap", "-p")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

func (c *Client) screenshotExecOut(serial string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.adbPath, "-s", serial, "exec-out", "screencap", "-p")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

func looksLikePNG(b []byte) bool {
	if len(b) < 8 {
		return false
	}
	return b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
}

// KeyEvent 发送按键。息屏时系统常丢弃 input keyevent，故对多数键先发 WAKEUP(224) 再发目标键。
// 不对 POWER(26)/GO_TO_SLEEP(223)/WAKEUP(224) 前置唤醒，避免「先亮屏再按电源」被立刻关掉等问题。
func (c *Client) KeyEvent(serial string, keycode int) error {
	const (
		keycodePower      = 26
		keycodeGoToSleep  = 223
		keycodeWakeup     = 224
	)
	needWake := keycode != keycodeWakeup && keycode != keycodePower && keycode != keycodeGoToSleep
	if needWake {
		_, _ = c.Shell(serial, "input", "keyevent", fmt.Sprintf("%d", keycodeWakeup))
		time.Sleep(280 * time.Millisecond)
	}
	_, err := c.Shell(serial, "input", "keyevent", fmt.Sprintf("%d", keycode))
	return err
}

func (c *Client) InputText(serial, text string) error {
	text = strings.ReplaceAll(text, " ", "%s")
	_, err := c.Shell(serial, "input", "text", text)
	return err
}

func (c *Client) StartApp(serial, pkg string) error {
	_, err := c.Shell(serial, "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1")
	return err
}

func (c *Client) StopApp(serial, pkg string) error {
	_, err := c.Shell(serial, "am", "force-stop", pkg)
	return err
}

func (c *Client) ClearApp(serial, pkg string) error {
	_, err := c.Shell(serial, "pm", "clear", pkg)
	return err
}

func (c *Client) GrantPermission(serial, pkg, permission string) error {
	_, err := c.Shell(serial, "pm", "grant", pkg, permission)
	return err
}

func (c *Client) ListFiles(serial, path string) (string, error) {
	return c.Shell(serial, "ls", "-la", path)
}

func (c *Client) InputTap(serial string, x, y int) (string, error) {
	return c.Shell(serial, "input", "tap", fmt.Sprintf("%d", x), fmt.Sprintf("%d", y))
}

func (c *Client) InputSwipe(serial string, x1, y1, x2, y2, duration int) (string, error) {
	return c.Shell(serial, "input", "swipe", fmt.Sprintf("%d", x1), fmt.Sprintf("%d", y1),
		fmt.Sprintf("%d", x2), fmt.Sprintf("%d", y2), fmt.Sprintf("%d", duration))
}
