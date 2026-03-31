package agent

import (
	"sync"
)

// ScreenshotResponse 等待 Web API 截图请求的 Agent 回包。
type ScreenshotResponse struct {
	PNG []byte
	Err string
}

var screenshotMu sync.Mutex
var screenshotWaiters = make(map[string]chan ScreenshotResponse)

// RegisterScreenshotWait 注册一次性等待；DeliverScreenshotResult 或 ForgetScreenshotWait 会摘除。
func RegisterScreenshotWait(requestID string) <-chan ScreenshotResponse {
	ch := make(chan ScreenshotResponse, 1)
	screenshotMu.Lock()
	screenshotWaiters[requestID] = ch
	screenshotMu.Unlock()
	return ch
}

// ForgetScreenshotWait 超时或放弃等待时调用，避免泄漏。
func ForgetScreenshotWait(requestID string) {
	screenshotMu.Lock()
	delete(screenshotWaiters, requestID)
	screenshotMu.Unlock()
}

// DeliverScreenshotResult Agent 上行 screenshot_result 时调用。
func DeliverScreenshotResult(requestID string, png []byte, err string) {
	screenshotMu.Lock()
	ch, ok := screenshotWaiters[requestID]
	if ok {
		delete(screenshotWaiters, requestID)
	}
	screenshotMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- ScreenshotResponse{PNG: png, Err: err}:
	default:
	}
}
