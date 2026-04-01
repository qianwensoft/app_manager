package agent

import "sync"

type FsListEntry struct {
	Name  string `json:"name"`
	Type  string `json:"type"` // "file" | "dir"
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"`
}

type FsListReply struct {
	Entries       []FsListEntry `json:"entries"`
	NextPageToken string        `json:"next_page_token,omitempty"`
	Err           string        `json:"error,omitempty"`
}

var fsListMu sync.Mutex
var fsListWaiters = make(map[string]chan FsListReply)

func RegisterFsListWait(requestID string) <-chan FsListReply {
	ch := make(chan FsListReply, 1)
	fsListMu.Lock()
	fsListWaiters[requestID] = ch
	fsListMu.Unlock()
	return ch
}

func ForgetFsListWait(requestID string) {
	fsListMu.Lock()
	delete(fsListWaiters, requestID)
	fsListMu.Unlock()
}

func DeliverFsListResult(requestID string, entries []FsListEntry, nextPageToken, errStr string) {
	fsListMu.Lock()
	ch, ok := fsListWaiters[requestID]
	if ok {
		delete(fsListWaiters, requestID)
	}
	fsListMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- FsListReply{Entries: entries, NextPageToken: nextPageToken, Err: errStr}:
	default:
	}
}

type FsDownloadReply struct {
	Data []byte
	Err  string
}

var fsDownloadMu sync.Mutex
var fsDownloadWaiters = make(map[string]chan FsDownloadReply)

func RegisterFsDownloadWait(requestID string) <-chan FsDownloadReply {
	ch := make(chan FsDownloadReply, 1)
	fsDownloadMu.Lock()
	fsDownloadWaiters[requestID] = ch
	fsDownloadMu.Unlock()
	return ch
}

func ForgetFsDownloadWait(requestID string) {
	fsDownloadMu.Lock()
	delete(fsDownloadWaiters, requestID)
	fsDownloadMu.Unlock()
}

func DeliverFsDownloadResult(requestID string, data []byte, errStr string) {
	fsDownloadMu.Lock()
	ch, ok := fsDownloadWaiters[requestID]
	if ok {
		delete(fsDownloadWaiters, requestID)
	}
	fsDownloadMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- FsDownloadReply{Data: data, Err: errStr}:
	default:
	}
}
