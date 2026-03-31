package agent

import (
	"os"
	"sync"
)

// PulledApkReply Agent 上传拉取的 APK（或 zip）后，唤醒等待中的 HTTP 请求。
type PulledApkReply struct {
	Path     string
	Err      string
	FileName string // 来自 Agent 的 X-Export-Filename，可选
}

type pulledApkWaitEntry struct {
	ch       chan PulledApkReply
	deviceID uint
}

var pulledApkMu sync.Mutex
var pulledApkWaiters = make(map[string]*pulledApkWaitEntry)

func RegisterPulledApkWait(requestID string, deviceID uint) <-chan PulledApkReply {
	ch := make(chan PulledApkReply, 1)
	pulledApkMu.Lock()
	pulledApkWaiters[requestID] = &pulledApkWaitEntry{ch: ch, deviceID: deviceID}
	pulledApkMu.Unlock()
	return ch
}

func ForgetPulledApkWait(requestID string) {
	pulledApkMu.Lock()
	delete(pulledApkWaiters, requestID)
	pulledApkMu.Unlock()
}

// DeliverPulledApkResult 仅当 requestID 存在且 deviceID 与注册时一致时投递；Path 为临时文件路径，调用方负责删除。
func DeliverPulledApkResult(requestID string, deviceID uint, path, err, fileName string) {
	pulledApkMu.Lock()
	ent, ok := pulledApkWaiters[requestID]
	match := ok && ent.deviceID == deviceID
	if match {
		delete(pulledApkWaiters, requestID)
	}
	pulledApkMu.Unlock()
	if !match {
		if path != "" {
			_ = os.Remove(path)
		}
		return
	}
	select {
	case ent.ch <- PulledApkReply{Path: path, Err: err, FileName: fileName}:
	default:
		if path != "" {
			_ = os.Remove(path)
		}
	}
}
