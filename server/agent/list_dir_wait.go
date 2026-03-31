package agent

import "sync"

// DirEntry Agent 端列目录的一条记录。
type DirEntry struct {
	Name       string `json:"name"`
	IsDir      bool   `json:"is_dir"`
	Size       int64  `json:"size"`
	ModifiedMs int64  `json:"modified_ms"`
}

// ListDirReply Web 等待 Agent 返回的目录列表。
type ListDirReply struct {
	Entries []DirEntry
	Err     string
}

var listDirMu sync.Mutex
var listDirWaiters = make(map[string]chan ListDirReply)

func RegisterListDirWait(id string) <-chan ListDirReply {
	ch := make(chan ListDirReply, 1)
	listDirMu.Lock()
	listDirWaiters[id] = ch
	listDirMu.Unlock()
	return ch
}

func ForgetListDirWait(id string) {
	listDirMu.Lock()
	delete(listDirWaiters, id)
	listDirMu.Unlock()
}

func DeliverListDirResult(id string, entries []DirEntry, err string) {
	listDirMu.Lock()
	ch, ok := listDirWaiters[id]
	if ok {
		delete(listDirWaiters, id)
	}
	listDirMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- ListDirReply{Entries: entries, Err: err}:
	default:
	}
}
