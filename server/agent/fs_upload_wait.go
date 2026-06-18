package agent

import "sync"

type FsUploadEvent struct {
	UploadID      string `json:"upload_id"`
	Type          string `json:"type"` // "fs_upload_progress" | "fs_upload_done"
	ReceivedBytes int64  `json:"received_bytes,omitempty"`
	Ok            bool   `json:"ok"`
	Error         string `json:"error,omitempty"`
}

var fsUploadMu sync.Mutex
var fsUploadWaiters = make(map[string]chan FsUploadEvent)

func RegisterFsUploadWait(uploadID string) <-chan FsUploadEvent {
	ch := make(chan FsUploadEvent, 64)
	fsUploadMu.Lock()
	fsUploadWaiters[uploadID] = ch
	fsUploadMu.Unlock()
	return ch
}

func ForgetFsUploadWait(uploadID string) {
	fsUploadMu.Lock()
	ch, ok := fsUploadWaiters[uploadID]
	if ok {
		delete(fsUploadWaiters, uploadID)
	}
	fsUploadMu.Unlock()
	if ok {
		close(ch)
	}
}

func DeliverFsUploadEvent(uploadID string, ev FsUploadEvent) {
	fsUploadMu.Lock()
	ch, ok := fsUploadWaiters[uploadID]
	fsUploadMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- ev:
	default:
	}
}
