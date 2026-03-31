package screen

import "sync"

// 控制何时向 Agent 下发 start_screen / stop_screen。
// agentCaptureHeld：已成功收到过投屏画面后置 true，浏览器仅刷新/关闭 WebSocket 时不再自动 stop_screen，
// 以便同一授权会话内重连无需再次弹出 MediaProjection；仅显式 viewer_stop_screen 或录屏结束且无保留需求时 stop。
type routeCaptureState struct {
	viewers          int
	recording        bool
	agentCaptureHeld bool
}

var captureMu sync.Mutex
var captureByKey = make(map[string]*routeCaptureState)

func getOrCreateCapture(key string) *routeCaptureState {
	s := captureByKey[key]
	if s == nil {
		s = &routeCaptureState{}
		captureByKey[key] = s
	}
	return s
}

func captureActive(s *routeCaptureState) bool {
	return s != nil && (s.viewers > 0 || s.recording || s.agentCaptureHeld)
}

// MarkAgentCaptureHeld 在收到 Agent 首帧画面后调用，表示 MediaProjection 已生效，可保持会话供页面刷新重连。
func MarkAgentCaptureHeld(routeKey string) {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := getOrCreateCapture(routeKey)
	s.agentCaptureHeld = true
}

// RequestViewerStopCapture 浏览器显式「断开投屏」：清除保持标志，以便下次连接重新走授权（若需要）。
func RequestViewerStopCapture(routeKey string) {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := captureByKey[routeKey]
	if s == nil {
		return
	}
	s.agentCaptureHeld = false
	if s.viewers == 0 && !s.recording {
		delete(captureByKey, routeKey)
	}
}

// ViewerJoined 返回是否需要在本次连接后下发 start_screen（当前无任何采集需求）。
func ViewerJoined(routeKey string) bool {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := getOrCreateCapture(routeKey)
	was := captureActive(s)
	s.viewers++
	return !was
}

// ViewerLeft 浏览器断开 WebSocket（含刷新页面）；不再根据人数自动 stop_screen。
func ViewerLeft(routeKey string) {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := captureByKey[routeKey]
	if s == nil {
		return
	}
	s.viewers--
	if s.viewers < 0 {
		s.viewers = 0
	}
	if s.viewers == 0 && !s.recording && !s.agentCaptureHeld {
		delete(captureByKey, routeKey)
	}
}

// RecordingBegun 返回是否因本次录屏需要下发 start_screen。
func RecordingBegun(routeKey string) bool {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := getOrCreateCapture(routeKey)
	was := captureActive(s)
	s.recording = true
	return !was
}

// RecordingEnded 返回是否应下发 stop_screen（已结束录屏且无人观看、也未保持投屏会话）。
func RecordingEnded(routeKey string) bool {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := captureByKey[routeKey]
	if s == nil {
		return false
	}
	was := captureActive(s)
	s.recording = false
	now := captureActive(s)
	if s.viewers == 0 && !s.recording && !s.agentCaptureHeld {
		delete(captureByKey, routeKey)
	}
	return was && !now
}

// ResetCaptureRoute Agent 断开等场景：清空状态（不发送 stop，由 Agent 已离线）。
func ResetCaptureRoute(routeKey string) {
	captureMu.Lock()
	delete(captureByKey, routeKey)
	captureMu.Unlock()
}

// RecordingUndo StartServerRecording 失败时回滚 recording 标志；若需释放采集则返回 true（应 stop_screen）。
func RecordingUndo(routeKey string) (needStopScreen bool) {
	captureMu.Lock()
	defer captureMu.Unlock()
	s := captureByKey[routeKey]
	if s == nil {
		return false
	}
	was := captureActive(s)
	s.recording = false
	now := captureActive(s)
	if s.viewers == 0 && !s.recording && !s.agentCaptureHeld {
		delete(captureByKey, routeKey)
	}
	return was && !now
}
