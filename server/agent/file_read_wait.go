package agent

import "sync"

// FileReadResponse Web 等待 Agent 上传文件后的本地临时路径。
type FileReadResponse struct {
	TempPath string
	Err      string
}

var fileReadMu sync.Mutex
var fileReadWaiters = make(map[string]chan FileReadResponse)

func RegisterFileReadWait(id string) <-chan FileReadResponse {
	ch := make(chan FileReadResponse, 1)
	fileReadMu.Lock()
	fileReadWaiters[id] = ch
	fileReadMu.Unlock()
	return ch
}

func ForgetFileReadWait(id string) {
	fileReadMu.Lock()
	delete(fileReadWaiters, id)
	fileReadMu.Unlock()
}

func DeliverFileReadResult(id string, tempPath, err string) {
	fileReadMu.Lock()
	ch, ok := fileReadWaiters[id]
	if ok {
		delete(fileReadWaiters, id)
	}
	fileReadMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- FileReadResponse{TempPath: tempPath, Err: err}:
	default:
	}
}
