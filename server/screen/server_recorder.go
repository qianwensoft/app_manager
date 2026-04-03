package screen

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type recordingSession struct {
	dir       string
	frameIdx  int
	deviceID  uint
	startedAt time.Time
	mu        sync.Mutex
}

var (
	recSessionsMu sync.Mutex
	recSessions   = make(map[string]*recordingSession) // routeKey
)

// PublishRecordingProgress STOMP 通知 Web 端录屏进度（与 api/recording 共用逻辑）。
func PublishRecordingProgress(deviceID uint, phase string, extra map[string]interface{}) {
	payload := map[string]interface{}{
		"type":      "recording_progress",
		"device_id": deviceID,
		"phase":     phase,
		"ts":        time.Now().UnixMilli(),
	}
	for k, v := range extra {
		payload[k] = v
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	topic := fmt.Sprintf("/topic/device/%d/recording", deviceID)
	stomp.DefaultHub.PublishJSON(topic, string(b))
}

// StartServerRecording 在服务器上开始缓存 JPEG 帧（需已有屏幕帧上行）。
func StartServerRecording(routeKey string, deviceID uint) error {
	recSessionsMu.Lock()
	defer recSessionsMu.Unlock()
	if recSessions[routeKey] != nil {
		return nil
	}
	dir, err := os.MkdirTemp("", fmt.Sprintf("am_rec_%d_*", deviceID))
	if err != nil {
		return err
	}
	recSessions[routeKey] = &recordingSession{
		dir:       dir,
		frameIdx:  0,
		deviceID:  deviceID,
		startedAt: time.Now(),
	}
	PublishRecordingProgress(deviceID, "server_recording_started", nil)
	log.Printf("server recording started routeKey=%s deviceID=%d dir=%s", routeKey, deviceID, dir)
	return nil
}

// AppendRecordingFrame 从 Agent screen_frame 的 data 字段解析 base64 JPEG 并落盘。
func AppendRecordingFrame(routeKey string, data map[string]interface{}) {
	recSessionsMu.Lock()
	sess := recSessions[routeKey]
	recSessionsMu.Unlock()
	if sess == nil {
		return
	}
	b64, _ := data["data"].(string)
	if b64 == "" {
		return
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(raw) == 0 {
		return
	}
	sess.mu.Lock()
	sess.frameIdx++
	idx := sess.frameIdx
	dir := sess.dir
	sess.mu.Unlock()
	name := filepath.Join(dir, fmt.Sprintf("%08d.jpg", idx))
	if err := os.WriteFile(name, raw, 0644); err != nil {
		log.Printf("recording frame write: %v", err)
	}
}

// AppendRecordingFrameRaw 将 Agent 二进制投屏帧中的裸 JPEG 落盘（与 AppendRecordingFrame 二选一，由上行格式决定）。
func AppendRecordingFrameRaw(routeKey string, raw []byte) {
	if len(raw) == 0 {
		return
	}
	recSessionsMu.Lock()
	sess := recSessions[routeKey]
	recSessionsMu.Unlock()
	if sess == nil {
		return
	}
	sess.mu.Lock()
	sess.frameIdx++
	idx := sess.frameIdx
	dir := sess.dir
	sess.mu.Unlock()
	name := filepath.Join(dir, fmt.Sprintf("%08d.jpg", idx))
	if err := os.WriteFile(name, raw, 0644); err != nil {
		log.Printf("recording frame write: %v", err)
	}
}

// StopServerRecording 将帧序列交给 ffmpeg 合成 MP4，写入 recordings 表。
func StopServerRecording(routeKey string) {
	recSessionsMu.Lock()
	sess := recSessions[routeKey]
	delete(recSessions, routeKey)
	recSessionsMu.Unlock()
	if sess == nil {
		return
	}
	devID := sess.deviceID
	go finalizeRecordingSession(sess, devID)
}

func finalizeRecordingSession(sess *recordingSession, devID uint) {
	defer os.RemoveAll(sess.dir)

	sess.mu.Lock()
	n := sess.frameIdx
	sess.mu.Unlock()
	if n == 0 {
		PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": "没有收到任何画面帧，无法生成录屏"})
		return
	}

	PublishRecordingProgress(devID, "server_encoding", map[string]interface{}{"frames": n})

	ffmpegPath, err := resolveFFmpegExecutable()
	if err != nil {
		PublishRecordingProgress(devID, "failed", map[string]interface{}{
			"error": "未找到 ffmpeg，无法合成 MP4。请在服务器安装 ffmpeg（如 apt install ffmpeg / brew install ffmpeg），" +
				"或在 config.yaml 设置 ffmpeg.path、或环境变量 FFMPEG_PATH 指向可执行文件。",
		})
		return
	}

	outDir := filepath.Join(config.C.Storage.Path, "recordings")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": err.Error()})
		return
	}
	saveName := fmt.Sprintf("device_%d_%d.mp4", devID, time.Now().UnixMilli())
	savePath := filepath.Join(outDir, saveName)
	pattern := filepath.Join(sess.dir, "%08d.jpg")
	// 输入从 00000001.jpg 起
	cmd := exec.Command(ffmpegPath,
		"-y", "-hide_banner", "-loglevel", "error",
		"-framerate", "8",
		"-start_number", "1",
		"-i", pattern,
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		savePath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		log.Printf("ffmpeg failed: %v %s", err, string(out))
		PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": fmt.Sprintf("ffmpeg 编码失败: %v", err)})
		return
	}

	fi, err := os.Stat(savePath)
	if err != nil {
		PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": err.Error()})
		return
	}
	durationSec := int(time.Since(sess.startedAt).Seconds())
	if durationSec < 1 {
		durationSec = 1
	}
	rec := models.Recording{
		DeviceID:  devID,
		FileName:  saveName,
		FilePath:  savePath,
		FileSize:  fi.Size(),
		Duration:  durationSec,
		CreatedBy: 0,
	}

	// 异步生成 HLS（-c copy 直接从 MP4 切片，速度很快）
	hlsDir := filepath.Join(outDir, fmt.Sprintf("hls_%d_%d", devID, time.Now().UnixMilli()))
	if err := os.MkdirAll(hlsDir, 0755); err == nil {
		hlsCmd := exec.Command(ffmpegPath,
			"-y", "-hide_banner", "-loglevel", "error",
			"-i", savePath,
			"-c", "copy",
			"-hls_time", "4",
			"-hls_playlist_type", "vod",
			"-hls_segment_filename", filepath.Join(hlsDir, "seg_%03d.ts"),
			filepath.Join(hlsDir, "index.m3u8"),
		)
		if hlsOut, hlsErr := hlsCmd.CombinedOutput(); hlsErr != nil {
			log.Printf("HLS generation failed: %v %s", hlsErr, string(hlsOut))
			os.RemoveAll(hlsDir)
		} else {
			rec.HlsDir = hlsDir
		}
	}
	if err := database.DB.Create(&rec).Error; err != nil {
		_ = os.Remove(savePath)
		PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": err.Error()})
		return
	}
	pub := map[string]interface{}{
		"id":         rec.ID,
		"device_id":  rec.DeviceID,
		"file_name":  rec.FileName,
		"file_size":  rec.FileSize,
		"duration":   rec.Duration,
		"created_by": rec.CreatedBy,
		"created_at": rec.CreatedAt,
	}
	PublishRecordingProgress(devID, "saved", map[string]interface{}{"recording": pub})
	log.Printf("server recording saved id=%d path=%s", rec.ID, savePath)
}

// AbortServerRecording Agent 断开时丢弃临时文件。
func AbortServerRecording(routeKey string) {
	recSessionsMu.Lock()
	sess := recSessions[routeKey]
	delete(recSessions, routeKey)
	recSessionsMu.Unlock()
	if sess == nil {
		return
	}
	devID := sess.deviceID
	_ = os.RemoveAll(sess.dir)
	PublishRecordingProgress(devID, "failed", map[string]interface{}{"error": "设备已断开，服务器录屏已中止"})
	log.Printf("server recording aborted routeKey=%s", routeKey)
}

// ResolveFFmpeg 供外部包调用。
func ResolveFFmpeg() (string, error) { return resolveFFmpegExecutable() }
func resolveFFmpegExecutable() (string, error) {
	p := strings.TrimSpace(config.C.FFmpeg.Path)
	if p == "" {
		return exec.LookPath("ffmpeg")
	}
	clean := filepath.Clean(p)
	if filepath.IsAbs(clean) || strings.ContainsAny(clean, `/\`) {
		st, err := os.Stat(clean)
		if err != nil {
			return "", err
		}
		if st.IsDir() {
			return "", fmt.Errorf("ffmpeg.path 是目录: %s", clean)
		}
		return clean, nil
	}
	return exec.LookPath(clean)
}
